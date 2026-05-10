# kizuna-plugin-example

A Kizuna plugin template.

## Usage

1. Copy this template and rename the package
2. Install dependencies: `pnpm install`
3. Implement your hooks in `src/index.ts`
4. Run tests: `pnpm test`
5. Build: `pnpm build`

## Configuration

Add to your project's `.kizuna/plugins.json`:

```json
{
  "plugins": {
    "kizuna-plugin-example": {
      "enabled": true,
      "options": {}
    }
  }
}
```

## Development

See [Plugin Development Guide](https://github.com/toshio-shiratori/kizuna/blob/main/docs/08-plugin-development.md) for details.
