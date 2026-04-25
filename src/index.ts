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
import { refineCommand } from "./commands/refine.js";
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
import {
  keysListCommand,
  keysCreateCommand,
  keysRmCommand,
} from "./commands/keys.js";
import {
  libraryListCommand,
  libraryCloneCommand,
} from "./commands/library.js";
import { completionCommand } from "./commands/completion.js";
import {
  configGetCommand,
  configSetCommand,
} from "./commands/config.js";
import { Telemetry, maybePromptForTelemetry } from "./telemetry.js";
import { cleanupStaleOld } from "./upgrade/swap.js";

// Best-effort cleanup of the stale `.old` binary left over by the last
// in-place upgrade. Fire-and-forget — we don't await it; if it fails the
// next launch tries again.
cleanupStaleOld().catch(() => {});

// Telemetry: started here so the duration measurement covers parseAsync.
// Only fires on the parseAsync clean-exit path (IIFE below). Commands that
// exit early via handleCommandError bypass this — acceptable for v1; we'll
// undercount errors but that's a small price for keeping the exit path
// simple. To capture errors exhaustively we'd refactor handleCommandError
// to throw a typed error instead of process.exit.
const __floopRawCommand = process.argv[2] ?? "";
const __floopTelemetry = new Telemetry(__floopRawCommand);

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
  .command("chat [project]")
  .description("Open an interactive REPL to refine a project (id or subdomain). With no arg, picks from your project list.")
  .action(async (ref: string | undefined) => {
    await chatCommand(ref, {});
  });

program
  .command("refine <project> <message>")
  .description("Send a single refinement to a project, non-interactively. Use `floop chat` for the interactive REPL.")
  .option("--watch", "Tail the resulting build to a terminal state")
  .option("--code-only", "Mark as code-only edit (no AI re-generation)")
  .option("--json", "Emit machine-readable JSON")
  .action(async (ref: string, message: string, opts) => {
    await refineCommand(ref, message, {
      json: !!opts.json,
      watch: !!opts.watch,
      codeOnly: !!opts.codeOnly,
    });
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

// ─── Programmatic API keys (for CI scripts) ─────────────────────────────

const keys = program
  .command("keys")
  .description("Manage programmatic API keys (`flp_…`) for CI/CD use — distinct from device tokens");

keys
  .command("list")
  .alias("ls")
  .description("List your API keys (metadata only)")
  .option("--json", "Emit machine-readable JSON")
  .action(async (opts) => {
    await keysListCommand({ json: !!opts.json });
  });

keys
  .command("create <name>")
  .description("Create a new API key. Raw key is shown ONCE — copy it immediately. (Business plan required.)")
  .option("--json", "Emit machine-readable JSON")
  .action(async (name: string, opts) => {
    await keysCreateCommand(name, { json: !!opts.json });
  });

keys
  .command("rm <name-or-id>")
  .alias("delete")
  .description("Revoke an API key (by name or id). Refuses to revoke the key making the call.")
  .option("--json", "Emit machine-readable JSON")
  .action(async (ref: string, opts) => {
    await keysRmCommand(ref, { json: !!opts.json });
  });

// ─── Library (public projects) ──────────────────────────────────────────

const library = program
  .command("library")
  .description("Browse and clone public projects from the FloopFloop library");

library
  .command("list")
  .alias("ls")
  .description("List public projects in the library")
  .option("--bot-type <type>", "Filter by type (site, app, bot, api, internal, game)")
  .option("--search <query>", "Filter by name/description text")
  .option("--sort <order>", "newest (default) or popular")
  .option("--limit <n>", "Limit results (1-50, default 20)")
  .option("--json", "Emit machine-readable JSON")
  .action(async (opts) => {
    await libraryListCommand({
      botType: opts.botType,
      search: opts.search,
      sort: opts.sort,
      limit: opts.limit,
      json: !!opts.json,
    });
  });

library
  .command("clone <projectId>")
  .description("Clone a public library project into your account")
  .option("--subdomain <slug>", "Subdomain for the clone (defaults to a slug of the source name)")
  .option("--json", "Emit machine-readable JSON")
  .action(async (projectId: string, opts) => {
    await libraryCloneCommand(projectId, {
      subdomain: opts.subdomain,
      json: !!opts.json,
    });
  });

// ─── Shell completions ──────────────────────────────────────────────────

program
  .command("completion <shell>")
  .description("Print shell completion script for bash | zsh | fish | powershell")
  .action((shell: string) => {
    completionCommand(shell);
  });

// ─── Local config ────────────────────────────────────────────────────────

const config = program
  .command("config")
  .description("Show or set local CLI settings (apiUrl, telemetry)");

config
  .command("get [key]")
  .description("Print the current config (or one key)")
  .option("--json", "Emit machine-readable JSON")
  .action(async (key: string | undefined, opts) => {
    await configGetCommand(key, { json: !!opts.json });
  });

config
  .command("set <key> <value>")
  .description("Set a config value. Settable: apiUrl, telemetry (true|false)")
  .option("--json", "Emit machine-readable JSON")
  .action(async (key: string, value: string, opts) => {
    await configSetCommand(key, value, { json: !!opts.json });
  });

// ─── Run ──────────────────────────────────────────────────────────────────

(async () => {
  // First-run prompt for telemetry — silent on non-TTY, --json, or skip-listed
  // commands. Decision is persisted; subsequent invocations are silent.
  const argv = process.argv.slice(2);
  const isJson = argv.includes("--json");
  await maybePromptForTelemetry(__floopRawCommand, isJson).catch(() => {});

  let exitCode = 0;
  try {
    await program.parseAsync(process.argv);
    // process.exitCode is `string | number | undefined` in newer Node types;
    // coerce to a number for our local tracking.
    const raw = process.exitCode;
    exitCode = typeof raw === "number" ? raw : raw === undefined ? 0 : Number(raw) || 0;
  } catch (err) {
    // Commander throws CommanderError for --help / --version with exitCode 0;
    // honor that, otherwise treat as a real failure.
    const code = (err as { exitCode?: number }).exitCode;
    if (typeof code === "number") {
      exitCode = code;
    } else {
      console.error(err instanceof Error ? err.message : String(err));
      exitCode = 1;
    }
  }

  // Fire-and-forget telemetry (1-second timeout inside Telemetry.send).
  await __floopTelemetry.send(exitCode).catch(() => {});
  process.exit(exitCode);
})();
