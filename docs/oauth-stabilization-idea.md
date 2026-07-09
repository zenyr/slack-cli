# OAuth Stabilization Idea

## Context

Current auth flow accepts manually supplied Slack tokens:

- `SLACK_MCP_XOXP_TOKEN` / `SLACK_MCP_XOXB_TOKEN` env vars
- `slack auth login --type <xoxp|xoxb> --token <token>`
- persisted local store at `~/.config/slack-cli/auth.json`

This is acceptable for personal development, but not safe or ergonomic for team sharing. Team members should not create, paste, or share raw `xoxp` / `xoxb` tokens.

## Target Direction

Make Slack OAuth v2 the default auth path.

```text
slack auth login
-> CLI opens browser
-> user approves Slack app install
-> OAuth broker exchanges code with Slack
-> CLI receives completion result
-> CLI stores token securely
-> slack auth whoami/check verifies session
```

Manual token login should remain only as a development escape hatch, for example `slack auth login --manual --type <xoxp|xoxb> --token <token>`.

## Architecture

### Slack App

Use one Slack App as the official distribution unit. Manage scopes and redirect URLs through an app manifest so setup is reproducible.

### OAuth Broker

Do not embed Slack `client_secret` in the CLI. Add a small broker service that owns the Slack OAuth secret and handles code exchange.

Broker responsibilities:

- create short-lived login session
- generate Slack authorize URL
- validate `state`
- receive Slack OAuth callback
- call `oauth.v2.access`
- store or return installation token data safely
- handle token refresh if Slack token rotation is enabled

### CLI

CLI responsibilities:

- start login session with broker
- open browser to authorize URL
- wait for completion via polling or local callback
- persist received installation credentials in secure local storage
- run `auth.test` / `whoami` after login

## Token Policy

Default to bot token (`xoxb`) for shared/team workflows.

Use user token (`xoxp`) only for commands that require user-level permission.

Examples:

| Command area | Preferred token | Notes |
|---|---|---|
| message post/reply/update | `xoxb` | bot identity is predictable |
| channel/user lookup | `xoxb` | use bot scopes where possible |
| message search | `xoxp` | Slack search commonly requires user token |
| user status set/clear | `xoxp` | acts as current user |

Command execution should check required token type and scopes before calling Slack when possible. If scope is missing, return a clear re-auth message with the required scope.

## Storage

Replace plaintext token storage with OS credential storage:

- macOS Keychain
- Windows Credential Manager
- Linux Secret Service

Keep JSON file storage only as explicit development fallback. The current `~/.config/slack-cli/auth.json` format should not be the default for team distribution.

Recommended stored model:

```json
{
  "activeWorkspaceId": "T...",
  "workspaces": {
    "T...": {
      "teamName": "Example",
      "botTokenRef": "keychain-ref",
      "userTokenRef": "keychain-ref",
      "scopes": ["chat:write", "users:read"],
      "expiresAt": 1790000000
    }
  }
}
```

Store raw token values in keychain, not in this metadata file.

## Stability And Safety Requirements

- `state` validation for CSRF protection
- short login session TTL, e.g. 5-10 minutes
- workspace/team ID validation after callback
- clear multi-workspace active selection
- explicit logout that removes local credentials
- optional Slack token revoke on logout
- token refresh path if token rotation is enabled
- scope drift detection and re-auth prompt
- structured `--json` output that reports token source/type without exposing token value

## Implementation Steps

1. Add command metadata for required token type and Slack scopes.
2. Change `auth login` default flow to OAuth start.
3. Move current raw-token login behind an explicit manual/dev flag.
4. Add OAuth broker API client to `packages/auth`.
5. Replace plaintext store with a credential-store abstraction.
6. Add workspace-aware auth state instead of only active token type.
7. Add tests for OAuth session state, scope checks, token resolution, and logout.
8. Update README auth docs and Slack App manifest setup docs.

## Key Decision

Team-safe sharing requires operating an OAuth broker. A pure local CLI flow cannot safely keep Slack `client_secret`, so it should not be the default distribution model.
