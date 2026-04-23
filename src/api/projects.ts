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
