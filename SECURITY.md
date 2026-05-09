# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability, please report it by [opening an issue](https://github.com/toshio-shiratori/kizuna/issues/new) on GitHub.

For sensitive issues, email toshio.shiratori@gmail.com directly.

## Scope

Kizuna is a local-only tool. All data is stored in a local SQLite file. There are no network services, cloud APIs, or remote data transmission in the core.

## Data Storage

- Memory data is stored in `.kizuna/memory.db` (SQLite) within each project
- No encryption at rest is provided by Kizuna itself; use filesystem-level encryption if needed
- The `pii-sanitizer` plugin can automatically redact API keys and tokens before storage

## Supported Versions

Only the latest version receives security fixes. There is no backport policy.
