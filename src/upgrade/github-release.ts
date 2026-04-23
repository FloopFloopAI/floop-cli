/**
 * Talk to the GitHub Releases API to find the latest cli-v* release. We don't
 * use the SDK; one fetch per check, no auth needed for public repos.
 */

const GITHUB_API_BASE = "https://api.github.com";

export interface ReleaseAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

export interface Release {
  tag_name: string; // e.g. "cli-v0.1.0"
  name: string;
  prerelease: boolean;
  draft: boolean;
  assets: ReleaseAsset[];
}

export interface ResolvedReleaseSource {
  /** "{owner}/{repo}" — where releases live. Configurable for staging tests. */
  repo: string;
}

export const DEFAULT_RELEASE_REPO = "FloopFloopAI/floop-cli";

export async function fetchLatestRelease(
  source: ResolvedReleaseSource = { repo: DEFAULT_RELEASE_REPO },
): Promise<Release | null> {
  // GitHub's `/releases/latest` skips drafts and prereleases. We want the
  // highest cli-v* tag overall (including prereleases during alpha), so we
  // list all releases and pick the most recent non-draft cli-v* one.
  const res = await fetch(
    `${GITHUB_API_BASE}/repos/${source.repo}/releases?per_page=30`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": `floop-cli`,
      },
    },
  );

  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(
      `GitHub API returned ${res.status} (${res.statusText}). Check repo path "${source.repo}".`,
    );
  }

  const all = (await res.json()) as Release[];
  const cliReleases = all.filter(
    (r) => !r.draft && r.tag_name.startsWith("cli-v"),
  );
  if (cliReleases.length === 0) return null;

  // GitHub returns releases sorted by created_at desc, which matches what we want.
  return cliReleases[0];
}

/** Strip `cli-v` prefix → `0.1.0-alpha.1`. */
export function versionFromTag(tag: string): string {
  return tag.replace(/^cli-v/, "");
}

/**
 * Sort comparator: returns negative if `a` is older than `b`. Implements a
 * very small subset of semver — enough to compare X.Y.Z and prerelease
 * suffixes like "-alpha.1". For anything we can't parse, falls back to
 * lexicographic compare (still gives a deterministic answer).
 */
export function compareVersions(a: string, b: string): number {
  const aRel = versionFromTag(a);
  const bRel = versionFromTag(b);
  const [aCore, aPre] = splitVersion(aRel);
  const [bCore, bPre] = splitVersion(bRel);

  for (let i = 0; i < 3; i++) {
    const ai = aCore[i] ?? 0;
    const bi = bCore[i] ?? 0;
    if (ai !== bi) return ai - bi;
  }

  // Equal core. A version WITH a prerelease is older than one without.
  if (aPre && !bPre) return -1;
  if (!aPre && bPre) return 1;
  if (!aPre && !bPre) return 0;
  return aPre!.localeCompare(bPre!);
}

function splitVersion(v: string): [number[], string | null] {
  const [core, pre] = v.split("-", 2);
  const parts = core.split(".").map((n) => Number(n)).map((n) => (Number.isFinite(n) ? n : 0));
  return [parts, pre ?? null];
}
