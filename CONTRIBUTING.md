# Contributing to @clarvis/agent-skills

Thanks for your interest in contributing! This document covers how to get set up, the quality gate,
and the conventions this codebase follows. By participating you agree to abide by our
[Code of Conduct](CODE_OF_CONDUCT.md).

## Getting started

```bash
git clone https://github.com/getclarvis/agent-skills.git
cd agent-skills
npm install
```

Requires **Node.js >= 20**. There are no external runtime tools to install — discovery and parsing are
pure `node:fs` plus [`yaml`](https://www.npmjs.com/package/yaml) and [`zod`](https://zod.dev/).

## Development workflow

```bash
npm run build          # emit dist/ (tsc, with .d.ts)
npm test               # full vitest suite (contract + integration)
npm run typecheck      # tsc --noEmit (strict)
npm run lint           # eslint
npm run format         # prettier --write (src + tests)
```

Before opening a pull request, make sure the quality gate is green:

```bash
npm run pre-commit     # typecheck + format:check + test:coverage
```

CI runs `typecheck`, `lint`, `format:check`, `test:coverage`, and `build` on pushes and PRs targeting
`main` and `develop`, across a Node matrix (`20.x`, `lts/*`, `current`). `test:coverage` enforces a
**95% coverage gate** (lines, statements, functions, and branches) via the Vitest v8 provider — a drop
below any threshold fails the build.

## Project layout

- `src/index.ts` — the public API (`createAgentSkills`, `clarvisSkillRoots`, `discoverSkills`,
  `parseSkill`, `mergeSkills`, `resolveConfig`, and the error contract).
- `src/config.ts` — config resolution, defaults, and root normalization (`normalizeRoot`).
- `src/preset.ts` — the `clarvisSkillRoots()` convention preset (opt-in; the library ships no default).
- `src/paths.ts` — home/workspace resolution and skill-directory resource-path confinement.
- `src/scan.ts` — the `node:fs` root scan (one level deep, symlink-aware) and resource enumeration.
- `src/parse.ts` / `src/schema.ts` — frontmatter split + the `zod` `SKILL.md` frontmatter schema.
- `src/registry.ts` — the scan → parse → merge pipeline and the ascending-precedence (last-wins) fold.
- `src/errors.ts` — `SkillError`, `fsError`, and the `ErrorCode` union.
- `src/catalog/` — the `./catalog` secondary export (consumer-agnostic rendering helpers).
- `tests/` — `contract/` (one file per source module) and `integration/` (cross-cutting) suites, with
  `helpers/fixtures.ts`.

For the canonical contract, see [`SPEC.md`](SPEC.md); user-facing docs live in [`docs/`](docs/); and
the architecture, source map, and per-subsystem internals live in [`docs-internal/`](docs-internal/).

## Guidelines

- **Match the surrounding style.** The codebase is strict TypeScript with `noUncheckedIndexedAccess`;
  prefer explicit, narrow types over `any`/casts. **No JSDoc or inline comments** unless a
  lint/quality rule requires them.
- **Add tests** for behavior changes. `tests/contract/` guards each module's input/output/error
  contract; `tests/integration/` guards cross-cutting behavior (discovery precedence, the public API,
  malformed-skill handling, symlinked stores). Changing a contract means updating its contract test
  and [`SPEC.md`](SPEC.md) together.
- **Every test tells a real story.** A test names an observable behavior the module guarantees and
  proves it end-to-end. To reach the 95% gate, extend the module's existing story file with a behavior
  the reader would want documented; **never** add a test whose only purpose is to lift the number. A
  branch that no honest scenario exercises is a signal the code is unreachable, not a prompt for a
  synthetic test.
- **Security-sensitive changes** — anything touching resource-path confinement, symlink following, or
  the workspace/home resolution — deserve extra scrutiny. See [SECURITY.md](SECURITY.md).

## Reporting bugs and requesting features

Open a [GitHub issue](https://github.com/getclarvis/agent-skills/issues). For security issues, follow
the private process in [SECURITY.md](SECURITY.md) instead.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
