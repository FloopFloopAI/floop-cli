# floop — FloopFloop CLI

[![GitHub release](https://img.shields.io/github/v/release/FloopFloopAI/floop-cli?include_prereleases&label=release&logo=github)](https://github.com/FloopFloopAI/floop-cli/releases)
[![CI](https://img.shields.io/github/actions/workflow/status/FloopFloopAI/floop-cli/ci.yml?branch=main&logo=github&label=ci)](https://github.com/FloopFloopAI/floop-cli/actions/workflows/ci.yml)
[![Downloads](https://img.shields.io/github/downloads/FloopFloopAI/floop-cli/total?logo=github)](https://github.com/FloopFloopAI/floop-cli/releases)
[![License: MIT](https://img.shields.io/github/license/FloopFloopAI/floop-cli)](./LICENSE)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows-blue)](#install)

Command-line interface for [FloopFloop](https://www.floopfloop.com). Create
projects, watch deploys, refine in a chat REPL, manage secrets — anything you
can do in the web console, from your terminal. Single binary, no Node
required.

## Install

Pre-built binaries for macOS, Linux, and Windows are published on every
[release](https://github.com/FloopFloopAI/floop-cli/releases).

**macOS — Apple Silicon (M1/M2/M3/M4)**

```bash
curl -L https://github.com/FloopFloopAI/floop-cli/releases/latest/download/floop-darwin-arm64 \
  -o /usr/local/bin/floop
chmod +x /usr/local/bin/floop
xattr -d com.apple.quarantine /usr/local/bin/floop  # bypass Gatekeeper (not yet code-signed)
```

**macOS — Intel**

```bash
curl -L https://github.com/FloopFloopAI/floop-cli/releases/latest/download/floop-darwin-x64 \
  -o /usr/local/bin/floop
chmod +x /usr/local/bin/floop
xattr -d com.apple.quarantine /usr/local/bin/floop
```

**Linux x64**

```bash
curl -L https://github.com/FloopFloopAI/floop-cli/releases/latest/download/floop-linux-x64 \
  -o /usr/local/bin/floop
chmod +x /usr/local/bin/floop
```

**Windows x64** — download
[`floop-windows-x64.exe`](https://github.com/FloopFloopAI/floop-cli/releases/latest/download/floop-windows-x64.exe),
rename to `floop.exe`, place it on your `%PATH%`. SmartScreen will warn the
first time — click "More info" → "Run anyway".

**Verify checksums** (recommended)

```bash
curl -L https://github.com/FloopFloopAI/floop-cli/releases/latest/download/SHA256SUMS \
  | sha256sum -c --ignore-missing
```

## Quickstart

```bash
floop login                                    # opens browser, click Approve
floop new "a crypto RSI dashboard for BTC"     # creates project, streams progress
floop list                                     # see your projects
floop chat my-rsi                              # interactive refinement REPL
floop status my-rsi --watch                    # live deploy progress
floop open my-rsi                              # open the live URL
floop upgrade                                  # self-update to the latest release
```

Full reference: [floopfloop.com/docs/cli](https://www.floopfloop.com/docs/cli)
or run `floop docs`.

## Headless / SSH / CI

```bash
floop login --device                           # shows a code to paste at /device
FLOOP_TOKEN=flp_cli_… floop list --json        # bypass interactive login entirely
```

Every command supports `--json`. Documented exit codes: `0` ok · `1` user
error · `2` auth · `3` rate-limited · `4` server · `5` network.

## Building from source

Requires [Bun](https://bun.sh) for cross-compilation. To produce binaries
locally:

```bash
npm install
npm run compile:darwin-arm64     # or :darwin-x64, :linux-x64, :windows-x64
./dist/floop-darwin-arm64 --version
```

Releases are produced automatically by GitHub Actions on every `cli-v*` tag —
see [`.github/workflows/cli-release.yml`](.github/workflows/cli-release.yml).

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for the per-release list of changes.

## License

MIT
