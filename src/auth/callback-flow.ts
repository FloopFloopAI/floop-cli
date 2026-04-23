/**
 * Callback-flow login: spin up a local HTTP server on a random high port, ask
 * the server for an authorize URL, open the user's browser, wait for the
 * browser to redirect back to us with `?code=…&state=…`, then POST to
 * /api/cli/exchange to swap for a real CLI token.
 */

import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { AddressInfo } from "node:net";
import open from "open";
import pc from "picocolors";

import { ApiClient } from "../api/client.js";
import { FloopError } from "../api/errors.js";

interface StartCallbackResponse {
  state: string;
  authorizeUrl: string;
  expiresIn: number;
}

interface ExchangeResponse {
  token: string;
  tokenPrefix: string;
  tokenId: string;
  user: { id: string; email: string | null; name: string | null };
}

export interface CallbackFlowResult {
  token: string;
  tokenPrefix: string;
  user: { id: string; email: string | null; name: string | null };
}

const SUCCESS_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>floop CLI</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
         background: #fafafa; color: #111; display: flex; align-items: center;
         justify-content: center; min-height: 100vh; margin: 0; }
  .card { background: white; padding: 2.5rem 2rem; border-radius: 12px;
          box-shadow: 0 6px 24px rgba(0,0,0,0.08); text-align: center; max-width: 28rem; }
  h1 { margin: 0 0 0.5rem; font-size: 1.4rem; }
  p { margin: 0; color: #555; }
</style></head>
<body><div class="card">
  <h1>You're signed in to floop</h1>
  <p>Return to your terminal — you can close this tab.</p>
</div></body></html>`;

const ERROR_HTML = (msg: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>floop CLI</title></head>
<body style="font-family:sans-serif;padding:2rem">
<h1>Something went wrong</h1><p>${msg}</p></body></html>`;

export async function runCallbackFlow(
  client: ApiClient,
  deviceName: string,
  deviceOs: string,
): Promise<CallbackFlowResult> {
  // Listen on port 0 → kernel picks a free high port.
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const port = (server.address() as AddressInfo).port;

  // Tell the backend about the port + device, get the authorize URL.
  let started: StartCallbackResponse;
  try {
    started = await client.request<StartCallbackResponse>(
      "POST",
      "/api/cli/start-callback",
      { port, deviceName, deviceOs },
    );
  } catch (err) {
    server.close();
    throw err;
  }

  console.log(`Opening ${pc.cyan(started.authorizeUrl)} in your browser...`);
  console.log(pc.dim("If your browser doesn't open, paste the URL above."));

  // Race the browser open vs. the redirect arriving. open() can fail silently
  // on systems without a default browser handler — that's OK, the URL was printed.
  open(started.authorizeUrl).catch(() => {});

  const callback = await waitForCallback(server, started.state);
  server.close();

  // Swap the one-time code for a real token.
  const exchanged = await client.request<ExchangeResponse>(
    "POST",
    "/api/cli/exchange",
    { state: callback.state, code: callback.code },
  );

  return {
    token: exchanged.token,
    tokenPrefix: exchanged.tokenPrefix,
    user: exchanged.user,
  };
}

interface CallbackParams {
  code: string;
  state: string;
}

function waitForCallback(
  server: ReturnType<typeof createServer>,
  expectedState: string,
): Promise<CallbackParams> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(
        new FloopError({
          code: "EXPIRED_TOKEN",
          message: "Timed out waiting for browser approval (10 min)",
          status: 0,
        }),
      );
    }, 10 * 60 * 1000);

    const cleanup = () => {
      clearTimeout(timeout);
      server.removeListener("request", onRequest);
    };

    const onRequest = (req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url ?? "/", `http://127.0.0.1`);
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");

      if (!code || !state) {
        res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
        res.end(ERROR_HTML("Missing code or state in callback URL."));
        return;
      }

      if (state !== expectedState) {
        // CSRF protection: reject mismatched state, keep listening.
        res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
        res.end(ERROR_HTML("State mismatch. Run `floop login` again."));
        return;
      }

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(SUCCESS_HTML);
      cleanup();
      resolve({ code, state });
    };

    server.on("request", onRequest);
  });
}
