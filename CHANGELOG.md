# Changelog

All notable changes to the FloopFloop CLI are documented in this file.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This CLI follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Alpha releases use the `-alpha.N` suffix.

## [Unreleased]

### Fixed
- `ApiClient.request` now times out after 30 s (overridable per call) instead
  of hanging indefinitely. A new `TIMEOUT` `FloopErrorCode` maps to exit
  code 5 alongside `NETWORK_ERROR`. Affects every network-touching command
  (`login`, `new`, `list`, `status`, `whoami`, `keys`, `secrets`, …).
- `runCallbackFlow` wraps the local HTTP server in `try/finally`, so a
  failed login (10-minute timeout, state mismatch, exchange error) no longer
  leaks a bound loopback port.

## [0.1.0-alpha.6] — 2026-04-23

### Fixed
- `floop --version` and the telemetry/User-Agent strings now report the
  actual published version. Prior alphas inlined `0.1.0-alpha.1` via a
  stale constant.

## [0.1.0-alpha.5] — 2026-04-23

### Added
- Shell completion scripts: `floop completion <bash|zsh|fish|powershell>`
  prints a completion script to stdout. Static command tree; no dynamic
  project-name completion yet.
- Opt-in anonymous telemetry. First interactive run prompts "share anonymous
  usage data?" — payload is `{anonymousId, command, exitCode, durationMs,
  version, os}` POSTed with a hard 1 s timeout. Disable any time with
  `floop config set telemetry false`.
- `floop config get|set` — read/write `apiUrl` and `telemetry`. Token
  storage stays managed by `login`/`logout` (intentionally not settable via
  `config set` to keep tokens out of shell history).

## [0.1.0-alpha.4] — 2026-04-23

### Added
- `floop keys list|create|delete` — manage `/api/v1/api-keys`. Business plan
  required to mint new keys.
- `floop library list|clone` — browse + clone public projects from
  `/api/v1/library`.
- `floop chat` — `/attach` command opens an interactive picker to add
  files to the next refine call. Supported types: png, jpg, gif, svg, webp,
  ico, pdf, txt, csv, doc, docx (5 MB cap).
- `LICENSE` file (MIT; was already declared in `package.json`).

## [0.1.0-alpha.3] — 2026-04-23

### Added
- `floop conversations <project>` — list a project's refinement history.
- `floop subdomain check <slug>` — exits 0 if free, 1 if taken.
- `floop subdomain suggest "<prompt>"` — print a slug on stdout for piping.

## [0.1.0-alpha.2] — 2026-04-23

### Added
- `floop usage` — summary of API usage (`/api/v1/usage/summary` and
  `/api/v1/usage/projects`).
- `floop secrets list|set|remove` — manage project secrets.
- README with install, quickstart, headless/SSH/CI usage, and build-from-
  source instructions.

## [0.1.0-alpha.1] — 2026-04-23

### Added
- Initial release with commands: `login`, `logout`, `whoami`, `new`,
  `list`, `status` (+ `--watch`), `cancel`, `reactivate`, `open`, `chat`,
  `upgrade`, `docs`, `feedback`.
- Dual auth flows: default callback (local HTTP on a random high port +
  browser `open()`) and `--device` flow (RFC 8628 spirit) for SSH / CI.
- Standalone single-file binaries cross-compiled with Bun for macOS
  (arm64 + x64), Linux x64, Windows x64. Released to GitHub Releases with
  a signed `SHA256SUMS` file for `floop upgrade` checksum verification.
- Self-update (`floop upgrade`) with a Windows-safe `.old` swap pattern —
  rename current → `.old`, drop new into place, clean the `.old` on next
  launch if the OS wouldn't let us delete it immediately.
- Env overrides: `FLOOP_TOKEN` bypasses stored auth (CI), `FLOOP_API_URL`
  points the CLI at staging or a local dev server.
- Documented exit codes: `0` ok · `1` user error · `2` auth · `3` rate-
  limited · `4` server · `5` network.
