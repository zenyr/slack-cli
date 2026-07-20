# pkg/server

## responsibility

- create stdio, SSE, and Streamable HTTP MCP servers
- validate the authoritative 22-name tool set
- conditionally register tools and always register 2 resources
- apply error-recovery, logging, and transport-auth middleware

## authoritative-tool-order

1. `conversations_history`
2. `conversations_replies`
3. `conversations_add_message`
4. `reactions_add`
5. `reactions_remove`
6. `attachment_get_data`
7. `conversations_search_messages`
8. `conversations_unreads`
9. `conversations_mark`
10. `conversations_leave`
11. `conversations_join`
12. `channels_list`
13. `channels_me`
14. `usergroups_list`
15. `usergroups_me`
16. `usergroups_create`
17. `usergroups_update`
18. `usergroups_users_update`
19. `users_search`
20. `saved_list`
21. `saved_update`
22. `saved_clear_completed`

## registration

| class | rule |
|---|---|
| standard read/workflow tools | all when enabled list empty; otherwise named subset |
| add message | env gate or named enabled tool; handler also enforces channel policy |
| reactions | env gate or named enabled tool; handler also enforces channel policy |
| attachment | env gate or named enabled tool; handler validates explicit true value |
| search messages | omitted for bot tokens |
| unreads | omitted for bot tokens |
| saved tools | omitted for bot and OAuth tokens; available only to xoxc/xoxd sessions |

`ValidateEnabledTools` accepts only the 22 names above. `shouldAddTool` combines the explicit
enabled subset with optional env gates. Saved registration additionally depends on token type.

## resource

| URI | handler | MIME |
|---|---|---|
| `slack://<workspace>/channels` | `ChannelsResource` | `text/csv` |
| `slack://<workspace>/users` | `UsersResource` | `text/csv` |

## middleware

| order | effect |
|---|---|
| error recovery | convert returned handler errors to MCP error results |
| logger | log request name/params and duration |
| auth | validate API key for SSE/HTTP; stdio bypasses API-key auth |

## transport

- SSE uses `/sse` and message endpoints supplied by mcp-go.
- Streamable HTTP uses `/mcp`.
- stdio logs to stderr and serves MCP on stdin/stdout.
