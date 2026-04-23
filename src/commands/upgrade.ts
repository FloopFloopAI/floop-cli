/**
 * `floop upgrade` — replace the running compiled binary with the latest
 * release on GitHub. For Node-script developers (`node dist/index.js`) this
 * command refuses gracefully and points at npm.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import pc from "picocolors";

import {
  fetchLatestRelease,
  versionFromTag,
  compareVersions,
} from "../upgrade/github-release.js";
import { detectRuntime, runningBinaryPath, platformAsset } from "../upgrade/runtime.js";
import {
  downloadToFile,
  findHashFor,
  sha256OfFile,
  swapInPlace,
} from "../upgrade/swap.js";

export const CURRENT_VERSION = "0.1.0-alpha.4";

export interface UpgradeOptions {
  check?: boolean;
  json?: boolean;
}

export async function upgradeCommand(opts: UpgradeOptions): Promise<void> {
  const json = opts.json ?? false;

  // 1. Look up latest release.
  let release;
  try {
    release = await fetchLatestRelease();
  } catch (err) {
    return fail(json, "NETWORK_ERROR", `Could not reach GitHub: ${(err as Error).message}`);
  }

  if (!release) {
    return fail(json, "NO_RELEASES", "No CLI releases published yet.");
  }

  const latest = versionFromTag(release.tag_name);
  const cmp = compareVersions(`cli-v${CURRENT_VERSION}`, release.tag_name);

  if (cmp >= 0) {
    if (json) {
      console.log(JSON.stringify({ ok: true, upToDate: true, current: CURRENT_VERSION, latest }));
    } else {
      console.log(pc.green(`✓ floop is up to date (${CURRENT_VERSION})`));
    }
    return;
  }

  if (opts.check) {
    if (json) {
      console.log(JSON.stringify({ ok: true, updateAvailable: true, current: CURRENT_VERSION, latest }));
    } else {
      console.log(`${pc.yellow("↑")} Update available: ${pc.dim(CURRENT_VERSION)} → ${pc.bold(latest)}`);
      console.log(pc.dim(`  Run \`floop upgrade\` to install.`));
    }
    return;
  }

  // 2. Decide whether we can upgrade in place.
  const runtime = detectRuntime();
  if (runtime !== "compiled") {
    return fail(
      json,
      "DEV_MODE",
      runtime === "node-script"
        ? `floop is running as a Node script (\`${process.execPath} ${process.argv[1] ?? "…"}\`). To upgrade, run: npm install -g @floopfloop/cli`
        : `Could not determine how floop is installed; refusing to upgrade. Reinstall from https://www.floopfloop.com/cli`,
    );
  }

  const assetName = platformAsset();
  if (!assetName) {
    return fail(
      json,
      "UNSUPPORTED_PLATFORM",
      `No prebuilt binary for ${process.platform}/${process.arch}. Reinstall from https://www.floopfloop.com/cli`,
    );
  }

  const binary = release.assets.find((a) => a.name === assetName);
  const sums = release.assets.find((a) => a.name === "SHA256SUMS");
  if (!binary) {
    return fail(json, "ASSET_MISSING", `Release ${release.tag_name} has no asset named ${assetName}`);
  }
  if (!sums) {
    return fail(json, "ASSET_MISSING", `Release ${release.tag_name} has no SHA256SUMS — refusing to upgrade unverified`);
  }

  // 3. Download to a temp file next to the running binary so the final
  //    rename is atomic (same filesystem). os.tmpdir() might be a different
  //    mount and break the atomicity.
  const currentPath = runningBinaryPath();
  const newPath = currentPath + ".new";

  if (!json) console.log(`Downloading ${assetName} (${formatBytes(binary.size)})...`);

  try {
    await downloadToFile(binary.browser_download_url, newPath);
  } catch (err) {
    await safeUnlink(newPath);
    return fail(json, "DOWNLOAD_FAILED", `Download failed: ${(err as Error).message}`);
  }

  // 4. Verify SHA256.
  if (!json) console.log(`Verifying checksum...`);
  let expectedSums;
  try {
    const res = await fetch(sums.browser_download_url);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    expectedSums = await res.text();
  } catch (err) {
    await safeUnlink(newPath);
    return fail(json, "VERIFY_FAILED", `Could not fetch SHA256SUMS: ${(err as Error).message}`);
  }

  const expected = findHashFor(expectedSums, assetName);
  if (!expected) {
    await safeUnlink(newPath);
    return fail(json, "VERIFY_FAILED", `SHA256SUMS does not contain an entry for ${assetName}`);
  }

  const actual = await sha256OfFile(newPath);
  if (actual !== expected) {
    await safeUnlink(newPath);
    return fail(
      json,
      "VERIFY_FAILED",
      `Checksum mismatch — refusing to install. Expected ${expected.slice(0, 12)}…, got ${actual.slice(0, 12)}….`,
    );
  }

  // 5. Make sure the new file is executable. tmpfs / Windows may not honour
  //    the mode passed to createWriteStream.
  if (process.platform !== "win32") {
    await fs.chmod(newPath, 0o755).catch(() => {});
  }

  // 6. Atomic-ish swap.
  if (!json) console.log(`Installing ${pc.bold(latest)}...`);
  try {
    await swapInPlace(currentPath, newPath);
  } catch (err) {
    await safeUnlink(newPath);
    // Permission errors are common on /usr/local/bin without sudo. Nudge.
    const msg = (err as NodeJS.ErrnoException).code === "EACCES"
      ? `Permission denied writing to ${path.dirname(currentPath)}. Re-run with sudo, or move the binary to a directory you own.`
      : `Failed to swap binary: ${(err as Error).message}`;
    return fail(json, "INSTALL_FAILED", msg);
  }

  if (json) {
    console.log(JSON.stringify({ ok: true, upgraded: true, from: CURRENT_VERSION, to: latest }));
  } else {
    console.log(pc.green(`✓ Upgraded to ${pc.bold(latest)}`));
    console.log(pc.dim(`  Run \`floop --version\` to confirm.`));
  }
}

function fail(json: boolean, code: string, message: string): never {
  if (json) {
    console.error(JSON.stringify({ ok: false, error: { code, message } }));
  } else {
    console.error(pc.red(`✗ ${message}`));
  }
  process.exit(code === "DEV_MODE" || code === "UNSUPPORTED_PLATFORM" ? 1 : 4);
}

async function safeUnlink(p: string): Promise<void> {
  try {
    await fs.unlink(p);
  } catch {
    /* fine */
  }
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
