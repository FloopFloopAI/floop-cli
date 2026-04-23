import pc from "picocolors";

import { ApiClient } from "../api/client.js";
import {
  createProject,
  getProjectStatus,
  TERMINAL_STATUSES,
  type BotType,
} from "../api/projects.js";
import { slugify } from "../util/project-ref.js";
import { handleCommandError, requireAuthedConfig } from "../util/errors.js";
import { FloopError } from "../api/errors.js";

const VALID_BOT_TYPES = new Set(["site", "app", "bot", "api", "internal", "game"]);

export interface NewOptions {
  name?: string;
  subdomain?: string;
  botType?: string;
  team?: string;
  noWait?: boolean;
  json?: boolean;
}

export async function newCommand(prompt: string, opts: NewOptions): Promise<void> {
  const cfg = await requireAuthedConfig(opts);
  const client = new ApiClient({ baseUrl: cfg.apiUrl, token: cfg.token });

  const trimmedPrompt = prompt.trim();
  if (!trimmedPrompt) {
    console.error(pc.red("Prompt is required."));
    process.exit(1);
  }

  const name = opts.name?.trim() || derivedName(trimmedPrompt);
  const subdomain = (opts.subdomain || slugify(name)).toLowerCase();

  if (opts.botType && !VALID_BOT_TYPES.has(opts.botType)) {
    console.error(pc.red(`Invalid --bot-type. Use one of: ${[...VALID_BOT_TYPES].join(", ")}`));
    process.exit(1);
  }

  try {
    const created = await createProject(client, {
      name,
      subdomain,
      prompt: trimmedPrompt,
      botType: opts.botType as BotType | undefined,
      teamId: opts.team,
    });

    if (!opts.json) {
      console.log("");
      console.log(pc.green(`✓ Project created`));
      console.log(`  ${pc.dim("name:     ")}${created.project.name}`);
      console.log(`  ${pc.dim("id:       ")}${created.project.id}`);
      console.log(`  ${pc.dim("subdomain:")}${created.project.subdomain}`);
      console.log(`  ${pc.dim("type:     ")}${created.project.botType ?? "—"}`);
      console.log("");
    }

    if (opts.noWait) {
      if (opts.json) {
        console.log(JSON.stringify({ ok: true, project: created.project, deployment: created.deployment }));
      } else {
        console.log(pc.dim(`(not waiting; check progress with \`floop status ${created.project.subdomain ?? created.project.id}\`)`));
      }
      return;
    }

    // Default: wait for build to terminal state.
    const final = await waitForBuild(client, created.project.id, opts.json);
    if (opts.json) {
      console.log(JSON.stringify({
        ok: final.status === "live",
        project: created.project,
        deployment: created.deployment,
        finalStatus: final.status,
        url: final.url,
      }));
      return;
    }

    if (final.status === "live") {
      console.log("");
      console.log(pc.green(`✓ Live at ${pc.bold(pc.cyan(final.url ?? "(no URL yet)"))}`));
    } else {
      console.log("");
      console.log(pc.red(`✗ Build ended with status: ${final.status}`));
      if (final.message) console.log(pc.dim(`  ${final.message}`));
      process.exit(1);
    }
  } catch (err) {
    handleCommandError(err, opts.json ?? false);
  }
}

function derivedName(prompt: string): string {
  // Crude but adequate: first 6 words, capitalised.
  const words = prompt
    .replace(/[\n\r]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6);
  if (words.length === 0) return "Untitled project";
  const phrase = words.join(" ").slice(0, 60);
  return phrase[0].toUpperCase() + phrase.slice(1);
}

async function waitForBuild(
  client: ApiClient,
  projectId: string,
  json: boolean | undefined,
): Promise<{ status: string; message: string; url: string | null }> {
  const POLL_MS = 3000;
  const isTty = process.stdout.isTTY && !json;
  let lastLine = "";

  while (true) {
    let s;
    try {
      s = await getProjectStatus(client, projectId);
    } catch (err) {
      // 404 here briefly is possible right after create; treat as transient.
      if (err instanceof FloopError && err.code === "NOT_FOUND") {
        await sleep(POLL_MS);
        continue;
      }
      throw err;
    }

    if (isTty) {
      const line = renderProgress(s);
      if (line !== lastLine) {
        process.stdout.write(`\r\x1b[K${line}`);
        lastLine = line;
      }
    }

    if (TERMINAL_STATUSES.has(s.status)) {
      if (isTty) process.stdout.write("\n");
      // Re-fetch project for url field via list — status endpoint doesn't include it.
      const url = await fetchLiveUrl(client, projectId);
      return { status: s.status, message: s.message, url };
    }

    await sleep(POLL_MS);
  }
}

async function fetchLiveUrl(client: ApiClient, projectId: string): Promise<string | null> {
  // Cheaper than refactoring: list user's projects and pick one.
  const projects = await client.request<Array<{ id: string; url: string | null; subdomain: string | null }>>("GET", "/api/v1/projects");
  const found = projects.find((p) => p.id === projectId);
  if (!found) return null;
  if (found.url) return found.url;
  if (found.subdomain) return `https://${found.subdomain}.floop.tech`;
  return null;
}

function renderProgress(s: { step: number; totalSteps: number; status: string; message: string; queuePosition?: number }): string {
  const total = Math.max(s.totalSteps || 6, 1);
  const step = Math.min(Math.max(s.step || 0, 0), total);
  const filled = "█".repeat(step);
  const empty = "░".repeat(total - step);
  const head = s.queuePosition
    ? `Queued #${s.queuePosition}`
    : `Step ${step}/${total}`;
  return `${pc.cyan(filled)}${pc.dim(empty)}  ${pc.bold(head)} ${pc.dim(`— ${s.status}`)}${s.message ? pc.dim(`: ${s.message}`) : ""}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
