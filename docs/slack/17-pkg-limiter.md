# pkg/limiter

## meta

| field | val |
|---|---|
| path | `pkg/limiter/limits.go` |
| pkg | `limiter` |
| line | 27 |

## responsibility

- define rate limit tier for Slack API
- wrap `golang.org/x/time/rate.Limiter` w/ pre-configured tier

## contract

| tier | sig | rate | burst | usage |
|---|---|---|---|---|
| `Tier2` | `tier{t: 3*time.Second, b: 3}` | 1 req per 3s | 3 | default for most API |
| `Tier2boost` | `tier{t: 300*time.Millisecond, b: 5}` | ~3.3 req/s | 5 | pagination (DM/IM list, channel search) |
| `Tier3` | `tier{t: 1200*time.Millisecond, b: 4}` | ~0.83 req/s | 4 | user list |

| fn | sig | param | return |
|---|---|---|---|
| `tier.Limiter` | `func(t tier) Limiter() *rate.Limiter` | — | `*rate.Limiter` |

## type

| name | kind | key field |
|---|---|---|
| `tier` | struct | `t time.Duration`, `b int` (burst) |

## deps

| dep | why |
|---|---|
| `golang.org/x/time/rate` | token bucket rate limiter |

## edge-case

| case | symptom | fix |
|---|---|---|
| burst exceed | initial burst allow b req | standard token bucket behavior |
| sustained load | throttle to 1 req per t duration | `rate.Limiter.Wait()` block |

## xref

| from | to |
|---|---|
| contract.Tier2boost | xref:14-pkg-provider-edge#contract |
| contract.Tier3 | xref:14-pkg-provider-edge#contract |
