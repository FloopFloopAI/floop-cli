/**
 * Lightweight commands that just open a URL on floopfloop.com. Cheap, but
 * close a real UX gap — when a user is stuck mid-task, they shouldn't have to
 * tab to a browser and remember the URL.
 */

import open from "open";
import pc from "picocolors";

import { resolveConfig } from "../config.js";

interface OpenOpts {
  json?: boolean;
}

async function openUrl(path: string, opts: OpenOpts) {
  const cfg = await resolveConfig();
  const url = `${cfg.apiUrl}${path}`;
  if (opts.json) {
    console.log(JSON.stringify({ ok: true, url }));
    return;
  }
  console.log(`${pc.dim("Opening")} ${pc.cyan(url)}`);
  // open() can fail silently on systems without a browser handler. The URL
  // was printed, so the user can copy-paste — that's good enough.
  open(url).catch(() => {});
}

export function docsCommand(opts: OpenOpts): Promise<void> {
  return openUrl("/docs/cli", opts);
}

export function feedbackCommand(opts: OpenOpts): Promise<void> {
  return openUrl("/support", opts);
}
