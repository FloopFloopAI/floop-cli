/**
 * `floop conversations <project>` — print the project's chat history.
 *
 * Renders the same data the web chat sidebar shows: user / assistant /
 * system messages in chronological order, with deployment markers
 * highlighted as "Deployed vN".
 */

import pc from "picocolors";

import { ApiClient } from "../api/client.js";
import { getConversations, type ConversationMessage } from "../api/chat.js";
import { resolveProject } from "../util/project-ref.js";
import { handleCommandError, requireAuthedConfig } from "../util/errors.js";

export interface ConversationsOptions {
  json?: boolean;
  limit?: string;
}

export async function conversationsCommand(
  ref: string,
  opts: ConversationsOptions,
): Promise<void> {
  const cfg = await requireAuthedConfig(opts);
  const client = new ApiClient({ baseUrl: cfg.apiUrl, token: cfg.token });

  try {
    const project = await resolveProject(client, ref);
    const conv = await getConversations(client, project.id);

    let messages = conv.messages;
    const limitN = opts.limit ? Number(opts.limit) : NaN;
    if (Number.isFinite(limitN) && limitN > 0) {
      messages = messages.slice(-limitN);
    }

    if (opts.json) {
      console.log(JSON.stringify({
        ok: true,
        project: { id: project.id, subdomain: project.subdomain, name: project.name },
        messages,
        queued: conv.queued,
        latestVersion: conv.latestVersion,
      }));
      return;
    }

    console.log("");
    console.log(`${pc.bold(project.name)} ${pc.dim(`(${project.subdomain ?? project.id})`)}`);
    console.log(pc.dim(`${messages.length} message${messages.length === 1 ? "" : "s"}${conv.queued.length ? ` · ${conv.queued.length} queued` : ""}`));

    for (const m of messages) {
      console.log("");
      printMessage(m);
    }

    if (conv.queued.length > 0) {
      console.log("");
      console.log(pc.bold(pc.yellow("Queued (will run after the current build)")));
      for (const m of conv.queued) {
        console.log("");
        printMessage(m);
      }
    }
    console.log("");
  } catch (err) {
    handleCommandError(err, opts.json ?? false);
  }
}

function printMessage(m: ConversationMessage) {
  const ts = formatDate(m.createdAt);
  const meta = (m.metadata ?? {}) as { type?: string; deploymentId?: string; version?: number; description?: string | null };

  if (meta.type === "deployment_marker") {
    const v = meta.version ? `v${meta.version}` : "";
    console.log(`${pc.green("●")} ${pc.bold(`Deployed ${v}`)} ${pc.dim(ts)}`);
    if (meta.description) console.log(`  ${pc.dim(meta.description)}`);
    return;
  }

  if (m.role === "user") {
    console.log(`${pc.cyan("you")}     ${pc.dim(ts)}`);
  } else if (m.role === "assistant") {
    console.log(`${pc.green("floop")}   ${pc.dim(ts)}`);
  } else {
    console.log(`${pc.dim("system")}  ${pc.dim(ts)}`);
  }
  console.log(`  ${m.content}`);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
