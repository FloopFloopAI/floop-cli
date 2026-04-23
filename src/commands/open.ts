import open from "open";
import pc from "picocolors";

import { ApiClient } from "../api/client.js";
import { resolveProject } from "../util/project-ref.js";
import { handleCommandError, requireAuthedConfig } from "../util/errors.js";

export interface OpenOptions {
  json?: boolean;
}

export async function openCommand(ref: string, opts: OpenOptions): Promise<void> {
  const cfg = await requireAuthedConfig(opts);
  const client = new ApiClient({ baseUrl: cfg.apiUrl, token: cfg.token });

  try {
    const project = await resolveProject(client, ref);
    const url = project.url ?? (project.subdomain ? `https://${project.subdomain}.floop.tech` : null);
    if (!url) {
      console.error(pc.red(`No live URL yet for ${ref} (status: ${project.status})`));
      process.exit(1);
    }

    if (opts.json) {
      console.log(JSON.stringify({ ok: true, url }));
      return;
    }
    console.log(`Opening ${pc.cyan(url)}...`);
    await open(url);
  } catch (err) {
    handleCommandError(err, opts.json ?? false);
  }
}
