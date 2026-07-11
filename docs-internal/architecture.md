# Architecture overview

> How `@clarvis/agent-skills` is wired: a transport-agnostic **library** that resolves a config once,
> scans the **caller-supplied roots** for `SKILL.md` skills, merges them under the array's order
> (ascending precedence, last wins), and serves them through three tiers of progressive disclosure —
> catalog, body, and confined resources. No transport, no agent loop, no network. It reads and serves
> skill content; it **executes nothing**. The clarvis four-root layout is one opt-in preset
> (`clarvisSkillRoots()`), not a built-in default.

This page is a map of the moving parts. It traces a single `createAgentSkills` from entry to
registry, then drills into discovery, parsing, and the resource path — enumeration and confinement.
Every claim links to the source so you can read further. For the canonical per-behaviour contract,
see [`SPEC.md`](../SPEC.md); for a behaviour → `src/` index, see [source-map.md](./source-map.md).

## The big picture

There is no server and no I/O boundary the library owns. The caller resolves a config, asks for the
catalog to advertise to its model, and pulls a skill's body or a resource path on demand. Everything
is synchronous control flow around Node's `fs`.

```text
        your agent loop / MCP server (you own this)
                │  createAgentSkills(options)  ─┐  resolveConfig
                │  .listSkills()               ─┤  → SkillConfig (your options.roots, normalized)
                │  .loadSkill(name)             │  discoverSkills runs ONCE
                │  .resourcePath(name, rel)     │  (.refresh() re-scans the configured roots)
                ▼                               ▼
┌────────────────────────────────────────────────────────────┐
│ DISCOVERY  (src/core.ts → src/registry.ts)                 │
│  roots.map(scanRoot)   ── per-root dedup, malformed skip    │
│  mergeSkills(groups)   ── ascending precedence, LAST WINS   │
│  makeRegistry(byName)  ── list / get / resource / size      │
└───────────────┬────────────────────────────────────────────┘
                │ per root
                ▼
┌────────────────────────────────────────────────────────────┐
│ SCAN  (src/scan.ts)                                        │
│  listSkillDirs  ── one level deep, sorted by dir            │
│  findSkillFile  ── case-insensitive SKILL.md, followSymlinks│
│  → buildResolvedSkill: readFileSync + parseSkill            │
└───────────────┬────────────────────────────────────────────┘
                │ on loadSkill / resourcePath
                ▼
   scan.ts: enumerateResources (walk · visited-real-path loop
            guard · escaping-symlink skip) · paths.ts:
            resolveResourcePath (realpath confinement → path_escape)

  cross-cutting: errors (SkillError · fsError) ·
                 lib/log (WarnSink) · catalog/ (prompt surface)
```

