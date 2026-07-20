# runtime

## tool-flow

| tool | handler | capability/gate | output |
|---|---|---|---|
| `conversations_history` | `ConversationsHistoryHandler` | enabled subset | message CSV |
| `conversations_replies` | `ConversationsRepliesHandler` | enabled subset | message CSV |
| `conversations_add_message` | `ConversationsAddMessageHandler` | add-message env or enabled subset | confirmation |
| `reactions_add` | `ReactionsAddHandler` | reaction env or enabled subset | confirmation |
| `reactions_remove` | `ReactionsRemoveHandler` | reaction env or enabled subset | confirmation |
| `attachment_get_data` | `FilesGetHandler` | attachment env or enabled subset; max 5 MiB | JSON text/base64 or MCP image |
| `conversations_search_messages` | `ConversationsSearchHandler` | non-bot token | message CSV |
| `conversations_unreads` | `ConversationsUnreadsHandler` | non-bot; Edge exact or xoxp fallback | note + CSV |
| `conversations_mark` | `ConversationsMarkHandler` | mark env checked in handler | confirmation |
| `conversations_leave` | `ConversationsLeaveHandler` | enabled subset | confirmation |
| `conversations_join` | `ConversationsJoinHandler` | enabled subset | confirmation |
| `channels_list` | `ChannelsHandler` | enabled subset | channel CSV |
| `channels_me` | `ChannelsMeHandler` | enabled subset | member-channel CSV |
| `usergroups_list` | `UsergroupsListHandler` | enabled subset | usergroup CSV |
| `usergroups_me` | `UsergroupsMeHandler` | enabled subset | CSV/confirmation |
| `usergroups_create` | `UsergroupsCreateHandler` | enabled subset | JSON |
| `usergroups_update` | `UsergroupsUpdateHandler` | enabled subset | JSON |
| `usergroups_users_update` | `UsergroupsUsersUpdateHandler` | enabled subset | JSON |
| `users_search` | `UsersSearchHandler` | enabled subset | user CSV |
| `saved_list` | `SavedListHandler` | xoxc/xoxd only | saved/message CSV |
| `saved_update` | `SavedUpdateHandler` | xoxc/xoxd only | confirmation |
| `saved_clear_completed` | `SavedClearCompletedHandler` | xoxc/xoxd only | confirmation |

## notable-schema

- `users_search.query` is required; `U...`/`W...` IDs use direct `users.info`.
- `channels_list` supports `query` and `query_targets=name,topic,purpose`.
- `channels_me` uses `users.conversations` and native cursor pagination.
- message post accepts raw Block Kit; non-empty blocks can be sent without text.
- message conversion preserves non-empty `text`, otherwise uses blocks then email-file metadata;
  legacy attachment text is appended.
- search uses Tier2 plus at most two `Retry-After` retries.
- unreads uses Edge `client.counts` for browser tokens; xoxp scans bounded channel groups and may
  include muted channels when prefs are unavailable.

## cache

| setting | default | behavior |
|---|---|---|
| `SLACK_MCP_CACHE_TTL` | `24h` | `0` keeps cache indefinitely |
| `SLACK_MCP_MIN_REFRESH_INTERVAL` | `30s` | bounds forced refresh |
| `SLACK_MCP_USERS_CACHE` | team-prefixed cache path | user snapshot override |
| `SLACK_MCP_CHANNELS_CACHE` | team-prefixed cache path | channel snapshot override |

Fresh cache loads synchronously. Expired cache is served immediately and refreshed once in the
background. Cold start and forced refresh fetch synchronously. Snapshot replacement is atomic;
disk writes use temp-file rename and mode `0600`.

## resilience

| signal | action |
|---|---|
| handler error/panic | return MCP `isError=true` result |
| channel/user miss | targeted patch or rate-limited forced refresh |
| stale cache | serve stale snapshot while revalidating |
| zero-row refresh | preserve existing ready snapshot |
| Slack search/unread 429 | bounded limiter retry |
| Edge channel failure | fall back to official API where supported |
