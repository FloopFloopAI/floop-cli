/**
 * Wrappers around /api/v1/library/*. Library is the catalog of public
 * projects; users can browse and clone into their own account.
 */

import { ApiClient } from "./client.js";

export interface LibraryProject {
  id: string;
  name: string;
  description: string | null;
  subdomain: string | null;
  botType: string | null;
  cloneCount: number;
  createdAt: string;
}

export interface LibraryListOptions {
  botType?: string;
  search?: string;
  sort?: "popular" | "newest";
  page?: number;
  limit?: number;
}

export async function listLibrary(
  client: ApiClient,
  opts: LibraryListOptions = {},
): Promise<LibraryProject[]> {
  const params = new URLSearchParams();
  if (opts.botType) params.set("botType", opts.botType);
  if (opts.search) params.set("search", opts.search);
  if (opts.sort) params.set("sort", opts.sort);
  if (opts.page) params.set("page", String(opts.page));
  if (opts.limit) params.set("limit", String(opts.limit));
  const qs = params.toString();
  const path = qs ? `/api/v1/library?${qs}` : "/api/v1/library";

  // The library list endpoint may return either a bare array or a paged
  // shape — we wrap both into a flat array so the command doesn't care.
  const data = await client.request<unknown>("GET", path);
  if (Array.isArray(data)) return data as LibraryProject[];
  if (data && typeof data === "object" && "items" in data) {
    return (data as { items: LibraryProject[] }).items;
  }
  return [];
}

export interface ClonedProject {
  id: string;
  name: string;
  subdomain: string | null;
  status: string;
}

export function cloneLibraryProject(
  client: ApiClient,
  projectId: string,
  subdomain: string,
): Promise<ClonedProject> {
  return client.request<ClonedProject>(
    "POST",
    `/api/v1/library/${encodeURIComponent(projectId)}/clone`,
    { subdomain },
  );
}
