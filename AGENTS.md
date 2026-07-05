# Agent Notes

## Default Scope

Unless the user explicitly asks for landing-page, marketing, demo-capture, or HyperFrames work, ignore that surface during initial codebase discovery.

Start with the signed-in product app, shared app UI, Convex code, tests, and docs that affect live product behavior.

## Ignore First

Do not read, analyze, or modify these paths unless the task is specifically about the landing page, demo routes, or HyperFrames assets:

- `app/page.tsx`
- `components/landing/`
- `public/landing/`
- `hyperframes/moeazi-landing/`
- `app/demo/`
- `lib/demo-fixtures/`

Treat those files as a separate marketing/capture subsystem.

## File Length Rule

- Keep every new file at `300` lines or less.
- Prefer keeping edited files at `300` lines or less too.
- If a change would push a file past that limit, split the work into smaller files or helpers instead of growing one large file.
