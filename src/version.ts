/**
 * Single source of truth for the CLI version at runtime.
 *
 * `process.env.npm_package_version` is only populated by `npm run …`. The
 * compiled `bun build --compile` binaries we ship to users run without npm,
 * so that env var is undefined in every real installation — telemetry and
 * the User-Agent header both ended up reporting "0.0.0" for every user until
 * this constant was introduced.
 *
 * Bump this together with `package.json#version` on every release.
 */
export const CURRENT_VERSION = "0.1.0-alpha.7";
