import pc from "picocolors";

import { ApiClient } from "../api/client.js";
import { getUsageSummary } from "../api/usage.js";
import { handleCommandError, requireAuthedConfig } from "../util/errors.js";

export interface UsageOptions {
  json?: boolean;
}

export async function usageCommand(opts: UsageOptions): Promise<void> {
  const cfg = await requireAuthedConfig(opts);
  const client = new ApiClient({ baseUrl: cfg.apiUrl, token: cfg.token });

  try {
    const u = await getUsageSummary(client);

    if (opts.json) {
      console.log(JSON.stringify({ ok: true, usage: u }));
      return;
    }

    const totalCredits = u.credits.currentCredits + u.credits.rolledOverCredits;
    const periodStart = new Date(u.currentPeriod.start).toLocaleDateString();
    const periodEnd = new Date(u.currentPeriod.end).toLocaleDateString();

    console.log("");
    console.log(pc.bold(`Plan: ${u.plan.displayName}`) + pc.dim(` (${u.plan.name})`));
    console.log("");

    console.log(pc.bold("Credits"));
    console.log(`  ${pc.dim("Available:    ")}${pc.green(String(totalCredits))} ${pc.dim(`(this month: ${u.credits.currentCredits}, rolled over: ${u.credits.rolledOverCredits})`)}`);
    console.log(`  ${pc.dim("Monthly grant:")}${u.plan.monthlyCredits}`);
    console.log(`  ${pc.dim("Lifetime used:")}${u.credits.lifetimeCreditsUsed}`);
    if (u.credits.rolloverExpiresAt) {
      const expires = new Date(u.credits.rolloverExpiresAt).toLocaleDateString();
      console.log(`  ${pc.dim("Rollover expires: ")}${expires}`);
    }
    console.log("");

    console.log(pc.bold(`Current period`) + pc.dim(`  (${periodStart} → ${periodEnd})`));
    console.log(`  ${pc.dim("Projects created: ")}${u.currentPeriod.projectsCreated}`);
    console.log(`  ${pc.dim("Builds used:      ")}${u.currentPeriod.buildsUsed}`);
    console.log(`  ${pc.dim("Refinements:      ")}${u.currentPeriod.refinementsUsed}`);
    console.log(`  ${pc.dim("Storage:          ")}${formatMb(u.currentPeriod.storageUsedMb)} ${pc.dim(`/ ${formatMb(u.plan.maxStorageMb)}`)}`);
    console.log(`  ${pc.dim("Bandwidth:        ")}${formatMb(u.currentPeriod.bandwidthUsedMb)} ${pc.dim(`/ ${formatMb(u.plan.maxBandwidthMb)}`)}`);
    console.log("");
  } catch (err) {
    handleCommandError(err, opts.json ?? false);
  }
}

function formatMb(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${Math.round(mb)} MB`;
}
