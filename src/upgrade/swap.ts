/**
 * Atomic-ish in-place binary replacement. Uses the .old / .new dance so it
 * works on Windows too (you can rename a running .exe but you can't replace
 * its contents while it's open).
 *
 * Layout during upgrade:
 *   /usr/local/bin/floop          — currently running
 *   /usr/local/bin/floop.new      — freshly downloaded, verified
 *   /usr/local/bin/floop.old      — stale, cleaned up on next launch
 *
 * Sequence:
 *   1. Download → tmp file → fsync
 *   2. Verify SHA256 → throw if mismatch (delete tmp first)
 *   3. Rename current → .old (works on running exe on all OSes)
 *   4. Rename .new → current
 *   5. Best-effort delete .old (works on macOS/Linux immediately; on Windows
 *      it stays around because the previous-but-still-mapped exe holds it
 *      open — `cleanupStaleOld()` handles that on the next launch)
 */

import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import path from "node:path";

export async function downloadToFile(url: string, destPath: string): Promise<void> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok || !res.body) {
    throw new Error(`Download failed: ${res.status} ${res.statusText}`);
  }
  // Stream the body to disk — release artefacts are 30+ MB; don't buffer.
  // @ts-expect-error  — Web ReadableStream → Node Readable interop.
  await pipeline(Readable.fromWeb(res.body), createWriteStream(destPath, { mode: 0o755 }));
}

export async function sha256OfFile(filePath: string): Promise<string> {
  const hash = crypto.createHash("sha256");
  const fd = await fs.open(filePath, "r");
  try {
    const stream = fd.createReadStream();
    for await (const chunk of stream) hash.update(chunk);
  } finally {
    await fd.close();
  }
  return hash.digest("hex");
}

/**
 * Parse a SHA256SUMS file (sha256sum output: "<hex>  <filename>" per line)
 * and return the hash for the named asset, or null if not present.
 */
export function findHashFor(sumsText: string, assetName: string): string | null {
  for (const line of sumsText.split(/\r?\n/)) {
    const [hash, ...rest] = line.trim().split(/\s+/);
    if (!hash || rest.length === 0) continue;
    const name = rest.join(" ").replace(/^\*/, ""); // strip BSD "*" binary marker
    if (name === assetName) return hash.toLowerCase();
  }
  return null;
}

export async function swapInPlace(currentPath: string, newPath: string): Promise<void> {
  const oldPath = currentPath + ".old";

  // Cleanup any stale .old left from a previous upgrade. Best effort.
  try {
    await fs.unlink(oldPath);
  } catch {
    /* may not exist or may be locked on Windows — fine */
  }

  // Rename running binary out of the way. On Windows this is the magic step
  // that makes in-place upgrade possible: the OS lets you rename a locked
  // executable, just not write over it.
  await fs.rename(currentPath, oldPath);

  // Move freshly-downloaded binary into the canonical path.
  try {
    await fs.rename(newPath, currentPath);
  } catch (err) {
    // If the second rename fails, restore the original to avoid leaving the
    // user with no `floop` at all.
    await fs.rename(oldPath, currentPath).catch(() => {});
    throw err;
  }

  // Best-effort delete; if Windows still has the .old open, we'll catch it
  // on next launch via cleanupStaleOld().
  await fs.unlink(oldPath).catch(() => {});
}

/**
 * Called once at every CLI launch — silently removes the leftover .old file
 * from a prior in-place upgrade. Synchronous because we want it done before
 * the user sees any UI.
 */
export async function cleanupStaleOld(): Promise<void> {
  try {
    const exec = process.execPath;
    const dir = path.dirname(exec);
    const base = path.basename(exec);
    const stale = path.join(dir, `${base}.old`);
    await fs.unlink(stale);
  } catch {
    /* nothing to clean — fine */
  }
}
