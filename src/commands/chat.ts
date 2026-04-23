/**
 * `floop chat [<project>]` — interactive REPL bound to one project.
 *
 * Each user message goes through the existing /api/v1/projects/:id/refine
 * endpoint. The backend doesn't stream tokens (there's no chat assistant
 * that talks back), so the REPL surfaces what the web UI surfaces:
 *   - "Refinement queued"
 *   - live progress bar against the build (Step N/6)
 *   - "Live at https://…" + the new deployment version
 *
 * Slash commands: /exit, /help, /status, /open, /clear, /attach <file>
 *
 * With no project arg, drops into a picker over the user's projects.
 */

import readline from "node:readline";
import open from "open";
import pc from "picocolors";

import { ApiClient } from "../api/client.js";
import { FloopError } from "../api/errors.js";
import {
  getProjectStatus,
  listProjects,
  TERMINAL_STATUSES,
  type Project,
} from "../api/projects.js";
import {
  refineProject,
  getConversations,
  type ConversationMessage,
} from "../api/chat.js";
import {
  uploadAttachment,
  type UploadedAttachment,
} from "../api/uploads.js";
import { resolveProject } from "../util/project-ref.js";
import { handleCommandError, requireAuthedConfig } from "../util/errors.js";

export interface ChatOptions {
  json?: boolean;
}

export async function chatCommand(
  ref: string | undefined,
  opts: ChatOptions,
): Promise<void> {
  const cfg = await requireAuthedConfig(opts);
  const client = new ApiClient({ baseUrl: cfg.apiUrl, token: cfg.token });

  if (opts.json) {
    console.error(JSON.stringify({ ok: false, error: { code: "INVALID_USAGE", message: "`floop chat` is interactive — `--json` is not supported" } }));
    process.exit(1);
  }

  let project: Project;
  try {
    project = ref
      ? await resolveProject(client, ref)
      : await pickProject(client);
  } catch (err) {
    handleCommandError(err, false);
  }

  printChatHeader(project);

  // Note the high-water-mark of conversation history at REPL open. Each
  // round, after the build finishes, we fetch conversations and render only
  // the new entries past this mark. Avoids re-printing past history.
  let lastSeenAt = new Date().toISOString();

  // Attachments pile up from /attach until the next message is sent. After
  // send they're cleared.
  const pendingAttachments: UploadedAttachment[] = [];

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: pc.cyan("you ▸ "),
    terminal: true,
  });
  rl.prompt();

  // Holds the in-flight build cancel handle, if any. Ctrl+C while a build is
  // streaming aborts that build but keeps the REPL running.
  let cancelInFlight: AbortController | null = null;

  rl.on("SIGINT", () => {
    if (cancelInFlight) {
      cancelInFlight.abort();
      cancelInFlight = null;
      console.log(pc.dim("\n(stopped watching — build continues server-side; /status to check)"));
      rl.prompt();
      return;
    }
    console.log("");
    rl.close();
  });

  rl.on("close", () => {
    console.log(pc.dim("\nGoodbye 👋"));
    process.exit(0);
  });

  rl.on("line", async (raw) => {
    const line = raw.trim();
    if (!line) {
      rl.prompt();
      return;
    }

    // ─── Slash commands ────────────────────────────────────────────────
    if (line.startsWith("/")) {
      const [cmd, ...rest] = line.slice(1).split(/\s+/);
      const arg = rest.join(" ");
      switch (cmd.toLowerCase()) {
        case "exit":
        case "quit":
          rl.close();
          return;
        case "help":
          printHelp();
          break;
        case "clear":
          process.stdout.write("\x1b[2J\x1b[H");
          printChatHeader(project);
          if (pendingAttachments.length > 0) printPendingAttachments(pendingAttachments);
          break;
        case "status":
          await runOneShotStatus(client, project.id);
          break;
        case "attach": {
          if (!arg) {
            console.log(pc.red("Usage: /attach <path-to-file>"));
            break;
          }
          try {
            const att = await uploadAttachment(client, arg);
            pendingAttachments.push(att);
            console.log(pc.green(`✓ Attached ${pc.bold(att.fileName)}`) + pc.dim(` (${formatBytes(att.fileSize)}, ${att.fileType})`));
            console.log(pc.dim(`  Attached to your NEXT message. ${pendingAttachments.length} file(s) pending.`));
          } catch (err) {
            if (err instanceof FloopError) {
              console.log(pc.red(`✗ ${err.message}`));
            } else {
              console.log(pc.red(`✗ ${(err as Error).message}`));
            }
          }
          break;
        }
        case "open": {
          const url = project.url ?? (project.subdomain ? `https://${project.subdomain}.floop.tech` : null);
          if (!url) {
            console.log(pc.red("No live URL yet."));
          } else {
            console.log(pc.dim(`Opening ${url}`));
            open(url).catch(() => {});
          }
          break;
        }
        default:
          console.log(pc.red(`Unknown command: /${cmd}`));
          console.log(pc.dim(`Try /help`));
      }
      rl.prompt();
      return;
    }

    // ─── Refine: send message + watch build ────────────────────────────
    cancelInFlight = new AbortController();
    try {
      const attachments = pendingAttachments.length > 0 ? [...pendingAttachments] : undefined;
      pendingAttachments.length = 0; // clear regardless of send outcome — uploaded keys are one-shot
      const sendResult = await refineProject(client, project.id, { message: line, attachments });
      if ("queued" in sendResult && sendResult.queued === true) {
        console.log(pc.dim(`Queued behind in-flight build. Will run when current finishes.`));
      } else if ("queued" in sendResult && sendResult.queued === false) {
        console.log(pc.dim(`Message saved (project not in a state to build right now).`));
      } else if ("processing" in sendResult) {
        await streamBuildProgress(client, project.id, cancelInFlight.signal);
        await printNewAssistantTurns(client, project.id, lastSeenAt);
        lastSeenAt = new Date().toISOString();
      }
    } catch (err) {
      if (err instanceof FloopError) {
        console.log(pc.red(`✗ ${err.message}`));
        if (err.requestId) console.log(pc.dim(`  Request ID: ${err.requestId}`));
      } else {
        console.log(pc.red(`✗ ${(err as Error).message}`));
      }
    } finally {
      cancelInFlight = null;
    }

    rl.prompt();
  });
}

