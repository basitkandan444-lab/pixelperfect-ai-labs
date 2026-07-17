# Security Policy

## Supported versions

Only the latest deployed version of this application is supported. There are no
long-lived release branches — fixes ship forward.

## Reporting a vulnerability

**Do not open a public GitHub issue for security problems.**

Report vulnerabilities privately to the maintainers:

- Use GitHub's **"Report a vulnerability"** (Security → Advisories) if enabled, or
- Contact the maintainers directly (see repository owner / `.github/CODEOWNERS`).

Please include:

- A description of the issue and its impact.
- Steps to reproduce (proof-of-concept if possible).
- Affected URL/endpoint and any relevant logs (with secrets redacted).

We aim to acknowledge reports within a few business days and to provide a
remediation timeline after triage.

## Handling secrets

- Never commit secrets, API keys, or credentials. Server secrets
  (e.g. `LOVABLE_API_KEY`) are provided via the Lovable secrets store and read
  only inside server route handlers.
- `VITE_*` values ship in the client bundle and are public by design — never put
  a secret behind a `VITE_` prefix.

## Incident response

See [`docs/RUNBOOK.md`](../docs/RUNBOOK.md) for the incident-response and
rollback procedures.
