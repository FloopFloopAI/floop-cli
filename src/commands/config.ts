/**
 * `floop config get [<key>]` — show all settings or one key
 * `floop config set <key> <value>` — set a setting
 *
 * Today supported keys: `apiUrl`, `telemetry`. Token storage is managed
 * separately by `floop login` / `floop logout`; intentionally NOT writeable
 * via `config set` to avoid users pasting tokens that could leak via shell
 * history.
 */

import pc from "picocolors";
import crypto from "node:crypto";

import { readConfig, writeConfig } from "../config.js";

const SETTABLE_KEYS = new Set(["apiUrl", "telemetry"]);

export interface ConfigGetOptions {
  json?: boolean;
}

export async function configGetCommand(
  key: string | undefined,
  opts: ConfigGetOptions,
): Promise<void> {
  const cfg = await readConfig();

  // Redact secret-ish fields when printing.
  const safe = {
    apiUrl: cfg.apiUrl ?? "(default: https://www.floopfloop.com)",
    telemetry: cfg.telemetry ?? "(not set; default: off)",
    token: cfg.token ? `${cfg.tokenPrefix ?? "flp_…"} (set)` : "(not logged in)",
    user: cfg.user?.email ?? "(not logged in)",
    anonymousId: cfg.anonymousId ?? "(not set)",
  };

  if (key) {
    const value = (safe as Record<string, unknown>)[key];
    if (value === undefined) {
      console.error(pc.red(`Unknown config key: ${key}. Try one of: ${Object.keys(safe).join(", ")}`));
      process.exit(1);
    }
    if (opts.json) {
      console.log(JSON.stringify({ ok: true, [key]: value }));
    } else {
      console.log(value);
    }
    return;
  }

  if (opts.json) {
    console.log(JSON.stringify({ ok: true, config: safe }));
    return;
  }
  for (const [k, v] of Object.entries(safe)) {
    console.log(`${pc.dim(k.padEnd(14))} ${v}`);
  }
}

export interface ConfigSetOptions {
  json?: boolean;
}

export async function configSetCommand(
  key: string,
  value: string,
  opts: ConfigSetOptions,
): Promise<void> {
  if (!SETTABLE_KEYS.has(key)) {
    console.error(pc.red(`Cannot set ${key}. Settable keys: ${[...SETTABLE_KEYS].join(", ")}`));
    process.exit(1);
  }

  const cfg = await readConfig();

  if (key === "telemetry") {
    const optIn = /^(true|yes|y|on|1)$/i.test(value);
    cfg.telemetry = optIn;
    if (optIn && !cfg.anonymousId) {
      cfg.anonymousId = crypto.randomBytes(16).toString("hex");
    }
  } else if (key === "apiUrl") {
    if (!/^https?:\/\//.test(value)) {
      console.error(pc.red(`apiUrl must start with http:// or https://`));
      process.exit(1);
    }
    cfg.apiUrl = value;
  }

  await writeConfig(cfg);

  if (opts.json) {
    console.log(JSON.stringify({ ok: true, [key]: cfg[key as "apiUrl" | "telemetry"] }));
  } else {
    console.log(pc.green(`✓ ${key} = ${cfg[key as "apiUrl" | "telemetry"]}`));
  }
}
