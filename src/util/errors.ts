/**
 * Shared error renderer for commands. Centralised so every command exits with
 * the same exit codes and prints consistent diagnostics.
 */

import pc from "picocolors";
import { FloopError } from "../api/errors.js";
import { resolveConfig, type ResolvedConfig } from "../config.js";

/**
 * Resolve config and bail (exit 2) if there's no token. Used by every
 * command that needs authentication. Honours --json for CI-friendly output.
 */
export async function requireAuthedConfig(opts: { json?: boolean }): Promise<ResolvedConfig & { token: string }> {
  const cfg = await resolveConfig();
  if (!cfg.token) {
    if (opts.json) {
      console.error(JSON.stringify({ ok: false, error: { code: "NOT_LOGGED_IN", message: "Not logged in. Run `floop login` first." } }));
    } else {
      console.error(pc.red("Not logged in. Run `floop login` first."));
    }
    process.exit(2);
  }
  return cfg as ResolvedConfig & { token: string };
}

export function handleCommandError(err: unknown, json: boolean): never {
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
