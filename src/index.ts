import { Command } from "commander";

import { loginCommand } from "./commands/login.js";
import { logoutCommand } from "./commands/logout.js";
import { whoamiCommand } from "./commands/whoami.js";
import { newCommand } from "./commands/new.js";
import { listCommand } from "./commands/list.js";
import { statusCommand } from "./commands/status.js";
import { cancelCommand } from "./commands/cancel.js";
import { reactivateCommand } from "./commands/reactivate.js";
import { openCommand } from "./commands/open.js";
import { chatCommand } from "./commands/chat.js";
import { upgradeCommand, CURRENT_VERSION } from "./commands/upgrade.js";
import { docsCommand, feedbackCommand } from "./commands/help-shortcuts.js";
import { cleanupStaleOld } from "./upgrade/swap.js";

// Best-effort cleanup of the stale `.old` binary left over by the last
// in-place upgrade. Fire-and-forget — we don't await it; if it fails the
// next launch tries again.
cleanupStaleOld().catch(() => {});

const program = new Command();

program
  .name("floop")
  .description("Command-line interface for FloopFloop")
  .version(CURRENT_VERSION);

// ─── Auth ────────────────────────────────────────────────────────────────

program
  .command("login")
  .description("Authorize this device against floopfloop.com")
  .option(
    "--device",
    "Use device flow (no localhost callback) — required on SSH or CI",
  )
  .option("--json", "Emit machine-readable JSON")
  .action(async (opts) => {
    await loginCommand({ device: !!opts.device, json: !!opts.json });
  });

program
  .command("logout")
  .description("Revoke the local CLI token and clear it from disk")
  .option("--json", "Emit machine-readable JSON")
  .action(async (opts) => {
    await logoutCommand({ json: !!opts.json });
  });

program
  .command("whoami")
  .description("Show the user this device is currently authorized as")
  .option("--json", "Emit machine-readable JSON")
  .action(async (opts) => {
    await whoamiCommand({ json: !!opts.json });
  });

// ─── Projects ────────────────────────────────────────────────────────────

program
  .command("new <prompt>")
  .description("Create a new project from a prompt and (by default) wait for it to go live")
  .option("--name <name>", "Project name (defaults to first words of the prompt)")
  .option("--subdomain <slug>", "Subdomain (defaults to a slug of the name)")
  .option("--bot-type <type>", "site | app | bot | api | internal | game")
  .option("--team <teamId>", "Create under a team workspace")
  .option("--no-wait", "Return immediately after enqueueing; do not stream progress")
  .option("--json", "Emit machine-readable JSON")
  .action(async (prompt: string, opts) => {
    await newCommand(prompt, {
      name: opts.name,
      subdomain: opts.subdomain,
      botType: opts.botType,
      team: opts.team,
      noWait: opts.wait === false,
      json: !!opts.json,
    });
  });

program
  .command("list")
  .alias("ls")
  .description("List your projects")
  .option("--team <teamId>", "List a team's projects instead of personal ones")
  .option("--json", "Emit machine-readable JSON")
  .action(async (opts) => {
    await listCommand({ team: opts.team, json: !!opts.json });
  });

program
  .command("status <project>")
  .description("Show build status for a project (id or subdomain)")
  .option("--watch", "Stream progress until the build reaches a terminal state")
  .option("--json", "Emit machine-readable JSON")
  .action(async (ref: string, opts) => {
    await statusCommand(ref, { watch: !!opts.watch, json: !!opts.json });
  });

program
  .command("cancel <project>")
  .description("Cancel a project (id or subdomain)")
  .option("--json", "Emit machine-readable JSON")
  .action(async (ref: string, opts) => {
    await cancelCommand(ref, { json: !!opts.json });
  });

program
  .command("reactivate <project>")
  .description("Reactivate a previously cancelled project (id or subdomain)")
  .option("--json", "Emit machine-readable JSON")
  .action(async (ref: string, opts) => {
    await reactivateCommand(ref, { json: !!opts.json });
  });

program
  .command("open <project>")
  .description("Open the project's live URL in your default browser")
  .option("--json", "Print the URL as JSON instead of opening it")
  .action(async (ref: string, opts) => {
    await openCommand(ref, { json: !!opts.json });
  });

program
  .command("chat <project>")
  .description("Open an interactive REPL to refine a project (id or subdomain)")
  .action(async (ref: string) => {
    await chatCommand(ref, {});
  });

program
  .command("upgrade")
  .description("Replace the floop binary with the latest GitHub Release")
  .option("--check", "Only check for an update; do not install")
  .option("--json", "Emit machine-readable JSON")
  .action(async (opts) => {
    await upgradeCommand({ check: !!opts.check, json: !!opts.json });
  });

program
  .command("docs")
  .description("Open the floop CLI reference docs in your default browser")
  .option("--json", "Emit machine-readable JSON")
  .action(async (opts) => {
    await docsCommand({ json: !!opts.json });
  });

program
  .command("feedback")
  .description("Open the support / issue-report page in your default browser")
  .option("--json", "Emit machine-readable JSON")
  .action(async (opts) => {
    await feedbackCommand({ json: !!opts.json });
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
