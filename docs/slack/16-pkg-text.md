# pkg/text

## meta

| field | val |
|---|---|
| path | `pkg/text/text_processor.go` |
| pkg | `text` |
| line | 283 |
| test | `text_processor_test.go` (163 line) |

## responsibility

- Slack attachment → flat text conversion
- link normalization (Slack-style `<URL\|Text>`, markdown, HTML `<a>`)
- security-conscious unfurl domain whitelist via `publicsuffix`
- Slack timestamp → RFC3339 conversion
- x509 cert → human-readable format
- workspace name extraction from Slack URL

## contract

| fn | sig | param | return | err |
|---|---|---|---|---|
| `AttachmentToText` | `func(att slack.Attachment) string` | attachment | one-line text | — |
| `AttachmentsTo2CSV` | `func(msgText string, attachments []slack.Attachment) string` | msg text, attachment arr | comma-sep string | — |
| `IsUnfurlingEnabled` | `func(text string, opt string, logger *zap.Logger) bool` | text, opt, logger | bool (safe to unfurl) | log security warning |
| `Workspace` | `func(rawURL string) (string, error)` | Slack URL | workspace subdomain | parse fail |
| `TimestampToIsoRFC3339` | `func(slackTS string) (string, error)` | Slack timestamp (`1234567890.123456`) | RFC3339 UTC string | parse fail |
| `ProcessText` | `func(s string) string` | text | normalized text | — |
| `HumanizeCertificates` | `func(certs []*x509.Certificate) string` | cert arr | `CN=... (Issuer CN=..., expires YYYY-MM-DD)` | — |

## deps

| dep | why |
|---|---|
| `github.com/slack-go/slack` | `slack.Attachment` type |
| `golang.org/x/net/publicsuffix` | domain validation for unfurl security |
| `go.uber.org/zap` | log security warning |

## edge-case

| case | symptom | fix |
|---|---|---|
| unfurl opt `"yes"`/`"true"`/`"1"` | enable all domain | return true |
| unfurl opt `"no"`/`"false"`/`"0"`/`""` | disable | return false |
| unfurl opt domain whitelist | `"example.com,trusted.org"` | validate all URL + bare domain in text against whitelist via `publicsuffix.EffectiveTLDPlusOne()` |
| mixed positive/negative domain | `"example.com,!evil.com"` | not supported, treat as positive-only |
| invalid TLD in text | `"http://invalid"` | skip validation for that URL, log warning |
| Slack link `<https://example.com\|text>` | extract URL + text | convert to `https://example.com - text` |
| markdown link `[text](https://example.com)` | extract URL + text | convert to `https://example.com - text` |
| HTML link `<a href="...">text</a>` | extract URL + text | convert to `... - text` |
| non-trailing link | missing comma separator | insert `, ` after link conversion |
| trailing link | no separator | no comma insertion |
| attachment w/ multiple field | Title, Author, Pretext, Text, Footer | join w/ space, strip newline, replace `()` → `[]` |

## test-scope

| test | target | expected |
|---|---|---|
| `TestIsUnfurlingEnabled` | `IsUnfurlingEnabled()` | 12 case: disabled opt, enabled opt, domain whitelist (allowed/disallowed), bare domain, subdomain rejection, port handling, invalid TLD skip |
| `TestFilterSpecialCharsWithCommas` | `filterSpecialChars()` | 7 case: Slack link (middle/end/trailing), two link, markdown link (middle/end) — verify comma insertion |

## xref

| from | to |
|---|---|
| contract | xref:11-pkg-handler#deps |
| contract.HumanizeCertificates | xref:15-pkg-transport#edge-case |
| edge-case.unfurl-security | xref:01-overview#risk |