// ─── Project picker ───────────────────────────────────────────────────────

async function pickProject(client: ApiClient): Promise<Project> {
  const projects = await listProjects(client);
  if (projects.length === 0) {
    console.error(pc.red("No projects yet. Create one with `floop new \"<prompt>\"` first."));
    process.exit(1);
  }
  if (projects.length === 1) {
    return projects[0];
  }

  console.log("");
  console.log(pc.bold("Pick a project:"));
  projects.forEach((p, i) => {
    const label = p.subdomain ?? p.id;
    console.log(`  ${pc.cyan(String(i + 1).padStart(2))}) ${pc.bold(label)}  ${pc.dim(`— ${p.status}`)}  ${pc.dim(p.name)}`);
  });
  console.log("");

  const answer = await prompt(`Enter 1-${projects.length} (or 'q' to quit): `);
  if (/^q/i.test(answer)) process.exit(0);
  const idx = Number(answer.trim()) - 1;
  if (!Number.isInteger(idx) || idx < 0 || idx >= projects.length) {
    console.error(pc.red(`Invalid selection.`));
    process.exit(1);
  }
  return projects[idx];
}

function prompt(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function printChatHeader(project: Project) {
  const url = project.url ?? (project.subdomain ? `https://${project.subdomain}.floop.tech` : "—");
  console.log("");
  console.log(`${pc.bold(project.name)} ${pc.dim(`(${project.status})`)}`);
  console.log(pc.dim(`  ${url}`));
  console.log(pc.dim(`  /help · /status · /open · /attach <file> · /exit`));
  console.log("");
}

function printHelp() {
  console.log("");
  console.log(pc.bold("Slash commands"));
  console.log(`  ${pc.cyan("/help")}           show this help`);
  console.log(`  ${pc.cyan("/status")}         show current project status`);
  console.log(`  ${pc.cyan("/open")}           open the live URL in your browser`);
  console.log(`  ${pc.cyan("/attach <file>")}  attach a file to your next message (5 MB max)`);
  console.log(`  ${pc.cyan("/clear")}          clear the screen`);
  console.log(`  ${pc.cyan("/exit")}           leave the REPL (Ctrl+D also works)`);
  console.log("");
  console.log(pc.dim("Anything else you type is sent as a refinement to your project."));
  console.log(pc.dim("During a build, Ctrl+C stops watching (the build keeps running server-side)."));
  console.log("");
}

function printPendingAttachments(list: UploadedAttachment[]) {
  console.log(pc.dim(`(${list.length} attachment(s) pending: ${list.map((a) => a.fileName).join(", ")})`));
  console.log("");
}

async function runOneShotStatus(client: ApiClient, projectId: string) {
  try {
    const s = await getProjectStatus(client, projectId);
    const total = Math.max(s.totalSteps || 6, 1);
    const step = Math.min(Math.max(s.step || 0, 0), total);
    const filled = "█".repeat(step);
    const empty = "░".repeat(total - step);
    const head = s.queuePosition ? `Queued #${s.queuePosition}` : `Step ${step}/${total}`;
    console.log(`${pc.cyan(filled)}${pc.dim(empty)}  ${pc.bold(head)} ${pc.dim(`— ${s.status}${s.message ? ": " + s.message : ""}`)}`);
  } catch (err) {
    if (err instanceof FloopError) {
      console.log(pc.red(`✗ ${err.message}`));
    }
  }
}

async function streamBuildProgress(
  client: ApiClient,
  projectId: string,
  abort: AbortSignal,
): Promise<void> {
  const POLL_MS = 2500;
  let lastLine = "";
  const isTty = process.stdout.isTTY;

  while (!abort.aborted) {
    let s;
    try {
      s = await getProjectStatus(client, projectId);
    } catch (err) {
      if (err instanceof FloopError && err.code === "NOT_FOUND") {
        await sleep(POLL_MS, abort);
        continue;
      }
      throw err;
    }

    const total = Math.max(s.totalSteps || 6, 1);
    const step = Math.min(Math.max(s.step || 0, 0), total);
    const filled = "█".repeat(step);
    const empty = "░".repeat(total - step);
    const head = s.queuePosition ? `Queued #${s.queuePosition}` : `Step ${step}/${total}`;
    const line = `${pc.cyan(filled)}${pc.dim(empty)}  ${pc.bold(head)} ${pc.dim(`— ${s.status}${s.message ? ": " + s.message : ""}`)}`;

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

    await sleep(POLL_MS, abort);
  }
}

async function printNewAssistantTurns(
  client: ApiClient,
  projectId: string,
  sinceIso: string,
): Promise<void> {
  let conv;
  try {
    conv = await getConversations(client, projectId);
  } catch {
    return;
  }

  const sinceTime = new Date(sinceIso).getTime();
  const fresh = conv.messages.filter(
    (m) => new Date(m.createdAt).getTime() > sinceTime && m.role !== "user",
  );

  for (const m of fresh) {
    renderMessage(m);
  }
}

function renderMessage(m: ConversationMessage) {
  const meta = (m.metadata ?? {}) as { type?: string; deploymentId?: string; version?: number; description?: string | null };
  if (meta.type === "deployment_marker") {
    const v = meta.version ? `v${meta.version}` : "";
    console.log("");
    console.log(`${pc.green("● ")}${pc.bold(`Deployed ${v}`)}`);
    if (meta.description) {
      console.log(`  ${pc.dim(meta.description)}`);
    }
    return;
  }
  if (m.role === "system") {
    console.log(pc.dim(`(system) ${m.content}`));
    return;
  }
  console.log("");
  console.log(`${pc.green("assistant ▸")} ${m.content}`);
}

function sleep(ms: number, abort?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    if (abort) {
      const onAbort = () => {
        clearTimeout(timer);
        resolve();
      };
      if (abort.aborted) {
        clearTimeout(timer);
        resolve();
        return;
      }
      abort.addEventListener("abort", onAbort, { once: true });
    }
  });
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
