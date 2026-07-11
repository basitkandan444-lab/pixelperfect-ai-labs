# Contributing

Thanks for contributing to Pixel Perfect Pro.

## Getting started

```bash
bun install
bun run dev        # http://localhost:8080
```

## Before you open a pull request

Run the full quality gate — it must pass locally and in CI:

```bash
bun run check      # typecheck + lint + format check
bun run build      # production build must succeed
```

Auto-fix formatting with `bun run format`.

## Branch & merge strategy

- `main` is the always-deployable default branch. Protect it: require the CI
  workflow to pass and require at least one review before merge.
- Branch names: `feat/…`, `fix/…`, `chore/…`, `docs/…`.
- Prefer **squash merge** to keep a linear, readable history.
- Keep pull requests small and single-purpose.

## Commit messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):
`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `perf:`, `test:`.
This keeps `CHANGELOG.md` easy to maintain.

## Code conventions

- TypeScript strict mode — no `any` escape hatches without justification.
- File-based routes live in `src/routes/`; never create `src/pages/`.
- Server-only secrets are read **inside** handlers via `process.env`, never at
  module scope and never shipped to the client.
- Never commit secrets. Use Lovable secrets / environment variables.

## Security

Report vulnerabilities privately to the maintainers rather than opening a public
issue. See `docs/RUNBOOK.md` for the incident-response process.
