import pc from "picocolors";

import { ApiClient } from "../api/client.js";
import { getProjectStatus, TERMINAL_STATUSES } from "../api/projects.js";
import { resolveProject } from "../util/project-ref.js";
import { handleCommandError, requireAuthedConfig } from "../util/errors.js";

export interface StatusOptions {
  watch?: boolean;
  json?: boolean;
}

export async function statusCommand(ref: string, opts: StatusOptions): Promise<void> {
  const cfg = await requireAuthedConfig(opts);
  const client = new ApiClient({ baseUrl: cfg.apiUrl, token: cfg.token });

  try {
    const project = await resolveProject(client, ref);

    if (opts.watch && !opts.json) {
      await watchLoop(client, project.id);
      return;
    }

    const s = await getProjectStatus(client, project.id);
    if (opts.json) {
      console.log(JSON.stringify({ ok: true, project: { id: project.id, subdomain: project.subdomain, name: project.name }, status: s }));
      return;
    }
    printStatus(project.subdomain ?? project.id, s);
  } catch (err) {
    handleCommandError(err, opts.json ?? false);
  }
}

async function watchLoop(client: ApiClient, projectId: string): Promise<void> {
  const POLL_MS = 3000;
  let lastLine = "";
  const isTty = process.stdout.isTTY;
  while (true) {
    const s = await getProjectStatus(client, projectId);
    const line = renderLine(s);
    if (isTty) {
      if (line !== lastLine) {
        process.stdout.write(`\r\x1b[K${line}`);
        lastLine = line;
      }
    } else {
      console.log(line);
    }
    if (TERMINAL_STATUSES.has(s.status)) {
      if (isTty) process.stdout.write("\n");
      return;
    }
    await sleep(POLL_MS);
  }
}

function printStatus(label: string, s: { step: number; totalSteps: number; status: string; message: string; queuePosition?: number }) {
  console.log(`${pc.bold(label)}`);
  console.log(`  ${pc.dim("status:")} ${colourStatus(s.status)}`);
  if (s.queuePosition) console.log(`  ${pc.dim("queue: ")} #${s.queuePosition}`);
  console.log(`  ${pc.dim("step:  ")} ${s.step}/${s.totalSteps}`);
  if (s.message) console.log(`  ${pc.dim("info:  ")} ${s.message}`);
}

function renderLine(s: { step: number; totalSteps: number; status: string; message: string; queuePosition?: number }): string {
  const total = Math.max(s.totalSteps || 6, 1);
  const step = Math.min(Math.max(s.step || 0, 0), total);
  const filled = "█".repeat(step);
  const empty = "░".repeat(total - step);
  const head = s.queuePosition
    ? `Queued #${s.queuePosition}`
    : `Step ${step}/${total}`;
  return `${pc.cyan(filled)}${pc.dim(empty)}  ${pc.bold(head)} ${colourStatus(s.status)}${s.message ? pc.dim(`: ${s.message}`) : ""}`;
}

function colourStatus(status: string): string {
  switch (status) {
    case "live":
      return pc.green(status);
    case "failed":
    case "cancelled":
      return pc.red(status);
    case "queued":
    case "generating":
    case "deploying":
    case "processing":
      return pc.yellow(status);
    default:
      return pc.dim(status);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
