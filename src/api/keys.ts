/**
 * Wrappers around /api/v1/api-keys (Bearer-mirrored from /api/api-keys).
 * Only programmatic (`flp_…`) keys — CLI device tokens have their own
 * endpoint set under /api/cli-tokens.
 */

import { ApiClient } from "./client.js";

export interface ApiKeySummary {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: unknown;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface IssuedApiKey {
  id: string;
  rawKey: string;
  keyPrefix: string;
}

export async function listApiKeys(client: ApiClient): Promise<ApiKeySummary[]> {
  const data = await client.request<{ keys: ApiKeySummary[] }>(
    "GET",
    "/api/v1/api-keys",
  );
  return data.keys;
}

export function createApiKey(
  client: ApiClient,
  name: string,
): Promise<IssuedApiKey> {
  return client.request<IssuedApiKey>("POST", "/api/v1/api-keys", { name });
}

export function revokeApiKey(
  client: ApiClient,
  keyId: string,
): Promise<{ success: boolean }> {
  return client.request<{ success: boolean }>(
    "DELETE",
    `/api/v1/api-keys/${encodeURIComponent(keyId)}`,
  );
}
