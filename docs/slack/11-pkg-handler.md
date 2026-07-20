# pkg/handler

## meta

| field | val |
|---|---|
| path | `pkg/handler/` |
| pkg | `handler` |
| source | `conversations.go`, `channels.go`, `usergroups.go`, `saved.go` |
| test | matching `*_test.go` files |

## responsibility

- implement 22 MCP tool handlers and 2 resource handlers
- parse/validate MCP arguments and resolve channel/user identifiers
- enforce write/download gates
- map Slack responses to compact CSV/text/JSON/native image results
- preserve message content from text, blocks, legacy attachments, and email files

## contract

### conversation, reaction, attachment, user

| tool | key input | result | notable behavior |
|---|---|---|---|
| history | channel, activity, cursor, limit | message CSV | duration or numeric range |
| replies | channel, thread timestamp, cursor, limit | message CSV | strict thread lookup |
| add message | channel, text/content type, blocks, thread | confirmation | blocks take rendering precedence; text is fallback |
| search | query/filter/date/page controls | message CSV | URL shortcut; two bounded 429 retries |
| unreads | channel types, limits, mention/mute flags | note + CSV | Edge counts or bounded xoxp scan |
| mark | channel, optional timestamp | confirmation | opt-in env gate |
| join/leave | channel | confirmation | name/ID resolution; Edge leave fallback on enterprise session |
| reactions add/remove | channel, timestamp, emoji | confirmation | shared channel policy gate |
| attachment | file ID | JSON or MCP image | 5 MiB; text/plain base64/image transport split |
| users search | required query, limit | user CSV | direct user-ID path; OAuth cache or Edge search |

### channel

| tool/resource | key input | result |
|---|---|---|
| `channels_list` | types, sort, limit, cursor, query, query targets | channel CSV |
| `channels_me` | types, limit, native cursor | member-channel CSV |
| channel resource | `slack://<workspace>/channels` | channel CSV |

`channels_list` query uses case-insensitive literal substring matching over `name`, `topic`, and/or
`purpose`, after type filtering and before local pagination.

### usergroup and saved

| tool | behavior |
|---|---|
| `usergroups_list` | optional users/count/disabled fields |
| `usergroups_me` | list, join, or leave current user's groups |
| `usergroups_create/update` | mutate metadata and default channels |
| `usergroups_users_update` | replace complete member list |
| `saved_list` | auto-page saved/completed/archived items; optionally fetch message content |
| `saved_update` | mark complete and/or set due date |
| `saved_clear_completed` | bulk-clear completed items |

Saved handlers call internal Edge APIs and are registered only for xoxc/xoxd sessions.

## message-content

1. Preserve non-empty Slack `text`.
2. If text is empty, render supported header/section/context/rich-text blocks.
3. If still empty, render email file sender, CC, and subject metadata.
4. Append legacy attachment title, author, pretext, text, fields, footer, and nested blocks.
5. Normalize links and remove unsafe control/bidi runes before CSV output.

## edge-case

| case | behavior |
|---|---|
| image attachment | native MCP image content with metadata text |
| other binary attachment | base64 in JSON text result |
| stale name cache | refresh or targeted user patch, then retry |
| xoxp unreads | annotate partial scan and mute-filter limitation |
| saved message inaccessible | retain saved metadata and emit unavailable placeholder |
