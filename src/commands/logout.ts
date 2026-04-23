import pc from "picocolors";

import { ApiClient } from "../api/client.js";
import { FloopError } from "../api/errors.js";
import { resolveConfig, clearStoredToken } from "../config.js";

export interface LogoutOptions {
  json?: boolean;
}

export async function logoutCommand(opts: LogoutOptions): Promise<void> {
  const cfg = await resolveConfig();

  if (!cfg.token) {
    if (opts.json) {
      console.log(JSON.stringify({ ok: true, alreadyLoggedOut: true }));
    } else {
      console.log(pc.dim("Not logged in. Nothing to do."));
    }
    return;
  }

  // Best-effort server-side revocation. If the network is down or the token
  // was already revoked, we still clear the local copy so `logout` is
  // idempotent and never leaves the user in a half-state.
  const client = new ApiClient({ baseUrl: cfg.apiUrl, token: cfg.token });
  try {
    await client.request("POST", "/api/cli/revoke");
  } catch (err) {
    // Surface network errors but proceed with local clear.
    if (err instanceof FloopError && err.code !== "NETWORK_ERROR") {
      // Auth errors here mean the token is already invalid server-side — fine.
    } else if (!(err instanceof FloopError)) {
      // Unknown error, log it but keep going.
      if (!opts.json) {
        console.error(pc.dim(`(server-side revoke failed: ${(err as Error).message})`));
      }
    }
  }

  await clearStoredToken();

  if (opts.json) {
    console.log(JSON.stringify({ ok: true }));
  } else {
    console.log(pc.green("✓ Logged out"));
  }
}
