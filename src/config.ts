/**
 * Local CLI config + token storage. Single JSON file at ~/.floop/config.json
 * with 0600 perms (rw for owner only). OS keychain support is a follow-on
 * slice — for now plain JSON keeps the dependency tree empty and works on
 * every platform.
 *
 * Env overrides win over the file:
 *   FLOOP_API_URL  — point the CLI at staging or a local dev server
 *   FLOOP_TOKEN    — bypass the stored token entirely (CI, scripts)
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

const DEFAULT_API_URL = "https://www.floopfloop.com";

export interface StoredUser {
  id: string;
  email: string | null;
  name: string | null;
}

export interface ConfigFile {
  apiUrl?: string;
  token?: string;
  tokenPrefix?: string;
  user?: StoredUser;
}

export function configDir(): string {
  return path.join(os.homedir(), ".floop");
}

export function configPath(): string {
  return path.join(configDir(), "config.json");
}

export async function readConfig(): Promise<ConfigFile> {
  try {
    const raw = await fs.readFile(configPath(), "utf8");
    return JSON.parse(raw) as ConfigFile;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw err;
  }
}

export async function writeConfig(cfg: ConfigFile): Promise<void> {
  await fs.mkdir(configDir(), { recursive: true, mode: 0o700 });
  const tmp = configPath() + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(cfg, null, 2), {
    mode: 0o600,
    encoding: "utf8",
  });
  await fs.rename(tmp, configPath());
}

export async function clearStoredToken(): Promise<void> {
  const cfg = await readConfig();
  delete cfg.token;
  delete cfg.tokenPrefix;
  delete cfg.user;
  await writeConfig(cfg);
}

export interface ResolvedConfig {
  apiUrl: string;
  token?: string;
  user?: StoredUser;
}

export async function resolveConfig(): Promise<ResolvedConfig> {
  const file = await readConfig();
  return {
    apiUrl: process.env.FLOOP_API_URL ?? file.apiUrl ?? DEFAULT_API_URL,
    token: process.env.FLOOP_TOKEN ?? file.token,
    user: process.env.FLOOP_TOKEN ? undefined : file.user,
  };
}

export async function persistLogin(input: {
  apiUrl: string;
  token: string;
  tokenPrefix: string;
  user: StoredUser;
}): Promise<void> {
  const cfg = await readConfig();
  cfg.apiUrl = input.apiUrl;
  cfg.token = input.token;
  cfg.tokenPrefix = input.tokenPrefix;
  cfg.user = input.user;
  await writeConfig(cfg);
}
