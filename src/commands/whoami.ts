import pc from "picocolors";

import { ApiClient } from "../api/client.js";
import { FloopError } from "../api/errors.js";
import { resolveConfig } from "../config.js";

export interface WhoamiOptions {
  json?: boolean;
}

interface MeResponse {
  id: string;
  email: string | null;
  name: string | null;
  role: string;
  source: "api_key" | "cli";
}

export async function whoamiCommand(opts: WhoamiOptions): Promise<void> {
  const cfg = await resolveConfig();
  if (!cfg.token) {
    if (opts.json) {
      console.error(JSON.stringify({ ok: false, error: { code: "NOT_LOGGED_IN" } }));
    } else {
      console.error(pc.red("Not logged in. Run `floop login` first."));
    }
    process.exit(2);
  }

  const client = new ApiClient({ baseUrl: cfg.apiUrl, token: cfg.token });
  try {
    const me = await client.request<MeResponse>("GET", "/api/v1/user/me");
    if (opts.json) {
      console.log(JSON.stringify({ ok: true, user: me }));
    } else {
      console.log(`${pc.dim("User: ")}${pc.bold(me.email ?? me.name ?? me.id)}`);
      console.log(`${pc.dim("Role: ")}${me.role}`);
      console.log(`${pc.dim("API:  ")}${cfg.apiUrl}`);
      console.log(`${pc.dim("Auth: ")}${me.source}`);
    }
  } catch (err) {
    if (err instanceof FloopError) {
      if (opts.json) {
        console.error(JSON.stringify({
          ok: false,
          error: { code: err.code, message: err.message, requestId: err.requestId },
        }));
      } else {
        console.error(pc.red(`✗ ${err.message}`));
        if (err.requestId) console.error(pc.dim(`  Request ID: ${err.requestId}`));
      }
      process.exit(err.exitCode());
    }
    throw err;
  }
}
