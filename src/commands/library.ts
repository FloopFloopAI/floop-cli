/**
 * `floop library list` — browse public projects
 * `floop library clone <id>` — clone a public project into your account
 */

import pc from "picocolors";

import { ApiClient } from "../api/client.js";
import {
  listLibrary,
  cloneLibraryProject,
  type LibraryProject,
} from "../api/library.js";
import { slugify } from "../util/project-ref.js";
import { handleCommandError, requireAuthedConfig } from "../util/errors.js";

// ─── list ──────────────────────────────────────────────────────────────────

export interface LibraryListOptions {
  botType?: string;
  search?: string;
  sort?: "popular" | "newest";
  limit?: string;
  json?: boolean;
}

export async function libraryListCommand(opts: LibraryListOptions): Promise<void> {
  const cfg = await requireAuthedConfig(opts);
  const client = new ApiClient({ baseUrl: cfg.apiUrl, token: cfg.token });

  const limit = opts.limit ? Number(opts.limit) : 20;

  try {
    const projects = await listLibrary(client, {
      botType: opts.botType,
      search: opts.search,
      sort: opts.sort,
      limit: Number.isFinite(limit) && limit > 0 ? Math.min(limit, 50) : 20,
    });

    if (opts.json) {
      console.log(JSON.stringify({ ok: true, projects }));
      return;
    }

    if (projects.length === 0) {
      console.log(pc.dim("No public projects match your filters."));
      return;
    }

    const wId = 36;
    const wName = Math.min(40, Math.max(4, ...projects.map((p) => p.name.length)));
    const pad = (s: string, w: number) => s.length >= w ? s.slice(0, w) : s + " ".repeat(w - s.length);

    console.log(`${pc.dim(pad("ID", wId))}  ${pc.dim(pad("NAME", wName))}  ${pc.dim("CLONES")}  ${pc.dim("TYPE")}`);
    for (const p of projects) {
      console.log(
        `${pad(p.id, wId)}  ${pad(p.name, wName)}  ${pc.dim(String(p.cloneCount).padStart(6))}  ${pc.dim(p.botType ?? "—")}`,
      );
    }
    console.log("");
    console.log(pc.dim(`Clone one with: floop library clone <id> [--subdomain <slug>]`));
  } catch (err) {
    handleCommandError(err, opts.json ?? false);
  }
}

// ─── clone ─────────────────────────────────────────────────────────────────

export interface LibraryCloneOptions {
  subdomain?: string;
  json?: boolean;
}

export async function libraryCloneCommand(
  projectId: string,
  opts: LibraryCloneOptions,
): Promise<void> {
  const cfg = await requireAuthedConfig(opts);
  const client = new ApiClient({ baseUrl: cfg.apiUrl, token: cfg.token });

  // If the user didn't specify a subdomain, derive one from the source
  // project's name via slugify (same rule `floop new` uses).
  let subdomain = opts.subdomain?.toLowerCase().trim();
  if (!subdomain) {
    try {
      const projects = await listLibrary(client, { limit: 50 });
      const source = projects.find((p) => p.id === projectId);
      if (source) subdomain = slugify(`${source.name} clone`);
    } catch {
      // fall through — backend will return a clear error if subdomain is required
    }
  }
  if (!subdomain) {
    console.error(pc.red("Could not derive a subdomain — pass --subdomain <slug>."));
    process.exit(1);
  }

  try {
    const cloned = await cloneLibraryProject(client, projectId, subdomain);

    if (opts.json) {
      console.log(JSON.stringify({ ok: true, project: cloned }));
      return;
    }
    console.log(pc.green(`✓ Cloned to ${pc.bold(cloned.subdomain ?? cloned.id)}`));
    console.log(pc.dim(`  Track its build with: floop status ${cloned.subdomain ?? cloned.id} --watch`));
  } catch (err) {
    handleCommandError(err, opts.json ?? false);
  }
}

export type { LibraryProject };
