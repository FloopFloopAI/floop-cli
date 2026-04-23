/**
 * Wrappers around /api/v1/usage/*. Mirrors the shape returned by
 * usageService.getUserUsageSummary and the projects breakdown route.
 */

import { ApiClient } from "./client.js";

export interface UsageSummary {
  plan: {
    name: string;
    displayName: string;
    monthlyCredits: number;
    maxProjects: number;
    maxStorageMb: number;
    maxBandwidthMb: number;
  };
  credits: {
    currentCredits: number;
    rolledOverCredits: number;
    lifetimeCreditsUsed: number;
    rolloverExpiresAt: string | null;
  };
  currentPeriod: {
    start: string;
    end: string;
    projectsCreated: number;
    buildsUsed: number;
    refinementsUsed: number;
    storageUsedMb: number;
    bandwidthUsedMb: number;
  };
}

export interface UsageProjectsRow {
  projectId: string;
  name: string;
  subdomain: string | null;
  buildsUsed: number;
  refinementsUsed: number;
  storageUsedMb: number;
  bandwidthUsedMb: number;
}

export function getUsageSummary(client: ApiClient): Promise<UsageSummary> {
  return client.request<UsageSummary>("GET", "/api/v1/usage/summary");
}

export function getUsageProjects(
  client: ApiClient,
): Promise<UsageProjectsRow[]> {
  return client.request<UsageProjectsRow[]>("GET", "/api/v1/usage/projects");
}
