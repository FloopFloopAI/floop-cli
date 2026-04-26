/**
 * `floop refine <project> "<message>"` — non-interactive refinement.
 *
 * `floop chat` is the interactive REPL; this command sends a single
 * refinement and exits. Useful for scripts and CI that want to drive a
 * deploy without a TTY. With `--watch` the command tails the resulting
 * build to a terminal state.
 */

import pc from "picocolors";

import { ApiClient } from "../api/client.js";
import { refineProject, type RefineResponse } from "../api/chat.js";
import { pollProjectUntilTerminal } from "../api/projects.js";
import { resolveProject } from "../util/project-ref.js";
import { handleCommandError, requireAuthedConfig } from "../util/errors.js";

export interface RefineOptions {
  json?: boolean;
  watch?: boolean;
  codeOnly?: boolean;
}

export async function refineCommand(
  ref: string,
  message: string,
  opts: RefineOptions,
): Promise<void> {
  const cfg = await requireAuthedConfig(opts);
  const client = new ApiClient({ baseUrl: cfg.apiUrl, token: cfg.token });

  try {
    const project = await resolveProject(client, ref);
    const result: RefineResponse = await refineProject(client, project.id, {
      message,
      codeEditOnly: opts.codeOnly === true ? true : undefined,
    });

    if (opts.json) {
      console.log(JSON.stringify({ ok: true, projectId: project.id, ...result }));
    } else {
      const label = pc.bold(project.subdomain ?? project.id);
      if ("processing" in result && result.processing) {
        console.log(`${pc.green("✓")} Refine triggered a new build for ${label}`);
        console.log(pc.dim(`  deployment ${result.deploymentId} (queue priority ${result.queuePriority})`));
      } else if ("queued" in result && result.queued) {
        console.log(`${pc.yellow("→")} Queued behind current build for ${label}`);
        console.log(pc.dim(`  message ${result.messageId} — will process when the current build finishes`));
      } else {
        console.log(`${pc.dim("·")} Saved to ${label}'s conversation; no build triggered`);
      }
    }

    if (opts.watch) {
      const json = opts.json ?? false;
      await pollProjectUntilTerminal(client, project.id, (s) => {
        if (json) {
          console.log(JSON.stringify({ ok: true, event: s }));
        } else {
          const stamp = new Date().toLocaleTimeString();
          const step = s.step ? ` step ${s.step}/${s.totalSteps ?? "?"}` : "";
          console.log(pc.dim(`[${stamp}]`) + ` [${s.status}]${step} ${s.message ?? ""}`);
        }
      });
    }
  } catch (err) {
    handleCommandError(err, opts.json ?? false);
  }
}
