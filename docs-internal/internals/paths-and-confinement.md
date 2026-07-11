# Internals: paths and confinement

Source-level reference for `src/paths.ts` — the generic path helpers and the resource-confinement
core. The user-facing model lives at
[resource confinement](https://agent-skills.clarvis.dev/explanation/resource-confinement) and
[error codes](https://agent-skills.clarvis.dev/reference/error-codes) (plus
[SECURITY.md](../../SECURITY.md)); this page covers the canonicalization mechanics — the
non-existent-path handling, the `+ sep` prefix guard, and why the resolver returns a non-canonical
path and stats nothing — that the published pages omit.

## Source files

| Path | Responsibility |
|---|---|
| [`src/paths.ts`](https://github.com/getclarvis/agent-skills/blob/main/src/paths.ts) | `expandHome`, `resolveAgainst`, `resolveWorkspaceDir`, and the confinement core `resolveResourcePath` (plus internal `canonicalize` / `canonicalizeAllowingMissing`). |
| [`src/config.ts`](https://github.com/getclarvis/agent-skills/blob/main/src/config.ts) | `normalizeRoot` — resolves each caller-supplied root `path` with `resolveAgainst` and defaults its `scope`/`source` into a `SkillRoot`. |
| [`src/preset.ts`](https://github.com/getclarvis/agent-skills/blob/main/src/preset.ts) | `clarvisSkillRoots` — the opt-in builder that assembles the clarvis four-root `SkillRootInput[]` (`.agents`/`.clarvis` under home and `<ws>`). |
| [`src/registry.ts`](https://github.com/getclarvis/agent-skills/blob/main/src/registry.ts) | `registry.resource` — layers the existence + is-file checks on top of `resolveResourcePath`. |
| [`src/scan.ts`](https://github.com/getclarvis/agent-skills/blob/main/src/scan.ts) | `enumerateResources` — walks the skill tree under the same boundary (`escapesRoot`). |

## Exports

| Symbol | Kind | Notes |
|---|---|---|
| `expandHome(p, home)` | function | `~` → `home`, `~/x` → `join(home, "x")`; anything else returned verbatim. |
| `resolveAgainst(base, p, home)` | function | `expandHome` then absolutize — an absolute result is kept, a relative one is `resolve`d against `base`. This is the exact rule `normalizeRoot` applies to each root `path`. |
| `resolveWorkspaceDir(workspace, cwd, home)` | function | `workspace === undefined` → `cwd`, else `resolveAgainst(cwd, workspace, home)`. |
| `resolveResourcePath(skillDir, rel)` | function | The confinement choke point. Returns an absolute path guaranteed inside `skillDir`, or throws `invalid_input` / `path_escape`. |

`canonicalize` and `canonicalizeAllowingMissing` are module-private in `paths.ts`.

## Resolving the roots

`src/paths.ts` no longer knows anything about the clarvis folder layout — it ships only the generic
helpers above. Two callers use them to turn caller input into concrete roots:

- **`normalizeRoot`** ([`config.ts`](https://github.com/getclarvis/agent-skills/blob/main/src/config.ts))
  maps each caller-supplied `SkillRootInput` into a `SkillRoot`, resolving its `path` with
  `resolveAgainst(<ws>, path, home)` (`~`→home, a relative path against `<ws>`, an absolute path as-is)
  and defaulting `scope` to `"workspace"` and `source` to `""`. The array order is preserved — it *is*
  the precedence (ascending, last wins).
- **`clarvisSkillRoots`** ([`preset.ts`](https://github.com/getclarvis/agent-skills/blob/main/src/preset.ts))
  is the opt-in builder that emits the clarvis four-root `SkillRootInput[]` — `~/.agents/skills`,
  `<ws>/.agents/skills`, `~/.clarvis/skills`, `<ws>/.clarvis/skills`, in that ascending order, each
  pre-labelled with its `scope`/`source`. The caller passes its result as `options.roots`; the library
  applies no roots by default.

`<ws>` is `resolveWorkspaceDir(workspace, cwd, home)`: the `workspace` option when given, otherwise
`cwd`. Because `resolveAgainst` runs `expandHome` first, a `workspace` such as `~/proj` resolves
against the home dir. The workspace is **never** read from the environment — nothing in `paths.ts`
consults `process.env`.

## How resource confinement works

`resolveResourcePath` is the single choke point `registry.resource` routes every resource path
through:

```ts
if (rel.length === 0) throw new SkillError("invalid_input", "resource path must not be empty");
if (isAbsolute(rel)) throw new SkillError("invalid_input", `resource path must be relative: ${rel}`, { rel });
const abs = resolve(skillDir, rel);
const dirReal = canonicalize(skillDir);
const targetReal = canonicalizeAllowingMissing(abs);
if (targetReal !== dirReal && !targetReal.startsWith(dirReal + sep)) {
  throw new SkillError("path_escape", `resource path escapes the skill directory: ${rel}`, { rel });
}
return abs;
```

Step by step:

1. **Reject an empty or absolute `rel` up front** with `invalid_input`, before touching the
   filesystem. These never reach the escape check.
2. `abs = resolve(skillDir, rel)` — the literal join, **not** canonicalized.
3. `dirReal = canonicalize(skillDir)` — `realpathSync.native`, falling back to `path.normalize` if
   the dir can't be resolved. A skill dir that is **itself** a symlink into a shared store (for
   example `~/.agents/skills/<name>` populated by `npx skills`) resolves to its real location before
   the check, so containment is measured against the true directory.
4. `targetReal = canonicalizeAllowingMissing(abs)` — see below.
5. Reject with `path_escape` unless `targetReal === dirReal` **or** `targetReal` starts with
   `dirReal + path.sep`. The `+ sep` is load-bearing: it stops a sibling like
   `/skills/release-evil` from passing the prefix test against `/skills/release`.

### It returns the non-canonical path

The value checked (`targetReal`, canonicalized) and the value returned (`abs`, the raw
`resolve(skillDir, rel)`) are deliberately different. Canonicalization exists **only to make the
containment decision honest** — the caller gets back a stable, human-meaningful path under the skill
dir, not a realpath that may point off into a shared content store. Don't "helpfully" return
`targetReal`.

### No existence check here

`resolveResourcePath` never `stat`s `abs`. It answers exactly one question — *does this `rel` stay
inside the skill dir?* — and nothing else: the target need not exist, and if it does it may be a
directory. Layering existence and is-file on top is `registry.resource`'s job (reached via
`resourcePath(name, rel)`): it `statSync`s the returned `abs`, throwing `not_found` when the stat
fails and `not_a_file` when the target is not a regular file. Keep `resolveResourcePath` a **pure
resolver** — that split is what lets it be exported for callers that only need the boundary check.

## Canonicalizing a path that doesn't exist yet

A resource can be addressed before it is created, so we can't `realpath` the whole target.
`canonicalizeAllowingMissing` walks **up** from `abs` to the deepest existing ancestor, canonicalizes
that real prefix, then re-joins the missing tail:

```text
abs = /skills/release/references/new.md   (only /skills/release/references exists)
  → climb: new.md is missing; /skills/release/references exists
  → real = realpath(/skills/release/references)
  → result = join(real, "new.md")
```

So a symlink anywhere in the **existing** prefix is resolved (and thus caught if it escapes), while
the yet-to-be-created tail is taken literally. If the climb reaches the filesystem root without
finding an existing dir, it returns `path.normalize(abs)`.

## Enumeration mirrors the guard

`enumerateResources` in [`scan.ts`](https://github.com/getclarvis/agent-skills/blob/main/src/scan.ts)
walks the skill tree under the **same** boundary via `escapesRoot`, whose test is the same
`real === rootReal || real.startsWith(rootReal + sep)` shape. A resource symlink whose real target
escapes the skill dir is skipped with a warning, so every resource `loadSkill(name).resources` lists
is guaranteed to resolve under `resourcePath` — what you can enumerate, you can resolve. The descent
is bounded by a **visited real-path `Set`** (cutting symlink loops), not a depth or count cap; a
dangling symlink is skipped with a warning. The full trust story is in
[resource confinement](https://agent-skills.clarvis.dev/explanation/resource-confinement).

## Maintainer notes

- **Route every resource path through `resolveResourcePath`** — never hand-join `skillDir + rel` and
  skip the check.
- **Keep `resolveResourcePath` pure.** No `stat`, no is-file test — existence (`not_found`) and
  is-file (`not_a_file`) are `registry.resource`'s contract. That separation is why the resolver is a
  usable public export.
- **Don't `realpath` the whole target** of a not-yet-created resource — use the
  `canonicalizeAllowingMissing` semantics already inside `resolveResourcePath`.
- **The `+ sep` prefix guard is load-bearing in two places** — `resolveResourcePath` here and
  `escapesRoot` in `scan.ts`. Drop it in either and a sibling dir sharing a prefix leaks in; change
  them together.
- **`paths.ts` reads no environment.** The workspace comes from the `workspace` option or `cwd`,
  never from `process.env` — don't add an env fallback.
- The path helpers and resource confinement are tested in
  [`tests/contract/paths.test.ts`](https://github.com/getclarvis/agent-skills/blob/main/tests/contract/paths.test.ts)
  and, against real temporary skill dirs with live symlinks, in
  [`tests/integration/symlink.test.ts`](https://github.com/getclarvis/agent-skills/blob/main/tests/integration/symlink.test.ts).
  The clarvis root builder is covered in
  [`tests/contract/preset.test.ts`](https://github.com/getclarvis/agent-skills/blob/main/tests/contract/preset.test.ts).
