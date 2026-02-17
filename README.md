# slack

Bun-only monorepo CLI skeleton for Slack MCP-style commands.

## Quick Start

```bash
bun install
bun start -- --help
```

## Global CLI Link

```bash
bun run link:slack
slack --help
```

## Layout

- `apps/cli`: CLI entrypoint (`slack`)
- `packages/commands`: command registry and handlers
- `packages/config`: shared command/resource spec

## Examples

```bash
bun start -- resources
bun run --cwd=apps/cli src/main.ts --help
```
