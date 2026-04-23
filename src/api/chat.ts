/**
 * Typed wrappers for the project chat / refine endpoints. Used by `floop chat`.
 * The backend has no token-streaming endpoint today — refine queues a build
 * and the assistant "response" is a new deployment + live URL. We model that
 * faithfully here.
 */

import { ApiClient } from "./client.js";

export interface RefineQueuedResponse {
  queued: true;
  messageId: string;
}
export interface RefineSavedOnlyResponse {
  queued: false;
  // Message saved but no build kicked (project not in live/failed state).
}
export interface RefineProcessingResponse {
  processing: true;
  deploymentId: string;
  queuePriority: number;
}
export type RefineResponse =
  | RefineQueuedResponse
  | RefineSavedOnlyResponse
  | RefineProcessingResponse;

export interface RefineInput {
  message: string;
  attachments?: Array<{
    key: string;
    fileName: string;
    fileType: string;
    fileSize: number;
  }>;
  codeEditOnly?: boolean;
}

export function refineProject(
  client: ApiClient,
  projectId: string,
  input: RefineInput,
): Promise<RefineResponse> {
  return client.request<RefineResponse>(
    "POST",
    `/api/v1/projects/${encodeURIComponent(projectId)}/refine`,
    input,
  );
}

// ─── Conversations ────────────────────────────────────────────────────────

export interface ConversationMessage {
  id: string;
  projectId: string;
  role: "user" | "assistant" | "system";
  content: string;
  metadata: unknown;
  status: "sent" | "queued" | "deleted";
  position: number | null;
  createdAt: string;
}

export interface ConversationsResponse {
  messages: ConversationMessage[];
  queued: ConversationMessage[];
  latestVersion: number;
}

export function getConversations(
  client: ApiClient,
  projectId: string,
): Promise<ConversationsResponse> {
  return client.request<ConversationsResponse>(
    "GET",
    `/api/v1/projects/${encodeURIComponent(projectId)}/conversations`,
  );
}
