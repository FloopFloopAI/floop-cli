/**
 * Anonymous CLI telemetry. Off by default — the user is prompted on first
 * interactive run; their answer is persisted in ~/.floop/config.json.
 *
 * Per the plan and the privacy guarantees baked into the backend:
 *   - We send: command, exitCode, durationMs, version, os, anonymousId
 *   - We never send: prompts, project names, file paths, any user content
 *   - anonymousId is random hex generated client-side, never joined to users
 *
 * Sending is fire-and-forget with a hard 1-second timeout — telemetry must
 * never delay the user's actual workflow. Failures are swallowed.
 */

import crypto from "node:crypto";
import readline from "node:readline";
import pc from "picocolors";

import { readConfig, writeConfig, type ConfigFile } from "./config.js";
import { CURRENT_VERSION } from "./version.js";

const DEFAULT_API_URL = "https://www.floopfloop.com";
const TIMEOUT_MS = 1000;

/** Commands that should NEVER trigger the first-run prompt or telemetry. */
const SKIP_COMMANDS = new Set([
  "config", // would be circular
  "completion", // pure local stdout, may be piped
  "help",
  "--help",
  "-h",
  "--version",
  "-V",
]);

export interface TelemetryEvent {
  command: string;
  exitCode: number;
  durationMs: number;
}

export class Telemetry {
  private startedAt = Date.now();
  private command: string;

  constructor(command: string) {
    this.command = command;
  }

  /**
   * Called from index.ts at exit (via process.on("exit") / explicit hook).
   * Fire-and-forget; never throws.
   */
  async send(exitCode: number): Promise<void> {
    if (SKIP_COMMANDS.has(this.command)) return;

    const cfg = await readConfig().catch(() => ({} as ConfigFile));
    if (cfg.telemetry !== true) return;
    if (!cfg.anonymousId) return;

    const apiUrl = process.env.FLOOP_API_URL ?? cfg.apiUrl ?? DEFAULT_API_URL;
    const event = {
      anonymousId: cfg.anonymousId,
      command: this.command,
      exitCode,
      durationMs: Date.now() - this.startedAt,
      version: CURRENT_VERSION,
      os: process.platform,
    };

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
    try {
      await fetch(`${apiUrl}/api/cli/telemetry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(event),
        signal: ac.signal,
      });
    } catch {
      // Swallow — telemetry must not break anything.
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * On first interactive run, prompts the user to opt in. Stores the answer
 * (and a fresh anonymousId if yes) in config.json. Returns immediately on
 * non-TTY shells, on `--json`, or for the SKIP_COMMANDS list — those default
 * to opt-out.
 */
export async function maybePromptForTelemetry(command: string, isJson: boolean): Promise<void> {
  if (SKIP_COMMANDS.has(command)) return;
  if (isJson) return;
  if (!process.stdin.isTTY || !process.stdout.isTTY) return;

  const cfg = await readConfig().catch(() => ({} as ConfigFile));
  if (cfg.telemetry !== undefined) return; // already decided

  console.log("");
  console.log(pc.dim("Help improve floop by sharing anonymous usage data?"));
  console.log(pc.dim("We send: command name, exit code, duration, version, OS — that's it."));
  console.log(pc.dim("Never: prompts, project names, file contents, or any other user data."));
  console.log(pc.dim("You can change this any time with: floop config set telemetry false"));

  const answer = await prompt(pc.bold("Opt in? [Y/n]: "));
  const optIn = !/^n/i.test(answer.trim()); // anything but n/no = yes

  cfg.telemetry = optIn;
  if (optIn && !cfg.anonymousId) {
    cfg.anonymousId = crypto.randomBytes(16).toString("hex");
  }
  await writeConfig(cfg);

  console.log(pc.dim(optIn ? "✓ Telemetry on. Thanks!" : "✓ Telemetry off."));
  console.log("");
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
