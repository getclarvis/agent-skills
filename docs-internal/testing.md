# How to run and extend the test suites

> `npm test` runs the whole suite offline and deterministically with `vitest run` — the `contract/`
> per-module tests plus the `integration/` cross-cutting tests. No network, no mocks, no credentials:
> every test drives the real code against throwaway temp directories seeded on the fly. The library
> executes nothing and reads no environment of its own, so there is nothing to stub.

This guide explains the two test directories that ship with `@clarvis/agent-skills`, how they run, and
the shared fixtures that keep each test hermetic. It maps the npm scripts to the underlying
[Vitest](https://vitest.dev) config so you know exactly what each command exercises.

## Test suites at a glance

| Suite | Directory | In `npm test`? | What it covers |
|---|---|---|---|
| Contract | `tests/contract/` | Yes | One file per source module — `catalog`, `config`, `core`, `errors`, `log`, `parse`, `paths`, `preset`, `scan`, `schema`: the input/output/error contract of that module, called directly against its exported functions. `config` pins root normalization and the empty-roots → `StartupError` guard; `preset` pins `clarvisSkillRoots`. The `registry` fold has no standalone file — its scan → parse → merge pipeline and last-wins root precedence are inherently cross-cutting and proven through `core` and `integration/discovery`. |
| Integration | `tests/integration/` | Yes | Cross-cutting behavior against real temp dirs: the public API end to end (`api.test.ts`), root discovery and last-wins precedence built via the clarvis preset **plus** an arbitrary-non-clarvis-roots neutrality proof (`discovery.test.ts`), malformed/duplicate skip-or-throw handling (`malformed.test.ts`), and the symlinked shared store (`symlink.test.ts`). |

The [Vitest config](https://github.com/getclarvis/agent-skills/blob/main/vitest.config.ts) uses the
`node` environment and includes `tests/**/*.test.ts`, so a single pass discovers and runs both
directories. `npm test` is `vitest run`.

```bash
npm test                          # everything
npx vitest run tests/contract     # one directory
npx vitest run discovery          # one file by name filter
npx vitest                        # watch mode
```

`npm run test:coverage` (`vitest run --coverage`, v8 provider) enforces a **95% gate** on lines,
statements, functions, and branches. Coverage measures `src/**/*.ts` with the barrel (`src/index.ts`)
and the pure type module (`src/types.ts`) excluded — they carry no logic to exercise, which is why
neither has a contract file. CI runs `typecheck`, `lint`, `format:check`, `test:coverage`, and `build`
across a Node matrix (`20.x`, `lts/*`, `current`); the local `pre-commit` gate
(`typecheck && format:check && test:coverage`) runs the same coverage step, so a drop below any
threshold fails the build. There is **no live/model suite** in this package — the library carries no
transport and talks to no service.

## The security-critical tests

Two behaviors are the whole point of the trust model, so their tests earn extra scrutiny — a
regression here is a confinement break, not a cosmetic bug:

- **Resource-path confinement.** `tests/contract/paths.test.ts` pins `resolveResourcePath` /
  `resourcePath`: a `../` traversal, an absolute `rel`, a sibling dir whose name is a prefix of the
  skill dir, and a resource reached through a symlink that points outside all resolve to `path_escape`
  (or `invalid_input` for an empty/absolute `rel`). `tests/integration/api.test.ts` reproves the same
  guarantee through the public `resourcePath`, plus its existence (`not_found`) and is-file
  (`not_a_file`) checks.
- **Symlink following.** `tests/integration/symlink.test.ts` covers the shared `.agents` store: a
  symlinked skill dir is followed with `followSymlinks: true` and ignored when `false`; a resource
  directory that symlinks back into the skill does **not** hang (the visited-real-path guard); a
  dangling skill dir, a dangling `SKILL.md`, and a dangling resource are each skipped with a warning.
  `tests/contract/scan.test.ts` proves `enumerateResources` skips a resource symlink whose real
  target escapes the skill dir — so enumeration agrees with `resourcePath`'s confinement — while
  keeping one that stays inside.

## Every test tells a real story

The 95% gate is a floor, not a target to game. The rule this suite holds to (see
[CONTRIBUTING.md](../CONTRIBUTING.md)):

- **A test names a behavior, not a line.** Its title reads as a sentence the module guarantees —
  `"lets any .clarvis skill override any .agents skill"`, not `"covers scan.ts 40-42"`. Line numbers,
  byte ranges, and branch identifiers never appear in a `describe` or `it` title.
- **Coverage is a by-product of documenting behavior.** To lift a number, extend the module's story
  file with a scenario a reader would want proven. Never add a file or test whose only purpose is to
  touch a line — there are **no `*-coverage.test.ts` files**, and there should never be.
- **An unreachable branch is a code smell, not a test gap.** If no honest scenario exercises a branch,
  the fix is usually to delete the dead branch, not to contort inputs to reach it.
- **One story file per module.** Every case for a module lives in that module's single contract file,
  grouped into `describe` blocks that read top-to-bottom as happy path → edge cases → error contract.

## The fixtures helper

Everything hangs off
[tests/helpers/fixtures.ts](https://github.com/getclarvis/agent-skills/blob/main/tests/helpers/fixtures.ts).
There is no mock harness because there is nothing to mock — tests run the real `node:fs` scan against
real temp directories:

| Helper | Use |
|---|---|
| `makeHome()` / `makeWorkspace()` | `mkdtemp` a throwaway home or workspace under the OS temp dir. Symlink tests use a third `makeWorkspace()` as the external store. |
| `cleanup(dir)` | `rm -rf` a temp dir in teardown. |
| `skillsRoot(base, source)` | Join a base to its `.agents/skills` or `.clarvis/skills` directory — the clarvis preset's four roots come from crossing a home/workspace base with an `"agents"`/`"clarvis"` source. Handy for seeding one specific preset root without building the whole array. |
| `clarvisRoots(home, ws)` | Thin wrapper over `clarvisSkillRoots({ home, workspace: ws })` — returns the four `SkillRootInput` roots to hand to `resolveConfig` / `createAgentSkills` as `options.roots` in the discovery-style tests. |
| `writeSkill(root, name, opts?)` | Seed a `<root>/<name>/SKILL.md` from `{ frontmatter, body, raw, resources, dirName }` — `raw` writes the manifest verbatim (for malformed-fence cases), `dirName` decouples the directory from the frontmatter `name`, and `resources` writes bundled files. |
| `link(target, linkPath)` | `symlinkSync` a skill dir, manifest, or resource for the follow-symlinks cases. |
| `captureWarnings()` | Install a `WarnSink` that records non-fatal warnings into an array; `restore()` resets the sink to the default (stderr) in a `finally`. |
| `makeInfo(overrides?)` | Build a `SkillInfo` in-memory (no disk) for the pure `catalog` renderer, which takes skills as input rather than discovering them. |

Because discovery is real `node:fs`, every scenario owns its own home + workspace and leaves nothing
behind; the roots are constructed with `skillsRoot` (a single preset root) or `clarvisRoots` (the
full four-root array passed as `options.roots`) — or arbitrary paths for the caller-supplied-roots
cases — seeded with `writeSkill`, and torn down with `cleanup`.

## Adding a test

- **Find the module's story file, don't start a new one.** A single module's contract (its arguments,
  output shape, and error codes) → the existing `tests/contract/<module>.test.ts`. Anything that
  crosses modules — discovery precedence, the public API, malformed-skill handling, or the symlinked
  store → `tests/integration/`. A brand-new `tests/contract/` file only appears alongside a brand-new
  source module.
- **Name the behavior.** Write the `it(...)` title as a sentence about what the module does, then make
  the body prove it. If the honest reason for a test is "line 74 was red," stop — see
  [Every test tells a real story](#every-test-tells-a-real-story).
- **Match the glob.** Files must be named `*.test.ts` under `tests/` to be discovered.
- **Stay hermetic.** Use `makeHome()` / `makeWorkspace()` + `cleanup()` (and `skillsRoot` +
  `writeSkill`) so every test owns its own directories. Never touch the repo tree, `$HOME`, or a
  shared path.
- **Assert on warnings, not stderr.** For any skip-with-warn path, wrap the code in `captureWarnings()`
  and assert the recorded message, restoring the sink in a `finally`.
- **Changing a contract?** Update `tests/contract/<module>.test.ts` and the canonical
  [`SPEC.md`](../SPEC.md) together; touch the published reference page as well.
- **Confinement or symlink changes touch the trust model.** Anything affecting resource-path
  confinement, symlink following, or workspace/home resolution must keep the security-critical tests
  above green and warrants a read of [SECURITY.md](../SECURITY.md).

## See also

- [CONTRIBUTING.md](../CONTRIBUTING.md) · [SPEC.md](../SPEC.md) · [SECURITY.md](../SECURITY.md)
- [Configuration reference](https://agent-skills.clarvis.dev/reference/configuration) ·
  [Error codes](https://agent-skills.clarvis.dev/reference/error-codes)
- [Embed in an agent](https://agent-skills.clarvis.dev/guide/embed-in-an-agent) — the public
  `createAgentSkills` walkthrough the `api` integration suite mirrors