`@clarvis/agent-skills` is a **leaf** library: zero `@clarvis/*` dependencies, just `yaml` + `zod`. It
carries no transport. The downstream [`@clarvis/agent-loop`](https://github.com/getclarvis/agent-loop)
consumes it to inject a catalog into a system prompt and back a `load_skill` tool — the master
switch, credentials, and env reading all live there, not here. This library reads **no environment
variables of its own**.

## Entry and config

The public surface is assembled in
[`src/index.ts`](https://github.com/getclarvis/agent-skills/blob/main/src/index.ts):
`createAgentSkills(options)` calls `resolveConfig(options)` once, runs `discoverSkills(config)` once,
and returns `{ config, listSkills, loadSkill, resourcePath, refresh }`, where each accessor is a thin
bind over the registry. `refresh()` re-runs `discoverSkills(config)` against the same config, so a
fresh scan reflects added, body-modified, and removed skills. The lower-level `discoverSkills` —
which returns a `SkillRegistry`, so callers work its `.list()` / `.get(name)` / `.resource(name, rel)`
directly — the parse and merge primitives, the path helpers, and `resolveConfig` are all re-exported
for callers assembling their own pipeline.

Config resolution lives in
[`src/config.ts`](https://github.com/getclarvis/agent-skills/blob/main/src/config.ts).
`resolveConfig(options)` fills `home` (default `os.homedir()`) and `cwd` (default `process.cwd()`),
and — **only** when an explicit `workspace` is passed — `statSync`-validates that it resolves to an
existing directory, throwing `StartupError` otherwise. It then **normalizes each caller-supplied
`SkillRootInput`** into a concrete `SkillRoot` via the local `normalizeRoot` — resolving `path` with
`resolveAgainst` (`~`→home, a relative path against `<ws>`, an absolute path as-is) and defaulting
`scope` to `"workspace"` and `source` to `""`. It **preserves the array order**: precedence is
whatever order the caller passed. An empty `roots` list throws `StartupError`. There is **no**
built-in root table — the library scans exactly the roots you hand it.

The clarvis convention is one **opt-in preset** built by `clarvisSkillRoots()` in
[`src/preset.ts`](https://github.com/getclarvis/agent-skills/blob/main/src/preset.ts) — four roots in
ascending precedence:

| # | Root | scope | source |
| --- | --- | --- | --- |
| 0 | `~/.agents/skills` | user | agents |
| 1 | `<ws>/.agents/skills` | workspace | agents |
| 2 | `~/.clarvis/skills` | user | clarvis |
| 3 | `<ws>/.clarvis/skills` | workspace | clarvis |

Pass its result as `options.roots` (`createAgentSkills({ roots: clarvisSkillRoots({ workspace }) })`);
an embedder wanting a different layout passes its own roots instead.

`strict` defaults to `DEFAULT_STRICT` (`false`) and `followSymlinks` to `DEFAULT_FOLLOW_SYMLINKS`
(`true`); both are set through the options object. `<ws>` is the `workspace` option, else the cwd —
**never** from the environment. The generic path helpers behind this — `resolveWorkspaceDir`,
`expandHome`, `resolveAgainst` — live in
[`src/paths.ts`](https://github.com/getclarvis/agent-skills/blob/main/src/paths.ts).

## Discovery and the registry

`discoverSkills` ([`src/core.ts`](https://github.com/getclarvis/agent-skills/blob/main/src/core.ts))
is a one-liner over `buildRegistry`
([`src/registry.ts`](https://github.com/getclarvis/agent-skills/blob/main/src/registry.ts)), where
the real assembly happens:

1. **Scan each root** — `config.roots.map(root => scanRoot(root, config))` yields one
   `ResolvedSkill[]` per root, in precedence order.
2. **Merge** — `mergeSkills(groups)` folds the groups into a `Map<name, ResolvedSkill>` with a
   `byName.set` per skill. Because the groups arrive in **ascending precedence** (the caller's array
   order), this is a **last-wins** fold: a later root's skill overrides an earlier root's skill of the
   same `name`. (Under the `clarvisSkillRoots()` preset that means a `.clarvis` skill overrides a
   `.agents` skill, and within a source the workspace copy overrides the user copy — but that is the
   preset's ordering, not a library rule.) A cross-root override is normal precedence — **never** an
   error, even under `strict`.
3. **Freeze the surface** — `makeRegistry(byName, config)` returns the `SkillRegistry`
   (`list` / `get` / `resource` / `size`).

`scanRoot` does per-root deduplication. For each `{ dir, file }` from `listSkillDirs`, it calls
`buildResolvedSkill`; a throw is rethrown under `strict` or otherwise skipped with a warning. If two
directories in **the same root** resolve to the same `name`, the first by sorted directory order is
kept and a warning fires (default), or `duplicate_skill` is thrown (`strict`).

`buildResolvedSkill` reads the manifest (`readFileSync`, mapped through `fsError` on failure),
`parseSkill`s it, and assembles the `SkillInfo`. **Identity is the frontmatter `name`**, not the
directory: when they differ the frontmatter name wins and a non-fatal warning fires. `allowedTools`
is set from `allowed-tools` (falling back to `tools`) when either is declared, and `userInvocable`
defaults to `true`. `metadata` is the **raw validated frontmatter** — normalization only lands on
`allowedTools`.

`makeRegistry`'s surface:

- **`list()`** returns every `SkillInfo` sorted by `name` — the cheap catalog computed at discovery.
- **`get(name)`** returns a `SkillContent` (the `SkillInfo` plus the trimmed `body` and a freshly
  enumerated `resources` array), or `undefined` for an unknown name.
- **`resource(name, rel)`** resolves an absolute path via `resolveResourcePath`, then `statSync`s it:
  an unknown skill or a missing target is `not_found`, a target that is not a file is `not_a_file`.
- **`size`** is the merged skill count.

## Parsing and normalization

[`src/parse.ts`](https://github.com/getclarvis/agent-skills/blob/main/src/parse.ts) splits a raw
manifest into frontmatter and body. `splitFrontmatter` strips a BOM and leading whitespace, then
matches an opening `---` fence, a YAML block, and a closing `---`. A leading `---` with no
well-formed closing fence throws `invalid_skill`; a manifest with no fence at all is treated as an
empty frontmatter over the whole body. The YAML is parsed with `yaml`, and a parse failure becomes
`invalid_skill`. `parseSkill` then validates the parsed object against `skillFrontmatterSchema`
([`src/schema.ts`](https://github.com/getclarvis/agent-skills/blob/main/src/schema.ts)) — a
`zod.passthrough` schema, so unknown keys survive onto `metadata` — and trims the body. A schema
failure (including frontmatter that parses to a non-object scalar) is `invalid_skill`, carrying the
offending path.

`normalizeTools` accepts both YAML shapes — a flow array or a comma-separated string — and reduces
either to a trimmed, blank-dropping `string[]`, identically. `allowed-tools` wins when both it and
`tools` are present.

## Resources: enumeration and confinement

Both resource paths live in
[`src/scan.ts`](https://github.com/getclarvis/agent-skills/blob/main/src/scan.ts) and
[`src/paths.ts`](https://github.com/getclarvis/agent-skills/blob/main/src/paths.ts), and they are
kept in agreement on purpose — enumeration never surfaces a resource that `resourcePath` would
refuse.

- **Enumeration** — `enumerateResources(dir, followSymlinks)` walks the entire skill directory. Loops
  are guarded by a visited **real-path** `Set` (this is a cycle guard, not a depth or count cap).
  Absent directories contribute nothing (`safeReaddir` swallows the read error). The `SKILL.md`
  manifest at the skill root is excluded. A dangling symlink is skipped with a warning, and a
  resource symlink whose real target **escapes** the skill dir is skipped with a warning — which is
  why enumeration agrees with the confinement below. Each surviving file becomes a `SkillResource`
  `{ kind, rel, path }`, where `rel` is POSIX-relative and `kind` is the top segment (`scripts` /
  `references` / `assets` / `examples`, else `other`). Results are sorted by `rel`.
- **Confinement** — `resolveResourcePath(skillDir, rel)` (and the registry's `resourcePath`, which
  wraps it) returns an absolute path guaranteed inside the skill dir. `rel` must be relative and
  non-empty — an empty or absolute `rel` is `invalid_input`. The skill dir is canonicalized with
  `realpath` first, so a skill dir that is itself a symlink into a shared store resolves before the
  check; the existing prefix of the target is canonicalized too, catching symlink hops. A relative
  target escaping the real skill dir — via `../` or a symlink pointing outside — is `path_escape`
  (the absolute/empty `rel` case is already handled above as `invalid_input`). Note the split of
  concerns: `resolveResourcePath` does the confinement only;
  `resourcePath` **additionally** requires the resource to exist (`not_found`) and be a file
  (`not_a_file`).

`followSymlinks` (default `true`) is threaded through discovery and enumeration alike: it governs
whether a symlinked skill **directory**, a symlinked `SKILL.md` **manifest**, and a symlinked
**resource** are followed. Set it `false` to ignore all three.

Manifest matching is **case-insensitive** — `SKILL.md`, `skill.md`, and `Skill.md` are all accepted
(the internal constant is the lowercase `skill.md`). By convention the canonical spelling on disk is
`SKILL.md`.

## Cross-cutting concerns

- **Errors** — [`src/errors.ts`](https://github.com/getclarvis/agent-skills/blob/main/src/errors.ts).
  `SkillError { code, message, fields }` is the one typed error — a consumer catches it and reads
  `.code` (one of the `ErrorCode` union), `.message`, and `.fields` directly, building whatever
  envelope it wants on its side (e.g. `JSON.stringify({ error: err.code, message: err.message,
  ...err.fields })`). `fsError(err, path)` maps a Node `ErrnoException` — `ENOENT` → `not_found`,
  `EISDIR` / `ENOTDIR` → `not_a_file`, else `io_error`. The `ErrorCode` union is `invalid_skill`,
  `duplicate_skill`, `not_found`, `not_a_file`, `path_escape`, `invalid_input`, `io_error`.
- **Warnings** — [`src/lib/log.ts`](https://github.com/getclarvis/agent-skills/blob/main/src/lib/log.ts).
  Every non-fatal event — a malformed skill skipped, an in-root duplicate ignored, a dangling or
  escaping resource symlink, a name/directory mismatch — routes through `warn`, whose default
  `WarnSink` writes to `process.stderr`. `setWarnSink(fn)` redirects it; `setWarnSink(null)` resets to
  the default.
- **The prompt surface** — [`src/catalog/index.ts`](https://github.com/getclarvis/agent-skills/blob/main/src/catalog/index.ts),
  exported as `@clarvis/agent-skills/catalog`. `renderSkillCatalog(skills, { heading? })` (options
  typed `RenderSkillCatalogOptions`) produces a markdown bullet list sorted by `name` (an empty string
  when there are none). The frontmatter `argument-hint` field is preserved verbatim on
  `SkillInfo.metadata` for the consumer to use as it sees fit. This is the `./catalog` analogue of the
  family's other secondary exports: it depends only on the public `SkillInfo` shape, so it stays a
  pure view over discovery.

## The trust model

The library **reads and serves** skill content; it never executes it. A skill body is instructions an
agent may choose to follow, and a skill may bundle a `scripts/` directory — so trust the roots you
point it at, especially the shared `~/.agents/skills` cross-tool store (`skills.sh` / `npx skills`).
Resource-path confinement is **defence-in-depth** for file access — it keeps `resourcePath` from
handing back a path outside the skill dir — not a substitute for OS-level isolation of whatever an
agent does with the content. And the workspace is never taken from the environment: it comes only
from the `workspace` option, else the cwd.

## See also

- [`SPEC.md`](../SPEC.md) — the canonical per-behaviour contract
- [source-map.md](./source-map.md) — behaviour → `src/` index
- [`src/catalog/index.ts`](https://github.com/getclarvis/agent-skills/blob/main/src/catalog/index.ts)
  — the `@clarvis/agent-skills/catalog` prompt surface
- [github.com/getclarvis/agent-skills](https://github.com/getclarvis/agent-skills) — the source
