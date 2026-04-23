/**
 * Wrappers around /api/v1/subdomains/*. Used by `floop subdomain check`
 * and `floop subdomain suggest` for scripting `floop new` flows.
 */

import { ApiClient } from "./client.js";

export interface SubdomainCheckResult {
  valid: boolean;
  available: boolean;
  error?: string;
}

export interface SubdomainSuggestResult {
  suggestion: string | null;
}

export function checkSubdomain(
  client: ApiClient,
  slug: string,
): Promise<SubdomainCheckResult> {
  return client.request<SubdomainCheckResult>(
    "GET",
    `/api/v1/subdomains/check?subdomain=${encodeURIComponent(slug)}`,
  );
}

export function suggestSubdomain(
  client: ApiClient,
  prompt: string,
): Promise<SubdomainSuggestResult> {
  return client.request<SubdomainSuggestResult>(
    "GET",
    `/api/v1/subdomains/suggest?prompt=${encodeURIComponent(prompt)}`,
  );
}
