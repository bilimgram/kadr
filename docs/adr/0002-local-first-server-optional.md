# 0002. Local-first, server-optional architecture

- Status: Accepted
- Date: 2026-10-27

## Context

The product must be free and open source, cheap for us to run, private for users, and still offer paid
hosted features (sharing, teams, managed AI) and enterprise features (SSO, SCIM, audit, policies).

## Decision

- Every core capability — recording, editing, AI editing (BYOK or local models), export, updates —
  works with **no Kadr server**.
- Basic sharing works against the **user's own S3-compatible bucket** plus a static watch page.
- A separate, optional, self-hostable **Kadr Server** provides multi-user features (comments, analytics,
  workspaces), billing/licensing, and enterprise features. Our hosted "Kadr Cloud" is the same server.
- Subscriptions are verified with **offline-verifiable signed license tokens**; the app never needs a
  server round-trip to record.

## Consequences

- Near-zero infrastructure cost for the open-source project; users own their data.
- Every feature must define its offline behavior; sync and multi-user features are additive.
- Some features (per-video link previews, comments) are only available with a server.
- Two deployment stories to support (static/BYO-bucket and server), mitigated by shared packages.

## Alternatives considered

- **Cloud-first like Loom:** simpler data model, but high hosting cost for a free product, weaker
  privacy, and harder enterprise self-hosting.
- **No server ever:** cannot offer teams, comments, SSO, or subscriptions.
