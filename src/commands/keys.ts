/**
 * `floop keys <list|create|rm>` — programmatic API key management.
 *
 * These are the `flp_…` keys used for CI/CD scripts, NOT the `flp_cli_…`
 * device tokens `floop login` produces. Different endpoint, different table,
 * different plan-gating (creating API keys requires the Business plan).
 */

import pc from "picocolors";

import { ApiClient } from "../api/client.js";
import {
  listApiKeys,
  createApiKey,
  revokeApiKey,
  type ApiKeySummary,
} from "../api/keys.js";
import { handleCommandError, requireAuthedConfig } from "../util/errors.js";

// ─── list ──────────────────────────────────────────────────────────────────

export interface KeysListOptions {
  json?: boolean;
}

export async function keysListCommand(opts: KeysListOptions): Promise<void> {
  const cfg = await requireAuthedConfig(opts);
  const client = new ApiClient({ baseUrl: cfg.apiUrl, token: cfg.token });

  try {
    const keys = await listApiKeys(client);

    if (opts.json) {
      console.log(JSON.stringify({ ok: true, keys }));
      return;
    }

    if (keys.length === 0) {
      console.log(pc.dim("No API keys yet. Try `floop keys create \"my-ci-key\"`"));
      return;
    }

    const wName = Math.max(4, ...keys.map((k) => k.name.length));
    const pad = (s: string, w: number) => s + " ".repeat(Math.max(0, w - s.length));

    console.log(`${pc.dim(pad("NAME", wName))}  ${pc.dim("PREFIX")}         ${pc.dim("LAST USED")}       ${pc.dim("CREATED")}`);
    for (const k of keys) {
      console.log(
        `${pad(k.name, wName)}  ${pc.dim(k.keyPrefix + "…")} ${pc.dim(formatDate(k.lastUsedAt))}  ${pc.dim(formatDate(k.createdAt))}`,
      );
    }
  } catch (err) {
    handleCommandError(err, opts.json ?? false);
  }
}

// ─── create ────────────────────────────────────────────────────────────────

export interface KeysCreateOptions {
  json?: boolean;
}

export async function keysCreateCommand(
  name: string,
  opts: KeysCreateOptions,
): Promise<void> {
  const cfg = await requireAuthedConfig(opts);
  const client = new ApiClient({ baseUrl: cfg.apiUrl, token: cfg.token });

  if (!name.trim() || name.length > 100) {
    console.error(pc.red("Name is required (1–100 chars)."));
    process.exit(1);
  }

  try {
    const issued = await createApiKey(client, name.trim());

    if (opts.json) {
      console.log(JSON.stringify({ ok: true, key: issued }));
      return;
    }

    console.log("");
    console.log(pc.green(`✓ Created ${pc.bold(name)}`));
    console.log("");
    console.log(pc.yellow("  This is the ONLY time the raw key will be shown. Copy it now:"));
    console.log("");
    console.log(`    ${pc.bold(issued.rawKey)}`);
    console.log("");
    console.log(pc.dim(`  Use in CI: export FLOOP_TOKEN=${issued.rawKey}`));
    console.log("");
  } catch (err) {
    handleCommandError(err, opts.json ?? false);
  }
}

// ─── rm ────────────────────────────────────────────────────────────────────

export interface KeysRmOptions {
  json?: boolean;
}

export async function keysRmCommand(
  ref: string,
  opts: KeysRmOptions,
): Promise<void> {
  const cfg = await requireAuthedConfig(opts);
  const client = new ApiClient({ baseUrl: cfg.apiUrl, token: cfg.token });

  try {
    // Resolve ref: accept either an id (UUID) or a name.
    let keyId = ref;
    if (!isUuid(ref)) {
      const keys = await listApiKeys(client);
      const match = keys.find((k) => k.name === ref);
      if (!match) {
        console.error(pc.red(`No API key found matching "${ref}" (looked by id and by name).`));
        process.exit(1);
      }
      keyId = match.id;
    }

    await revokeApiKey(client, keyId);

    if (opts.json) {
      console.log(JSON.stringify({ ok: true, keyId }));
    } else {
      console.log(pc.green(`✓ Revoked ${pc.bold(ref)}`));
    }
  } catch (err) {
    handleCommandError(err, opts.json ?? false);
  }
}

// ─── helpers ──────────────────────────────────────────────────────────────

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}

function formatDate(iso: string | null): string {
  if (!iso) return "never";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export type { ApiKeySummary };
