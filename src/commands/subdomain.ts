/**
 * `floop subdomain check <slug>` — is a subdomain free?
 * `floop subdomain suggest "<prompt>"` — give me an available slug for this idea.
 *
 * Both are scripting utilities — typically chained in front of `floop new`.
 */

import pc from "picocolors";

import { ApiClient } from "../api/client.js";
import { checkSubdomain, suggestSubdomain } from "../api/subdomains.js";
import { handleCommandError, requireAuthedConfig } from "../util/errors.js";

export interface SubdomainCheckOptions {
  json?: boolean;
}

export async function subdomainCheckCommand(
  slug: string,
  opts: SubdomainCheckOptions,
): Promise<void> {
  const cfg = await requireAuthedConfig(opts);
  const client = new ApiClient({ baseUrl: cfg.apiUrl, token: cfg.token });

  try {
    const result = await checkSubdomain(client, slug);
    if (opts.json) {
      console.log(JSON.stringify({ ok: true, slug, ...result }));
      return;
    }
    if (!result.valid) {
      console.log(`${pc.red("✗")} ${pc.bold(slug)} ${pc.dim("— invalid:")} ${result.error ?? "see /docs/subdomains for rules"}`);
      process.exit(1);
    }
    if (result.available) {
      console.log(`${pc.green("✓")} ${pc.bold(slug)} ${pc.dim("— available")}`);
    } else {
      console.log(`${pc.red("✗")} ${pc.bold(slug)} ${pc.dim("— taken or reserved")}`);
      process.exit(1);
    }
  } catch (err) {
    handleCommandError(err, opts.json ?? false);
  }
}

export interface SubdomainSuggestOptions {
  json?: boolean;
}

export async function subdomainSuggestCommand(
  prompt: string,
  opts: SubdomainSuggestOptions,
): Promise<void> {
  const cfg = await requireAuthedConfig(opts);
  const client = new ApiClient({ baseUrl: cfg.apiUrl, token: cfg.token });

  try {
    const result = await suggestSubdomain(client, prompt);
    if (opts.json) {
      console.log(JSON.stringify({ ok: true, suggestion: result.suggestion }));
      return;
    }
    if (!result.suggestion) {
      console.log(pc.dim("No available subdomain could be derived from that prompt — try a longer or more specific one."));
      process.exit(1);
    }
    // Print just the slug on stdout so it's pipeable: `floop new "..." --subdomain $(floop subdomain suggest "...")`
    console.log(result.suggestion);
  } catch (err) {
    handleCommandError(err, opts.json ?? false);
  }
}
