# pkg/text

## responsibility

- flatten Slack blocks, legacy attachments, and email-file metadata
- preserve explicit message text before using fallback content
- normalize Slack/Markdown/HTML links for CSV output
- remove display-corrupting and bidi-control runes
- enforce unfurl domain allowlists
- convert Slack timestamps, workspace URLs, and certificates

## contract

| function | behavior |
|---|---|
| `BlocksToText` | header, section fields, context text, rich text/list/quote/code to flat text |
| `FilesToText` | email sender, CC, and subject metadata; obfuscates `@` as ` at ` |
| `AttachmentToText` | title/link, author, pretext, text, fields, footer, nested blocks |
| `AttachmentsTo2CSV` | append flattened legacy attachments to base message text |
| `ProcessText` | normalize links, strip unsafe runes, collapse inline spaces |
| `IsUnfurlingEnabled` | false/true/domain-list policy with public-suffix validation |
| `TimestampToIsoRFC3339` | Slack seconds.microseconds to UTC RFC3339 |
| `Workspace` | extract workspace subdomain from Slack URL |

## message-fallback

Handlers preserve non-empty `msg.Text`. `BlocksToText` is used only when text is empty;
`FilesToText` is the next fallback for email files. Legacy attachment content is then appended.

## security

`ProcessText` removes C0/C1 controls except tab/newline/carriage return, DEL, BOM, zero-width space,
LRM/RLM, bidi overrides, and bidi isolates. ZWNJ and ZWJ remain for language shaping and emoji.
Unfurl allowlists reject any detected URL or valid bare domain not explicitly allowed.
