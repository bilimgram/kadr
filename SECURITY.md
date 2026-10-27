# Security Policy

## Reporting a vulnerability

Please **do not** open public issues for security problems.

Report privately through GitHub's private vulnerability reporting:
[**Report a vulnerability**](https://github.com/bilimgram/kadr/security/advisories/new) (Security tab
→ "Report a vulnerability"). If you can't use GitHub, email **hello@bilimgram.uz** with "Kadr
security" in the subject.

Include affected version, platform, reproduction steps, and impact. We aim to:

| Step                          | Target                                                                |
| ----------------------------- | --------------------------------------------------------------------- |
| Acknowledge report            | 3 business days                                                       |
| Initial assessment            | 7 days                                                                |
| Fix for critical issues       | 30 days                                                               |
| Coordinated public disclosure | within 90 days, credited to the reporter unless they prefer otherwise |

## Supported versions

Before 1.0, only the latest release receives security fixes. After 1.0, the latest minor release and
the previous one are supported.

## Scope highlights

- Desktop app (Electron main process, preload bridge, IPC, custom protocol, native addon)
- Web app and watch pages
- Kadr Server (once released)
- Supply chain: build pipeline, release artifacts, update feed
