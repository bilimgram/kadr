## What and why

<!-- What does this change, and why? Link the issue / ADR / RFC. -->

## How it was tested

<!-- Commands run, platforms tried (Windows / macOS / Linux / browser), screenshots for UI changes. -->

## Checklist

- [ ] PR title follows Conventional Commits (`feat(desktop): …`, `fix(compositor): …`)
- [ ] Commits are signed off (`git commit -s`) — DCO
- [ ] Changeset added if a package's behavior changed (`pnpm changeset`)
- [ ] `pnpm check` passes locally
- [ ] Untrusted input (IPC, files, network) is validated; no secrets, recordings, or transcripts are logged
- [ ] UI changes are keyboard-accessible and labeled
- [ ] Clean-room: no code, assets, or private API details from proprietary products; no GPL/AGPL code
