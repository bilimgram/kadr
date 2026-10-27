# 0003. Apache-2.0 license with an open-core `ee/` directory

- Status: Proposed (needs founder sign-off — PLAN D2)
- Date: 2026-10-27

## Context

We want maximum adoption and compatibility with the open-source ecosystem, enterprise legal approval,
and a sustainable business through subscriptions and enterprise licenses.

## Decision

- All code outside `ee/` is licensed under **Apache-2.0** (explicit patent grant, enterprise-friendly,
  compatible with MIT/BSD/ISC dependencies and usable from GPLv3 projects).
- Enterprise-only features (SSO/SAML, SCIM, audit log, MDM policies, advanced retention) will live in
  `ee/` directories under a **source-available commercial license**, the model used by GitLab, Cal.com,
  and PostHog. `ee/` does not exist yet and is created in Phase 6.
- Contributions use the **Developer Certificate of Origin** (`git commit -s`), not a CLA.
- **Clean-room policy:** no code, assets, or private API details from proprietary competitors
  (including Loom). Behavior is reimplemented from public, observable features. AGPL code (e.g. most of
  Cap) is not copied; MIT/Apache code is reused only with attribution in `NOTICE`.

## Consequences

- Anyone, including competitors, may fork and host the Apache-2.0 core. Our moat is product velocity,
  hosted services, managed AI, enterprise features, and support.
- Dependency policy: no GPL/AGPL code in shipped artifacts.
- The DCO check must run on every PR.

## Alternatives considered

- **AGPLv3 (Cap's choice):** prevents closed SaaS forks, but many companies forbid AGPL software, which
  hurts enterprise adoption and ecosystem embedding.
- **MIT:** equally permissive but no explicit patent grant.
- **BSL/FSL (source-available core):** not OSI open source; conflicts with the goal of a true open-source
  project.
