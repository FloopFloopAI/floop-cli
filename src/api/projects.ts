/**
 * Typed wrappers around the project endpoints. Keeps command code free of
 * raw URL paths and makes the API surface visible in one place.
 */

import { ApiClient } from "./client.js";

export type BotType = "site" | "app" | "bot" | "api" | "internal" | "game";
export type ProjectStatus =
  | "draft"
  | "queued"
  | "generating"
  | "generated"
  | "deploying"
  | "live"
  | "failed"
  | "cancelled"
  | "archived";

export interface Project {
  id: string;
  name: string;
  subdomain: string | null;
  status: ProjectStatus;
  botType: string | null;
  url: string | null;
  amplifyAppUrl: string | null;
  isPublic: boolean;
  isAuthProtected: boolean;
  teamId: string | null;
  createdAt: string;
  updatedAt: string;
  thumbnailUrl?: string | null;
  // Other fields exist on the wire — we only type what the CLI uses.
}

export interface CreateProjectInput {
  name: string;
  subdomain: string;
  prompt: string;
  botType?: BotType;
  isAuthProtected?: boolean;
  teamId?: string;
}

export interface CreateProjectResponse {
  project: Project;
  deployment: { id: string; status: string; version: number };
}

export interface ProjectStatusResponse {
  step: number;
  totalSteps: number;
  status: string;
  message: string;
  progress?: number;
  queuePosition?: number;
  priority?: number;
  version?: number;
  failedStep?: number;
  retryable?: boolean;
}

export const TERMINAL_STATUSES = new Set([
  "live",
  "failed",
  "cancelled",
  "completed",
]);

export function listProjects(
  client: ApiClient,
  opts: { teamId?: string } = {},
): Promise<Project[]> {
  const path = opts.teamId
    ? `/api/v1/projects?teamId=${encodeURIComponent(opts.teamId)}`
    : "/api/v1/projects";
  return client.request<Project[]>("GET", path);
}

export function createProject(
  client: ApiClient,
  input: CreateProjectInput,
): Promise<CreateProjectResponse> {
  return client.request<CreateProjectResponse>(
    "POST",
    "/api/v1/projects",
    input,
  );
}

export function getProjectStatus(
  client: ApiClient,
  projectId: string,
): Promise<ProjectStatusResponse> {
  return client.request<ProjectStatusResponse>(
    "GET",
    `/api/v1/projects/${encodeURIComponent(projectId)}/status`,
  );
}

/**
 * Poll `/projects/:id/status` until the project hits a terminal state
 * (`live` / `failed` / `cancelled` / `completed`). Calls `onEvent` on
 * every *unique* snapshot, deduplicated on
 * `(status, step, message, queuePosition)` — `status` is included in the
 * tuple because `floop status --watch` renders the queue position in its
 * progress bar, so a queue advancing from #5 → #4 must wake the renderer
 * even when `status`/`step`/`message` are unchanged.
 *
 * Used by `floop status --watch`, `floop refine --watch`, and
 * `floop reactivate --watch`. Each callsite supplies its own `onEvent`
 * — `status` renders a progress bar, the others print one line per
 * transition.
 *
 * Polling cadence is 3 s. The function returns when the loop terminates
 * naturally; transport errors propagate to the caller.
 */
export async function pollProjectUntilTerminal(
  client: ApiClient,
  projectId: string,
  onEvent: (event: ProjectStatusResponse) => void,
  opts: { intervalMs?: number } = {},
): Promise<ProjectStatusResponse> {
  const intervalMs = opts.intervalMs ?? 3000;
  let lastKey = "";
  while (true) {
    const ev = await getProjectStatus(client, projectId);
    const key = `${ev.status}|${ev.step ?? ""}|${ev.message ?? ""}|${ev.queuePosition ?? ""}`;
    if (key !== lastKey) {
      lastKey = key;
      onEvent(ev);
    }
    if (TERMINAL_STATUSES.has(ev.status)) return ev;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

export function cancelProject(
  client: ApiClient,
  projectId: string,
): Promise<unknown> {
  return client.request("POST", `/api/v1/projects/${encodeURIComponent(projectId)}/cancel`);
}

export function reactivateProject(
  client: ApiClient,
  projectId: string,
): Promise<unknown> {
  return client.request("POST", `/api/v1/projects/${encodeURIComponent(projectId)}/reactivate`);
}

// ─── Secrets ───────────────────────────────────────────────────────────────
//
// Project secrets are write-only — the API never returns plaintext. List
// returns metadata (key, lastFour, timestamps); set replaces or creates;
// delete removes by key.

export interface ProjectSecretSummary {
  key: string;
  lastFour: string;
  createdAt: string;
  updatedAt: string;
}

export async function listProjectSecrets(
  client: ApiClient,
  projectId: string,
): Promise<ProjectSecretSummary[]> {
  const data = await client.request<{ secrets: ProjectSecretSummary[] }>(
    "GET",
    `/api/v1/projects/${encodeURIComponent(projectId)}/secrets`,
  );
  return data.secrets;
}

export async function setProjectSecret(
  client: ApiClient,
  projectId: string,
  key: string,
  value: string,
): Promise<ProjectSecretSummary> {
  const data = await client.request<{ secret: ProjectSecretSummary }>(
    "POST",
    `/api/v1/projects/${encodeURIComponent(projectId)}/secrets`,
    { key, value },
  );
  return data.secret;
}

export function deleteProjectSecret(
  client: ApiClient,
  projectId: string,
  key: string,
): Promise<{ success: boolean; existed: boolean }> {
  return client.request<{ success: boolean; existed: boolean }>(
    "DELETE",
    `/api/v1/projects/${encodeURIComponent(projectId)}/secrets/${encodeURIComponent(key)}`,
  );
}

// ─── Conversations ─────────────────────────────────────────────────────────
// Re-exports the same shape `floop chat` uses so the conversations command
// can share the renderer.

export {
  type ConversationMessage,
  type ConversationsResponse,
  getConversations,
} from "./chat.js";
