import pc from "picocolors";

import { ApiClient } from "../api/client.js";
import { reactivateProject } from "../api/projects.js";
import { resolveProject } from "../util/project-ref.js";
import { handleCommandError, requireAuthedConfig } from "../util/errors.js";

export interface ReactivateOptions {
  json?: boolean;
}

export async function reactivateCommand(ref: string, opts: ReactivateOptions): Promise<void> {
  const cfg = await requireAuthedConfig(opts);
  const client = new ApiClient({ baseUrl: cfg.apiUrl, token: cfg.token });

  try {
    const project = await resolveProject(client, ref);
    await reactivateProject(client, project.id);
    if (opts.json) {
      console.log(JSON.stringify({ ok: true, projectId: project.id }));
    } else {
      console.log(pc.green(`✓ Reactivated ${pc.bold(project.subdomain ?? project.id)}`));
    }
  } catch (err) {
    handleCommandError(err, opts.json ?? false);
  }
}
