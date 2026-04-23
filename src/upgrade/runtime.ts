/**
 * Helpers around the running binary: detect whether we're a compiled
 * standalone binary (bun --compile) or a Node script (`node dist/index.js`),
 * and pick the right install instructions when an upgrade isn't possible
 * in-place.
 */

import path from "node:path";

export type RuntimeMode = "compiled" | "node-script" | "unknown";

export function detectRuntime(): RuntimeMode {
  const argv0 = process.argv[0] ?? "";
  const exec = process.execPath;
  const base = path.basename(exec).toLowerCase();

  // Node / bun runtime → user is running `node dist/index.js` or similar.
  if (base === "node" || base === "node.exe" || base === "bun" || base === "bun.exe") {
    return "node-script";
  }
  // bun-compiled standalone (or anything else where execPath is the binary
  // we'd actually upgrade).
  if (argv0 && argv0 === exec) return "compiled";
  return "unknown";
}

/**
 * Path of the binary the user invoked — only meaningful when
 * detectRuntime() === "compiled". For Node scripts this is the node binary
 * itself, which we must NEVER overwrite.
 */
export function runningBinaryPath(): string {
  return process.execPath;
}

/**
 * The asset suffix the user's platform needs from a release. Matches the
 * names produced by .github/workflows/cli-release.yml.
 */
export function platformAsset(): string {
  const platform = process.platform;
  const arch = process.arch;
  if (platform === "darwin" && arch === "arm64") return "floop-darwin-arm64";
  if (platform === "darwin" && arch === "x64") return "floop-darwin-x64";
  if (platform === "linux" && arch === "x64") return "floop-linux-x64";
  if (platform === "win32" && arch === "x64") return "floop-windows-x64.exe";
  return "";
}
