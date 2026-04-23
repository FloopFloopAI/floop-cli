/**
 * Helpers for accepting friendly project references on the command line.
 * Users mostly remember subdomains ("my-bot"), not UUIDs. Commands that take
 * a `<project>` arg pass it through resolveProject() to get a real id.
 */

import { ApiClient } from "../api/client.js";
import { listProjects, Project } from "../api/projects.js";
import { FloopError } from "../api/errors.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/**
 * Slugify a name into a candidate subdomain. Same rules the web UI uses —
 * lowercase, ASCII alphanumeric + dashes, max 63 chars (DNS limit), trimmed.
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

/**
 * Resolve a project reference to a concrete Project. Accepts either a UUID
 * (one round-trip to validate) or a subdomain (lists projects, finds match).
 *
 * For the UUID case we still fetch the project so callers always get
 * { id, subdomain, url, status, ... } in one shot.
 */
export async function resolveProject(
  client: ApiClient,
  ref: string,
): Promise<Project> {
  const projects = await listProjects(client);
  const wanted = ref.trim().toLowerCase();

  let match: Project | undefined;
  if (isUuid(wanted)) {
    match = projects.find((p) => p.id.toLowerCase() === wanted);
  } else {
    match = projects.find(
      (p) => p.subdomain?.toLowerCase() === wanted || p.name.toLowerCase() === wanted,
    );
  }

  if (!match) {
    throw new FloopError({
      code: "NOT_FOUND",
      message: `No project found matching "${ref}"`,
      status: 404,
    });
  }
  return match;
}
