# @kizuna/plugin-pii-sanitizer

Kizuna plugin that redacts API keys, tokens, and secrets before storage. Operates as a `beforeCapture` hook, replacing sensitive values with `[REDACTED:<type>]` placeholders.

See the [root README](../../README.md) for full project context.

## Installation

```bash
pnpm add @kizuna/plugin-pii-sanitizer
```

Requires `@kizuna/core` as a peer dependency. Requires Node.js >= 24.0.0.

## Configuration

```json
{
  "plugins": [
    {
      "name": "@kizuna/plugin-pii-sanitizer",
      "enabled": true,
      "options": {
        "customPatterns": [{ "name": "my_token", "pattern": "myapp_[A-Za-z0-9]{32}", "flags": "g" }]
      }
    }
  ]
}
```

The `customPatterns` field is optional. Without it, only the default patterns are used.

## Default Patterns

| Name                                           | Matches                                                   |
| ---------------------------------------------- | --------------------------------------------------------- |
| `anthropic_key`                                | `sk-ant-...`                                              |
| `openai_key`                                   | `sk-...`                                                  |
| `github_token` / `github_oauth` / `github_pat` | `ghp_...`, `gho_...`, `github_pat_...`                    |
| `aws_access_key` / `aws_secret_key`            | `AKIA...`, values after `AWS_SECRET_ACCESS_KEY=`          |
| `slack_token`                                  | `xoxb-...`, `xoxp-...`                                    |
| `generic_secret`                               | Values after `secret=`, `token=`, `password=`, `api_key=` |

## Exports

- `piiSanitizer` -- The plugin instance (implements `Plugin`).
- `redactContent(content, patterns)` -- Standalone redaction function.
- `DEFAULT_PATTERNS` -- The built-in redaction patterns.
- `compilePatterns(customPatterns?)` -- Compiles default + custom patterns into `RedactionPattern[]`.

## Development

```bash
pnpm build    # Compile TypeScript
pnpm test     # Run vitest
```
