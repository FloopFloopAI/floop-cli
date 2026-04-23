/**
 * `floop secrets <list|set|rm> <project>` — manage project secrets.
 *
 * Values are write-only on the server side: list returns metadata only
 * (key, last-4 of the value, timestamps), set accepts plaintext but the
 * API never echoes it back, rm deletes by key.
 *
 * The set subcommand reads the value from a flag, an env var, or stdin
 * (in that priority order). Reading from a flag puts the value in shell
 * history; the docs nudge users toward stdin or env vars for sensitive
 * values.
 */

import pc from "picocolors";

import { ApiClient } from "../api/client.js";
import {
  listProjectSecrets,
  setProjectSecret,
  deleteProjectSecret,
  type ProjectSecretSummary,
} from "../api/projects.js";
import { resolveProject } from "../util/project-ref.js";
import { handleCommandError, requireAuthedConfig } from "../util/errors.js";

export interface SecretsListOptions {
  json?: boolean;
}

export interface SecretsSetOptions {
  value?: string;
  fromEnv?: string;
  json?: boolean;
}

export interface SecretsRmOptions {
  json?: boolean;
}

// ─── list ──────────────────────────────────────────────────────────────────

export async function secretsListCommand(
  ref: string,
  opts: SecretsListOptions,
): Promise<void> {
  const cfg = await requireAuthedConfig(opts);
  const client = new ApiClient({ baseUrl: cfg.apiUrl, token: cfg.token });

  try {
    const project = await resolveProject(client, ref);
    const secrets = await listProjectSecrets(client, project.id);

    if (opts.json) {
      console.log(JSON.stringify({ ok: true, project: { id: project.id, subdomain: project.subdomain }, secrets }));
      return;
    }

    if (secrets.length === 0) {
      console.log(pc.dim("No secrets set for this project."));
      console.log(pc.dim(`Try: floop secrets set ${ref} MY_KEY`));
      return;
    }

    const wKey = Math.max(3, ...secrets.map((s) => s.key.length));
    const pad = (s: string, w: number) => s + " ".repeat(Math.max(0, w - s.length));

    console.log(`${pc.dim(pad("KEY", wKey))}  ${pc.dim("VALUE")}            ${pc.dim("UPDATED")}`);
    for (const s of secrets) {
      console.log(`${pad(s.key, wKey)}  ${pc.dim("…" + s.lastFour + "         ")} ${pc.dim(formatDate(s.updatedAt))}`);
    }
  } catch (err) {
    handleCommandError(err, opts.json ?? false);
  }
}

// ─── set ───────────────────────────────────────────────────────────────────

export async function secretsSetCommand(
  ref: string,
  key: string,
  opts: SecretsSetOptions,
): Promise<void> {
  const cfg = await requireAuthedConfig(opts);
  const client = new ApiClient({ baseUrl: cfg.apiUrl, token: cfg.token });

  // Resolve the value: --value > --from-env > stdin.
  let value: string;
  if (typeof opts.value === "string") {
    value = opts.value;
  } else if (typeof opts.fromEnv === "string") {
    const v = process.env[opts.fromEnv];
    if (v === undefined) {
      console.error(pc.red(`Env var ${opts.fromEnv} is not set.`));
      process.exit(1);
    }
    value = v;
  } else {
    if (!opts.json) {
      console.log(pc.dim(`Reading value for ${pc.bold(key)} from stdin (Ctrl+D when done)...`));
    }
    value = await readStdin();
  }

  if (value === "") {
    console.error(pc.red("Value is empty — refusing to set an empty secret."));
    process.exit(1);
  }

  try {
    const project = await resolveProject(client, ref);
    const secret = await setProjectSecret(client, project.id, key, value);
    if (opts.json) {
      console.log(JSON.stringify({ ok: true, secret }));
    } else {
      console.log(pc.green(`✓ ${pc.bold(secret.key)} set on ${pc.bold(project.subdomain ?? project.id)}`));
      console.log(pc.dim(`  ends in …${secret.lastFour}`));
    }
  } catch (err) {
    handleCommandError(err, opts.json ?? false);
  }
}

// ─── rm ────────────────────────────────────────────────────────────────────

export async function secretsRmCommand(
  ref: string,
  key: string,
  opts: SecretsRmOptions,
): Promise<void> {
  const cfg = await requireAuthedConfig(opts);
  const client = new ApiClient({ baseUrl: cfg.apiUrl, token: cfg.token });

  try {
    const project = await resolveProject(client, ref);
    const result = await deleteProjectSecret(client, project.id, key);
    if (opts.json) {
      console.log(JSON.stringify({ ok: true, ...result }));
      return;
    }
    if (result.existed) {
      console.log(pc.green(`✓ Removed ${pc.bold(key)} from ${pc.bold(project.subdomain ?? project.id)}`));
    } else {
      console.log(pc.dim(`No secret named ${key} on ${project.subdomain ?? project.id} — nothing to do.`));
    }
  } catch (err) {
    handleCommandError(err, opts.json ?? false);
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data.replace(/\r?\n$/, ""))); // strip trailing newline
    process.stdin.on("error", reject);
  });
}

// Re-export type for index.ts convenience.
export type { ProjectSecretSummary };
