# Internals: registry and merge

Source-level reference for the discovery → merge → registry path. The user-facing description lives at
[how it works](https://agent-skills.clarvis.dev/explanation/how-it-works) and
[create-agent-skills](https://agent-skills.clarvis.dev/reference/create-agent-skills); this page covers
the exact control flow — the per-root dedup, the last-wins fold, and the registry accessors the
published pages omit.

## Source files

| Path | Responsibility |
|---|---|
| [`src/registry.ts`](https://github.com/getclarvis/agent-skills/blob/main/src/registry.ts) | `buildRegistry`, `mergeSkills`, `scanRoot`, `buildResolvedSkill`, and `makeRegistry` — the whole scan → merge → serve pipeline. |
| [`src/core.ts`](https://github.com/getclarvis/agent-skills/blob/main/src/core.ts) | `discoverSkills` — the thin free-function wrapper over `buildRegistry`, returning a `SkillRegistry`. |
| [`src/scan.ts`](https://github.com/getclarvis/agent-skills/blob/main/src/scan.ts) | `listSkillDirs` / `enumerateResources` — the filesystem walk `registry.ts` delegates to. |
| [`src/parse.ts`](https://github.com/getclarvis/agent-skills/blob/main/src/parse.ts) | `parseSkill` / `normalizeTools` — frontmatter split and tool normalization. |
| [`src/index.ts`](https://github.com/getclarvis/agent-skills/blob/main/src/index.ts) | `createAgentSkills` — binds one resolved config to a mutable registry closure. |

## Exports

| Symbol | Kind | Notes |
|---|---|---|
| `discoverSkills(config)` | function | `buildRegistry(config)`. The entry `createAgentSkills` and `refresh()` both call. Returns a `SkillRegistry` — catalog / body / resource access go through its `.list()` / `.get(name)` / `.resource(name, rel)` accessors. |
| `mergeSkills(groups)` | function | Ascending-precedence, last-wins fold of `ResolvedSkill[][]` → `ResolvedSkill[]`. Exported for callers composing their own root groups. |

`buildRegistry(config)` is package-internal — it is **not** re-exported from the barrel; only
`discoverSkills` (its wrapper) is. Also internal (not exported): `scanRoot`, `buildResolvedSkill`,
`makeRegistry`, and `messageOf`.

## `buildRegistry`: the pipeline

`buildRegistry(config)` runs discovery once, top to bottom:

1. **Scan** — `config.roots.map((root) => scanRoot(root, config))`. One `ResolvedSkill[]` per root,
   in the roots' declared order. `config.roots` is the caller's `options.roots`, normalized but
   **order-preserved** by `resolveConfig` (`normalizeRoot` only resolves paths and defaults labels), so
   precedence is **ascending, last wins** in whatever order the caller passed.
2. **Merge** — `mergeSkills(groups)` folds the groups into one flat `ResolvedSkill[]`, last-wins.
3. **Index** — `new Map(mergeSkills(...).map((s) => [s.info.name, s]))` keys the survivors by their
   frontmatter `name` (the merge key throughout).
4. **Serve** — `makeRegistry(byName, config)` closes over that map and returns the `SkillRegistry`.

Discovery is eager and happens exactly once per `buildRegistry` call; there is no lazy per-name scan.
`refresh()` (see below) is the only way to re-run it.

## `scanRoot`: per-root discovery and in-root dedup

`scanRoot(root, config)` turns one root directory into a deduplicated `ResolvedSkill[]`:

- **Enumerate** — `listSkillDirs(root.path, config.followSymlinks)` returns `{ dir, file }` for every
  `<root>/<name>/SKILL.md`, **sorted by directory path** (`localeCompare`). The scan is one level deep,
  not recursive; a missing root yields an empty list (never an error). The manifest is matched
  case-insensitively against the lowercase constant `"skill.md"` — `SKILL.md`, `skill.md`, `Skill.md`
  all resolve.
- **Build** — each entry goes through `buildResolvedSkill`. A throw is caught: under `strict` it
  **rethrows**; otherwise the skill is skipped with a `clarvis-agent-skills: skipping <file>: <reason>`
  warning and the scan continues. This is where a malformed skill (`invalid_skill`) or an unreadable
  manifest (`io_error` from `fsError`) is quarantined without poisoning the root.
- **Dedup** — a `Map<name, ResolvedSkill>` keeps the **first** occurrence of each name. Because
  `listSkillDirs` is dir-sorted, "first" means the earliest directory name. A second directory that
  resolves to the same frontmatter `name` is a within-root duplicate: under `strict` it throws
  `duplicate_skill` (with both `dir` paths in `fields.paths`); otherwise the later one is dropped with
  a `duplicate skill '<name>' … ignored (already defined in <dir>)` warning.

A duplicate name **across** roots is not a duplicate here — each root is scanned independently, and the
higher-precedence copy simply overrides during merge. `duplicate_skill` fires only within a single root.

## `buildResolvedSkill`: one manifest → one `ResolvedSkill`

`buildResolvedSkill(root, dir, file)`:

1. **Read** — `readFileSync(file, "utf8")`; a failure is mapped through `fsError(err, file)` (so an
   ENOENT becomes `not_found`, EISDIR/ENOTDIR `not_a_file`, anything else `io_error`) and thrown.
2. **Parse** — `parseSkill(raw)` splits the `---` fence, `yaml.parse`s the frontmatter, and validates
   it against `skillFrontmatterSchema`; the body is `.trim()`med. Any structural or schema failure
   throws `invalid_skill`.
3. **Identity check** — `basename(dir)` is compared to `frontmatter.name`. On mismatch the frontmatter
   name **wins** (it is the merge key) and a non-fatal `skill name '<name>' does not match directory
   '<dirName>'` warning fires. The directory name is otherwise never used for identity.
4. **Tools** — `frontmatter["allowed-tools"] ?? frontmatter.tools`; `allowed-tools` wins when both are
   present. When either is declared, the value (flow array or comma-separated string, treated
   identically) is passed through `normalizeTools` — trim each token, drop blanks — onto
   `info.allowedTools`. When **neither** is declared, `allowedTools` is omitted from `SkillInfo`
   entirely (a declared-but-empty value can still normalize to `[]`).
5. **Assemble** — the `SkillInfo` is built: `name`, `description`, `metadata` (the **raw** validated
   frontmatter, unknown keys preserved by the schema's `.passthrough()` — not a normalized copy),
   `userInvocable` (`frontmatter["user-invocable"] ?? true`), and the provenance fields carried from
   the root (`scope`, `source`, `root`, `dir`, `path`). The `ResolvedSkill` pairs that `info` with the
   trimmed `body`.

## `mergeSkills`: the last-wins fold

```ts
export function mergeSkills(groups: ResolvedSkill[][]): ResolvedSkill[] {
  const byName = new Map<string, ResolvedSkill>();
  for (const group of groups) {
    for (const skill of group) {
      byName.set(skill.info.name, skill);
    }
  }
  return [...byName.values()];
}
```

The fold is deliberately trivial: iterate the groups **in the order given** and `set` each skill by
name, so a later group overwrites an earlier one. Correctness therefore depends entirely on the caller
passing groups in **ascending precedence** — which `buildRegistry` does, because `config.roots`
preserves the order of the caller's `options.roots`. `mergeSkills` reads no ordering field off
`SkillRoot`; the fold trusts input order alone, so the root array order is the only thing that encodes
precedence. The library itself has **no opinion** on how roots rank — it scans exactly what it is
handed. Under the opt-in `clarvisSkillRoots()` preset the emitted order happens to make `source`
primary (`.clarvis` roots sit after `.agents`) and `scope` the tiebreak (workspace after user), but
that ranking is the preset's array, not a rule `mergeSkills` enforces.

## `makeRegistry`: the three-tier accessor

`makeRegistry(byName, config)` returns the `SkillRegistry` closing over the merged map — the three
progressive-disclosure tiers plus `size`:

- **`list()` (tier 1, catalog)** — `[...byName.values()].map((s) => s.info)` sorted by name
  (`localeCompare`). Cheap: every field was computed at discovery; no filesystem access.
- **`get(name)` (tier 2, body)** — `undefined` for an unknown name; otherwise `{ ...info, body,
  resources: enumerateResources(dir, config.followSymlinks) }`. The resource walk is done **lazily
  here**, not at discovery, so `list()` stays cheap. `body` is the already-trimmed markdown.
- **`resource(name, rel)` (tier 3, files)** — `not_found` for an unknown skill; otherwise
  `resolveResourcePath(skill.info.dir, rel)` computes a confined absolute path (relative, non-empty,
  realpath-checked to stay inside the skill dir — else `invalid_input` / `path_escape`). Then this layer
  adds two checks the resolver does not: `statSync` throwing → `not_found` ("No such resource"), and a
  target that is not a file → `not_a_file`. The returned path is guaranteed to be an existing file
  inside the skill directory.
- **`get size()`** — `byName.size`, the count of merged (post-override) skills.

## `src/core.ts`: the thin wrapper

`core.ts` is a single one-liner that lets callers work against a bare `SkillConfig` without the
`createAgentSkills` object:

```ts
export const discoverSkills = (config) => buildRegistry(config);
```

`discoverSkills` returns a `SkillRegistry`; catalog, body, and resource access all go through the
registry's own `list()` / `get(name)` / `resource(name, rel)` accessors, or through the bound
`AgentSkills` methods (`listSkills` / `loadSkill` / `resourcePath`). `createAgentSkills`
(`src/index.ts`) builds on the same wrapper: it resolves the config once, holds `discoverSkills(config)`
in a mutable closure, and `refresh()` re-assigns it by calling `discoverSkills(config)` again — a full
re-scan of the configured roots that reflects added, body-modified, and removed skills. The config (and
thus the root set) is fixed for the lifetime of the object.

## Statelessness

`buildRegistry` holds no state between calls and reads no environment — the configured roots come from
`config`, which was resolved from explicit options (roots, workspace; never env). The registry it returns is an
immutable snapshot: the `byName` map is closed over and never mutated after construction, so `list` /
`get` / `resource` are safe to call concurrently. Re-scanning is always a fresh `buildRegistry`, never
an in-place edit.

## Maintainer notes

- **Precedence is input order.** Roots come from the caller's `options.roots`; `resolveConfig`
  preserves their order and `mergeSkills` folds blindly, so a caller that passes roots out of intended
  precedence silently inverts it. The clarvis order is defined once in `clarvisSkillRoots`
  (`src/preset.ts`) — reorder or add a clarvis root there, not in the config layer.
- **`name` is the merge key everywhere** — scan dedup, the merge map, and the registry index all key on
  `frontmatter.name`, never the directory name. A name/dir mismatch only warns.
- **New provenance fields** (alongside `scope` / `source` / `root` / `dir` / `path`) belong on the
  `SkillRoot` and must be threaded through `buildResolvedSkill`'s `SkillInfo` assembly, plus the
  `SkillInfo` type and the `docs/reference` catalog.
- **Keep `metadata` raw.** It is the validated-but-unnormalized frontmatter (passthrough keys intact);
  normalization lands only on `allowedTools`. A consumer relying on unknown frontmatter keys reads them
  from `metadata`.
- **A skill that fails to build is quarantined, not fatal** (default mode) — never let
  `buildResolvedSkill` throw a non-`SkillError` for an expected failure; `strict` callers should always
  receive a coded `SkillError` (with a `code` from the `ErrorCode` union), not a bare `Error`. Map
  filesystem errors through `fsError`.
