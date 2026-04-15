# BetterBrowse

BetterBrowse is a CLI auditor for local React and Next.js apps.

It opens your running app with Playwright, audits configured routes/viewports, and reports practical UI/UX issues such as:

- alignment and spacing consistency
- overflow and clipping
- accessibility labeling issues
- readability issues (contrast and tiny text)

## Install (Consumers)

```bash
npm install --save-dev betterbrowse
```

Then run:

```bash
npx betterbrowse init
npx betterbrowse doctor
npx betterbrowse audit
```

## Development

```bash
npm install
npm run build
npm test
npm run typecheck
```

## Publishing

BetterBrowse is a two-package publish (`@betterbrowse/core` and `betterbrowse`).

Use the workspace scripts from repo root:

```bash
npm run release:check
npm run release:pack
npm run release:publish
```

`release:publish` publishes core first, then CLI, so `npm install betterbrowse` resolves dependencies correctly.

## GitHub Actions

This repo now includes:

- `.github/workflows/ci.yml` (typecheck + test + build on push/PR)
- `.github/workflows/publish.yml` (publishes npm packages on `v*.*.*` tags or manual run)

To enable publishing from GitHub Actions:

1. Add repository secret `NPM_TOKEN` (an npm automation token with publish access to `@betterbrowse/core` and `betterbrowse`).
2. Bump versions in `packages/core/package.json` and `packages/cli/package.json`.
3. Push a tag like `v0.1.1` or run the publish workflow manually.
