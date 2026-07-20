# pkg/provider

## responsibility

- abstract official Slack and Edge API methods behind `SlackAPI`
- detect xoxp/xoxb/xoxc token capability and Enterprise Grid routing
- maintain immutable atomic user/channel snapshots
- persist team-prefixed private cache files with stale-while-revalidate
- merge Slack Connect users and patch individual user cache misses

## SlackAPI groups

| group | methods/capability |
|---|---|
| auth/user | auth test, user list/info, Edge user search |
| conversation | history, replies, info, list, user conversations, join, leave, mark |
| message | post, search, reaction add/remove |
| file | metadata and authenticated download |
| unread/prefs | Edge counts and muted-channel preferences |
| saved | Edge list, update, clear completed |
| usergroup | list, members, create, update, replace members |

## cache-contract

| operation | behavior |
|---|---|
| fresh cache load | publish snapshot and return |
| expired cache load | publish stale snapshot, start one background refresh, return |
| cold load | fetch synchronously; ready only after non-empty result |
| forced refresh | fetch synchronously, minimum interval 30s by default |
| user ID miss | fetch one user and atomically publish patched in-memory snapshot |
| channel name miss | force full channel refresh, then retry lookup |
| write | temp file + chmod `0600` + atomic rename |

Default TTL is 24h. `SLACK_MCP_CACHE_TTL=0` disables expiry. Failed background refresh keeps the
stale ready snapshot. Empty API responses do not replace an existing ready snapshot.

## routing

| case | path |
|---|---|
| xoxp/xoxb | official Slack API |
| xoxc/xoxd | Edge APIs where required |
| Enterprise xoxp | official channel API |
| Enterprise browser session | merge Edge channel data with all available official API pages |
| direct `U...`/`W...` user query | `users.info` |
| OAuth text user query | case-insensitive local cache search |
| browser-session text user query | Edge user search |

## key-types

| type | role |
|---|---|
| `UsersCache` | ID->user and username->ID immutable maps |
| `ChannelsCache` | ID->channel and display-name->ID immutable maps |
| `Channel` | ID/name/topic/purpose/member count plus IM/private/external flags |
| `ApiProvider` | cache state, paths, refresh guards, API facade |
| `MCPSlackClient` | official and Edge clients plus token capability flags |

## cfg

| env | default |
|---|---|
| `SLACK_MCP_CACHE_TTL` | `24h` |
| `SLACK_MCP_MIN_REFRESH_INTERVAL` | `30s` |
| `SLACK_MCP_USERS_CACHE` | team-prefixed user cache |
| `SLACK_MCP_CHANNELS_CACHE` | team-prefixed channel cache |
