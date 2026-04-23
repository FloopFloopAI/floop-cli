import os from "node:os";
import pc from "picocolors";

import { ApiClient } from "../api/client.js";
import { FloopError } from "../api/errors.js";
import { resolveConfig, persistLogin } from "../config.js";
import { runCallbackFlow } from "../auth/callback-flow.js";
import { runDeviceFlow } from "../auth/device-flow.js";

export interface LoginOptions {
  device?: boolean;
  json?: boolean;
}

export async function loginCommand(opts: LoginOptions): Promise<void> {
  const cfg = await resolveConfig();
  const client = new ApiClient({ baseUrl: cfg.apiUrl });

  // os.platform() returns 'darwin' | 'win32' | 'linux' (etc.) — matches the
  // backend's ALLOWED_OS set exactly.
  const platform = os.platform();
  const deviceOs =
    platform === "darwin" || platform === "win32" || platform === "linux"
      ? platform
      : "linux"; // unknown platforms get bucketed as linux for the validator
  const deviceName = os.hostname() || "unknown";

  try {
    const result = opts.device
      ? await runDeviceFlow(client, deviceName, deviceOs)
      : await runCallbackFlow(client, deviceName, deviceOs);

    await persistLogin({
      apiUrl: cfg.apiUrl,
      token: result.token,
      tokenPrefix: result.tokenPrefix,
      user: result.user,
    });

    if (opts.json) {
      console.log(JSON.stringify({
        ok: true,
        user: result.user,
        tokenPrefix: result.tokenPrefix,
      }));
    } else {
      const who = result.user.email ?? result.user.name ?? result.user.id;
      console.log("");
      console.log(pc.green(`✓ Logged in as ${pc.bold(who)}`));
      console.log(pc.dim(`  Token saved to ~/.floop/config.json`));
    }
  } catch (err) {
    handleError(err, opts.json ?? false);
  }
}

function handleError(err: unknown, json: boolean): never {
  if (err instanceof FloopError) {
    if (json) {
      console.error(JSON.stringify({
        ok: false,
        error: { code: err.code, message: err.message, requestId: err.requestId },
      }));
    } else {
      console.error("");
      console.error(pc.red(`✗ ${err.message}`));
      if (err.requestId) {
        console.error(pc.dim(`  Request ID: ${err.requestId}`));
      }
    }
    process.exit(err.exitCode());
  }
  if (json) {
    console.error(JSON.stringify({ ok: false, error: { message: String(err) } }));
  } else {
    console.error(pc.red(`✗ ${err instanceof Error ? err.message : String(err)}`));
  }
  process.exit(1);
}
