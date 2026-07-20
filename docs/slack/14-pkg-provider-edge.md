# pkg/provider/edge

## responsibility

- call undocumented Slack Edge/webclient endpoints with xoxc token and xoxd cookie
- support Enterprise channel/user discovery, exact unread counts, muted preferences, saved items
- apply Slack webclient request fields, response validation, and rate-limit handling

## contract

| area | operation |
|---|---|
| bootstrap | `ClientUserBoot` for workspace/channel/IM/user state |
| channel | generic info, view, search, leave |
| DM | paginated IM list |
| user | search, list, info, channel membership |
| unread | `client.counts` channel/MPIM/IM snapshots |
| preference | `users.prefs.get`, decode nested `all_notifications_prefs`, return muted IDs |
| saved | `saved.list`, `saved.update`, `saved.clearCompleted` |

## saved-schema

| type | field |
|---|---|
| `SavedItem` | item/channel ID, type, message timestamp, state, created/due/completed/updated/snoozed dates, archived flag |
| `SavedCounts` | uncompleted, overdue, archived, completed, total counts |
| list request | filter, limit, cursor, tombstone inclusion, webclient fields |
| update request | item type/ID, message timestamp, optional mark and due date |

Saved endpoints replace deprecated `stars.*` behavior and require browser-session auth.

## channel-schema

Edge channel mapping retains ID, normalized/display name, topic, purpose, members, member count, IM,
MPIM, private/shared/external flags, and archive state. Enterprise browser-session channel fetching
merges Edge data with fully paginated official results and deduplicates by channel ID.

## prefs-schema

`users.prefs.get` returns a raw preference map. `all_notifications_prefs` is itself a JSON-encoded
string; the client unwraps it and selects channel entries with `muted=true`. Missing or malformed
preference data yields no mute set rather than failing unrelated unread retrieval.

## resilience

| case | behavior |
|---|---|
| HTTP 429 | honor `Retry-After` and retry in Edge request path |
| empty pagination cursor/items | stop pagination |
| Edge channel failure | provider marks Edge failed and uses official API fallback |
| saved API error | validate endpoint response and return typed error |
| browser schema drift | isolate failure in Edge package |
