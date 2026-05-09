# Contributing to Kizuna

Thank you for your interest in Kizuna.

## Project Status

Kizuna is a personal open-source project maintained on a **best-effort basis only**. There is no SLA, no roadmap commitment, and no support guarantee.

Issues and pull requests may not receive responses. This is not a reflection of your contribution's value -- it's simply a matter of available time.

## Before Contributing

1. Check existing [issues](https://github.com/toshio-shiratori/kizuna/issues) to avoid duplicates
2. For large changes, open an issue first to discuss the approach

## Development Setup

```bash
git clone https://github.com/toshio-shiratori/kizuna.git
cd kizuna
pnpm install
pnpm build
pnpm test
```

### Requirements

- Node.js >= 22.0.0
- pnpm >= 11.0.0

### Quality Checks

All of these must pass before submitting a PR:

```bash
pnpm tsc --noEmit    # Type check
pnpm test            # All tests
pnpm lint            # ESLint
pnpm format:check    # Prettier
```

## Code Style

- TypeScript strict mode, ESM modules
- Named exports only (no default exports)
- Async/await over promise chains
- Formatting handled by Prettier (run `pnpm format` to auto-fix)
- Linting handled by ESLint

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` new feature
- `fix:` bug fix
- `docs:` documentation
- `refactor:` code restructuring without behavior change
- `test:` test additions or modifications
- `chore:` maintenance tasks

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
