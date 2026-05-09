# @kizuna/plugin-multi-repo-sharing

Kizuna plugin that enables memory sharing across repositories via namespaces. Projects that share the same namespace can access each other's memories during search.

See the [root README](../../README.md) for full project context.

## Installation

```bash
pnpm add @kizuna/plugin-multi-repo-sharing
```

Requires `@kizuna/core` as a peer dependency. Requires Node.js >= 24.0.0.

## Configuration

Add to your Kizuna config in each project that should share memories:

```json
{
  "plugins": [
    {
      "name": "@kizuna/plugin-multi-repo-sharing",
      "enabled": true,
      "options": {
        "namespace": "my-shared-namespace"
      }
    }
  ]
}
```

Projects with the same `namespace` value and a shared database file will see each other's memories. Without a namespace, each project only sees its own memories.

## How It Works

- **`beforeCapture`** -- Tags each chunk with the current project's `repoId` and configured `namespace`.
- **`beforeSearch`** -- Expands search filters to include both the current project's ID and the shared namespace.
- **`afterSearch`** -- Annotates results with `isShared: true` if they came from a shared namespace.
- **`migrations`** -- Creates an index on the namespace metadata field for efficient queries.

## Options

| Option      | Type                | Description                                                                   |
| ----------- | ------------------- | ----------------------------------------------------------------------------- |
| `namespace` | `string` (optional) | Shared namespace identifier. Projects with the same namespace share memories. |

## Exports

- `multiRepoSharing` -- The plugin instance (implements `Plugin`).

## Development

```bash
pnpm build    # Compile TypeScript
pnpm test     # Run vitest
```
