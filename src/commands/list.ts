import pc from "picocolors";

import { ApiClient } from "../api/client.js";
import { listProjects } from "../api/projects.js";
import { handleCommandError, requireAuthedConfig } from "../util/errors.js";

export interface ListOptions {
  team?: string;
  json?: boolean;
}

export async function listCommand(opts: ListOptions): Promise<void> {
  const cfg = await requireAuthedConfig(opts);
  const client = new ApiClient({ baseUrl: cfg.apiUrl, token: cfg.token });

  try {
    const projects = await listProjects(client, { teamId: opts.team });

    if (opts.json) {
      console.log(JSON.stringify({ ok: true, projects }));
      return;
    }

    if (projects.length === 0) {
      console.log(pc.dim("No projects yet. Try `floop new \"...\"`"));
      return;
    }

    // Compute column widths.
    const rows = projects.map((p) => ({
      subdomain: p.subdomain ?? "(none)",
      status: p.status,
      name: p.name,
      url: p.url ?? (p.subdomain ? `https://${p.subdomain}.floop.tech` : ""),
      id: p.id,
    }));
    const wSub = Math.min(30, Math.max(9, ...rows.map((r) => r.subdomain.length)));
    const wStatus = Math.max(6, ...rows.map((r) => r.status.length));
    const wName = Math.min(40, Math.max(4, ...rows.map((r) => r.name.length)));

    const pad = (s: string, w: number) => s.length >= w ? s.slice(0, w) : s + " ".repeat(w - s.length);

    console.log(`${pc.dim(pad("SUBDOMAIN", wSub))}  ${pc.dim(pad("STATUS", wStatus))}  ${pc.dim(pad("NAME", wName))}  ${pc.dim("URL")}`);
    for (const r of rows) {
      console.log(`${pad(r.subdomain, wSub)}  ${colourStatus(r.status, wStatus)}  ${pad(r.name, wName)}  ${pc.cyan(r.url)}`);
    }
  } catch (err) {
    handleCommandError(err, opts.json ?? false);
  }
}

function colourStatus(status: string, w: number): string {
  const padded = status.padEnd(w);
  switch (status) {
    case "live":
      return pc.green(padded);
    case "failed":
    case "cancelled":
      return pc.red(padded);
    case "queued":
    case "generating":
    case "deploying":
      return pc.yellow(padded);
    default:
      return pc.dim(padded);
  }
}
