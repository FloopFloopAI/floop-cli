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
import { usageCommand } from "./commands/usage.js";
import {
  secretsListCommand,
  secretsSetCommand,
  secretsRmCommand,
} from "./commands/secrets.js";
import { conversationsCommand } from "./commands/conversations.js";
import {
  subdomainCheckCommand,
  subdomainSuggestCommand,
} from "./commands/subdomain.js";
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

// ─── Account ─────────────────────────────────────────────────────────────

program
  .command("usage")
  .description("Show your plan, credit balance, and current-period usage")
  .option("--json", "Emit machine-readable JSON")
  .action(async (opts) => {
    await usageCommand({ json: !!opts.json });
  });

// ─── Project secrets ─────────────────────────────────────────────────────

const secrets = program
  .command("secrets")
  .description("Manage write-only environment variables on a project");

secrets
  .command("list <project>")
  .alias("ls")
  .description("List secrets set on a project (values are never returned)")
  .option("--json", "Emit machine-readable JSON")
  .action(async (ref: string, opts) => {
    await secretsListCommand(ref, { json: !!opts.json });
  });

secrets
  .command("set <project> <key>")
  .description("Create or replace a secret. Reads value from --value, --from-env, or stdin (in that order)")
  .option("--value <value>", "Set the value inline (puts it in shell history; prefer stdin or --from-env)")
  .option("--from-env <varname>", "Read the value from a local environment variable")
  .option("--json", "Emit machine-readable JSON")
  .action(async (ref: string, key: string, opts) => {
    await secretsSetCommand(ref, key, {
      value: opts.value,
      fromEnv: opts.fromEnv,
      json: !!opts.json,
    });
  });

secrets
  .command("rm <project> <key>")
  .alias("delete")
  .description("Remove a secret by key (idempotent)")
  .option("--json", "Emit machine-readable JSON")
  .action(async (ref: string, key: string, opts) => {
    await secretsRmCommand(ref, key, { json: !!opts.json });
  });

// ─── Conversations ──────────────────────────────────────────────────────

program
  .command("conversations <project>")
  .alias("history")
  .description("Show a project's chat history (id or subdomain)")
  .option("--limit <n>", "Show only the last N messages")
  .option("--json", "Emit machine-readable JSON")
  .action(async (ref: string, opts) => {
    await conversationsCommand(ref, { limit: opts.limit, json: !!opts.json });
  });

// ─── Subdomain utilities ────────────────────────────────────────────────

const subdomain = program
  .command("subdomain")
  .description("Check or suggest project subdomains (scripting helpers for `floop new`)");

subdomain
  .command("check <slug>")
  .description("Check whether a subdomain is available; exit 0 if free, 1 if taken")
  .option("--json", "Emit machine-readable JSON")
  .action(async (slug: string, opts) => {
    await subdomainCheckCommand(slug, { json: !!opts.json });
  });

subdomain
  .command("suggest <prompt>")
  .description("Print an available subdomain derived from a prompt")
  .option("--json", "Emit machine-readable JSON")
  .action(async (prompt: string, opts) => {
    await subdomainSuggestCommand(prompt, { json: !!opts.json });
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
