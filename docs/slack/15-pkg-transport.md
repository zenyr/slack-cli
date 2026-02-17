# pkg/transport

## meta

| field | val |
|---|---|
| path | `pkg/transport/transport.go` |
| pkg | `transport` |
| line | 452 |

## responsibility

- HTTP client factory w/ custom transport
- uTLS fingerprint (Chrome/Firefox/Safari/Edge)
- HTTP/HTTPS proxy w/ CONNECT tunnel + basic auth
- custom CA cert injection (file or embedded HTTP Toolkit CA)
- User-Agent spoofing

## contract

| fn | sig | param | return | err |
|---|---|---|---|---|
| `ProvideHTTPClient` | `func(cookies []*http.Cookie, logger *zap.Logger) *http.Client` | cookie arr, logger | `*http.Client` | — |
| `NewUserAgentTransport` | `func(rt http.RoundTripper, ua string, cookies []*http.Cookie, logger *zap.Logger) *UserAgentTransport` | base transport, UA, cookie arr, logger | transport | — |
| `NewUTLSTransport` | `func(tlsConfig *utls.Config, proxy func(*http.Request) (*url.URL, error), clientHelloID utls.ClientHelloID, logger *zap.Logger) *uTLSTransport` | TLS cfg, proxy fn, ClientHello ID, logger | transport | — |

## type

| name | kind | key field |
|---|---|---|
| `UserAgentTransport` | struct | `roundTripper http.RoundTripper`, `userAgent string`, `cookies []*http.Cookie`, `logger *zap.Logger` |
| `uTLSTransport` | struct | `dialer *net.Dialer`, `tlsConfig *utls.Config`, `proxy func(*http.Request) (*url.URL, error)`, `clientHelloID utls.ClientHelloID`, `http2Transport *http2.Transport`, `logger *zap.Logger` |

## cfg

| env | default | source | effect |
|---|---|---|---|
| `SLACK_MCP_PROXY` | — | `transport.go` | proxy URL; format `http://[user:pass@]host:port`; exclusive w/ CUSTOM_TLS |
| `SLACK_MCP_CUSTOM_TLS` | — | `transport.go` | non-empty → enable uTLS fingerprint |
| `SLACK_MCP_SERVER_CA_TOOLKIT` | — | `transport.go` | non-empty → append embedded HTTP Toolkit CA (PEM, expires 2026-03-13) |
| `SLACK_MCP_SERVER_CA` | — | `transport.go` | file path → load custom CA cert |
| `SLACK_MCP_SERVER_CA_INSECURE` | — | `transport.go` | non-empty → `InsecureSkipVerify=true`; exclusive w/ SERVER_CA |
| `SLACK_MCP_USER_AGENT` | Chrome 136 UA | `transport.go` | custom User-Agent string |

## deps

| dep | why |
|---|---|
| `pkg/text` | `HumanizeCertificates()` for CA cert log |
| `github.com/refraction-networking/utls` | uTLS fingerprinting |
| `golang.org/x/net/http2` | HTTP/2 client connection |
| `go.uber.org/zap` | structured logging |

## edge-case

| case | symptom | fix |
|---|---|---|
| `SLACK_MCP_PROXY` + `SLACK_MCP_CUSTOM_TLS` both set | conflict | fatal: "cannot use both proxy and custom TLS" |
| `SLACK_MCP_SERVER_CA` + `SLACK_MCP_SERVER_CA_INSECURE` both set | conflict | fatal: "cannot use both custom CA and insecure skip verify" |
| proxy auth via URL | `http://user:pass@proxy:8080` | parse, extract basic auth header in CONNECT |
| HTTPS proxy | `https://proxy:443` | TLS handshake to proxy, then CONNECT tunnel |
| HTTP/2 ALPN negotiation fail | fallback to HTTP/1.1 | uTLS advertise h2 + http/1.1 in ALPN, server choose |
| custom CA parse fail | startup fatal | log cert detail via `HumanizeCertificates()`, exit |
| User-Agent detection | map to ClientHello | detect Edge/Firefox/Safari/Chrome in UA → corresponding uTLS fingerprint |

## test-scope

(no test file in codebase; manual verification via HTTP Toolkit or proxy log)

## xref

| from | to |
|---|---|
| contract | xref:02-architecture#component-map |
| cfg | xref:03-runtime#env-var |
| deps.text | xref:16-pkg-text#contract |
