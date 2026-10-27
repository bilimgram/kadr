# Governance

## Roles

- **Contributors** — anyone who opens issues, discussions, or pull requests.
- **Maintainers** — have merge rights for one or more areas listed in
  [`.github/CODEOWNERS`](.github/CODEOWNERS). Every area should have at least two maintainers.
- **Steering lead** — the project founder for now; breaks ties and owns the roadmap
  ([docs/PLAN.md](docs/PLAN.md)). This becomes a maintainer council of 3–5 people once the project
  has five or more active maintainers.

## Decision making

1. Day-to-day changes: lazy consensus on pull requests; one maintainer approval (two for security-sensitive
   areas: Electron main process, IPC, native code, release pipeline).
2. Architecture: an ADR in `docs/adr/`, open for comment for at least 5 business days.
3. Product direction and large features: an RFC in GitHub Discussions, decided by the steering lead
   (later the council) after public discussion.

## Becoming a maintainer

Sustained, high-quality contributions and reviews in an area over roughly three months. Existing
maintainers nominate; the steering lead confirms.

## Commercial relationship

The core is Apache-2.0 open source. Paid offerings (Kadr Cloud, Enterprise) fund development. Features
are not removed from the open-source core to create paid ones. See
[ADR-0003](docs/adr/0003-license-and-open-core.md).
