import pc from "picocolors";

import { ApiClient } from "../api/client.js";
import { getProjectStatus, reactivateProject, TERMINAL_STATUSES } from "../api/projects.js";
import { resolveProject } from "../util/project-ref.js";
import { handleCommandError, requireAuthedConfig } from "../util/errors.js";

export interface ReactivateOptions {
  json?: boolean;
  watch?: boolean;
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

    if (opts.watch) {
      await pollUntilTerminal(client, project.id, opts.json ?? false);
    }
  } catch (err) {
    handleCommandError(err, opts.json ?? false);
  }
}

async function pollUntilTerminal(
  client: ApiClient,
  projectId: string,
  json: boolean,
): Promise<void> {
  const POLL_MS = 3000;
  let lastKey = "";
  while (true) {
    const s = await getProjectStatus(client, projectId);
    const key = `${s.status}|${s.step}|${s.message}`;
    if (key !== lastKey) {
      lastKey = key;
      if (json) {
        console.log(JSON.stringify({ ok: true, event: s }));
      } else {
        const stamp = new Date().toLocaleTimeString();
        const step = s.step ? ` step ${s.step}/${s.totalSteps ?? "?"}` : "";
        console.log(pc.dim(`[${stamp}]`) + ` [${s.status}]${step} ${s.message ?? ""}`);
      }
    }
    if (TERMINAL_STATUSES.has(s.status)) return;
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}
