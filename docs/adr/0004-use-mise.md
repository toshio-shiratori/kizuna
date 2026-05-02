# 0004. Use mise for development environment management

**Status**: Accepted

**Date**: 2026-05-02

## Context

Kizuna requires specific versions of Node.js and pnpm. Without explicit version management:

- Different developers may use different Node.js versions, causing subtle bugs
- Future contributors (and future selves) may inherit broken environments
- Native modules like `better-sqlite3` are sensitive to Node.js version mismatches
- Production dependencies may behave differently across versions

The project owner's initial environment had Homebrew's Node.js v25 (a non-LTS Current release), which was problematic because:

- Node.js v25 reaches end-of-life in approximately one month (2026-06-01)
- Native modules often have compatibility issues with non-LTS versions
- The brew formula's `node` package was found to be in a partially-broken state

A version manager is needed to:

- Pin Node.js to a specific LTS version
- Pin pnpm to a specific version
- Provide a reproducible development environment for any contributor (including the project owner on a new machine)

Alternatives considered:

1. **mise** (asdf-compatible, Rust-based, modern)
2. **nvm** (the de facto standard for Node.js versioning)
3. **fnm** (faster nvm alternative, Rust-based)
4. **asdf** (multi-language version manager, predates mise)
5. **No version manager** (rely on Homebrew and document the version)
6. **Volta** (JavaScript-focused, similar to mise)

## Decision

Use mise for development environment management. The repository includes a `mise.toml` file pinning Node.js to v24 LTS and pnpm to a specific version.

Setup is integrated into the user's shell via:

```bash
brew install mise
echo 'eval "$(mise activate zsh)"' >> ~/.zshrc
```

## Rationale

### Why mise

- **Modern and actively maintained**: mise is built in Rust, fast, and under active development
- **asdf compatibility**: Existing `.tool-versions` files work; users coming from asdf can switch easily
- **Multi-language**: Can manage tools beyond Node.js (Python, Go, Ruby, etc.) which is useful as the project may grow
- **Project-level pinning**: `mise.toml` in the repository pins versions for that project specifically
- **Auto-activation**: When entering the project directory, the correct versions are automatically active
- **Single tool for Node.js + pnpm**: Both are managed by mise; no need for a separate npm-based pnpm install
- **Bundled-version protection**: Even if Homebrew's Node.js gets corrupted, mise's installed versions remain intact

### Why not nvm

- nvm is shell-only (a Bash function), making startup slower
- nvm doesn't have a project file equivalent to `mise.toml` natively (`.nvmrc` only handles Node.js, not pnpm)
- Less convenient for managing pnpm version simultaneously
- Older codebase with slower iteration

### Why not fnm

- fnm is fast and good for Node.js specifically
- Doesn't manage pnpm; would require additional tooling
- Smaller ecosystem than mise

### Why not asdf

- asdf is functionally similar to mise, but slower (written in Bash)
- mise is largely a faster, more modern asdf with full compatibility
- mise is the natural successor for new projects

### Why not "no version manager"

- The project owner's experience showed that brew's Node.js can break (the v25.9.0 Cellar directory was missing)
- Without explicit pinning, future contributors would have inconsistent environments
- The cost of mise (a few minutes of setup) is far less than the cost of debugging environment differences

### Why not Volta

- Volta is a strong choice for JavaScript-only projects
- mise's multi-language support is valuable as the project might add Python tooling for analysis or auxiliary scripts
- mise has more momentum in 2026

## Consequences

### Positive

- Reproducible development environment
- New contributors run a few setup commands and have the correct versions
- Native modules compile against a stable Node.js version
- Future expansion to additional tools (e.g., a Python script) is easy
- The `mise.toml` file is self-documenting

### Negative

- Adds a dependency on mise being installed on the developer's machine
- Slight learning curve for developers unfamiliar with version managers
- mise's auto-activation requires shell integration (one-time setup)

### Constraints introduced

- The `mise.toml` file is committed to the repository and must be kept in sync with `package.json`'s `engines` field
- New Node.js versions are adopted by updating `mise.toml`, not ad-hoc
- The CI environment (Phase 4) will also use mise or pin equivalent versions

## Implementation Notes

The `mise.toml` at the repository root:

```toml
[tools]
node = "24.15.0"
pnpm = "11.0.3"
```

Specific patch versions are pinned during development. When updating to newer LTS versions or pnpm releases, the project owner makes a deliberate decision and commits the change.

The `package.json`'s `engines` field declares broader version ranges:

```json
"engines": {
  "node": ">=24.0.0",
  "pnpm": ">=11.0.0"
}
```

These bounds ensure consumers of published packages can use any compatible version, while contributors to Kizuna itself use the specific pinned version.

## Setup Documentation

The README (Phase 4) will include setup instructions:

```bash
# Install mise
brew install mise              # macOS
curl https://mise.run | sh     # Linux

# Activate in your shell (one-time)
echo 'eval "$(mise activate zsh)"' >> ~/.zshrc  # zsh
echo 'eval "$(mise activate bash)"' >> ~/.bashrc # bash

# Clone and enter the repo
git clone https://github.com/toshio-shiratori/kizuna.git
cd kizuna

# mise auto-installs tools on directory entry
# (or run `mise install` explicitly)
pnpm install
```

For users who prefer a different version manager, the `mise.toml` is also valid as a `.tool-versions` file (asdf compatible) if renamed. We do not provide a `.tool-versions` to avoid duplication, but contributors using asdf can derive it.
