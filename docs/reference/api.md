# The API

> The lower-level surface under `createAgentSkills`: build a `SkillRegistry` from a config, list and
> load against it, parse and merge skills yourself, and confine a resource path. Most callers want the
> factory — see [createAgentSkills](/reference/create-agent-skills). Reach for these when you need the
> pieces without it.

## `discoverSkills`

```ts
function discoverSkills(config: SkillConfig): SkillRegistry;
```

Runs discovery once and returns a `SkillRegistry`. It scans each configured root in `config.roots` one
level deep (`<root>/<name>/SKILL.md`, matched case-insensitively — never recursive), parses each
manifest, and merges the results by name with ascending precedence. Within a single root a duplicate
name warns and is skipped (or throws `duplicate_skill` when `config.strict`); across roots a
higher-precedence root simply overrides the lower one. The `SkillConfig` — including the ordered
roots and the `strict` / `followSymlinks` options — comes from
[`resolveConfig`](/reference/configuration).

### `SkillRegistry`

```ts
interface SkillRegistry {
  list(): SkillInfo[]; // catalog, sorted by name
  get(name: string): SkillContent | undefined; // body + resources, or undefined
  resource(name: string, rel: string): string; // confined absolute path
  readonly size: number; // number of merged skills
}
```

- **`list()`** — every merged skill's `SkillInfo`, sorted by `name`. Cheap: the merged set is built
  at discovery; the sorted array is (inexpensively) recomputed on each call.
- **`get(name)`** — the `SkillContent` (a `SkillInfo` plus `body` and `resources`) for `name`, or
  `undefined` if there is no such skill. `resources` is enumerated lazily on each call.
- **`resource(name, rel)`** — an absolute path guaranteed inside the skill directory. Throws
  `not_found` for an unknown skill **or** a missing resource, `not_a_file` if `rel` resolves to a
  directory, and inherits `invalid_input` / `path_escape` from `resolveResourcePath`.
- **`size`** — the number of skills after the merge.

`createAgentSkills` wraps exactly this registry: `listSkills()`, `loadSkill()`, and `resourcePath()`
delegate to `list`, `get`, and `resource`, and `refresh()` re-runs `discoverSkills` against the same
config.

## `parseSkill`

```ts
function parseSkill(raw: string): ParsedSkill; // { frontmatter, body }
```

Parse one `SKILL.md`'s text: it strips a leading BOM, splits the leading `---` YAML fence, validates
the frontmatter against [`skillFrontmatterSchema`](#skillfrontmatterschema), and returns the validated
frontmatter alongside the trimmed markdown body. No filesystem access — hand it a string. It throws
`invalid_skill` for a missing or misaligned closing fence, invalid YAML, frontmatter that parses to a
non-object scalar, or any schema failure (the failing key is reported in the error's `at` field). A
file with no frontmatter at all is not an error — `frontmatter` is `{}` and the whole text is the
body — but the schema then rejects it for the missing required `name` / `description`.

```ts
interface ParsedSkill {
  frontmatter: SkillFrontmatter;
  body: string;
}
```

## `normalizeTools`

```ts
function normalizeTools(tools: string[] | string | undefined): string[];
```

Normalise a frontmatter tools value into a fresh `string[]`. Both YAML shapes are handled
**identically** — a flow array (`[Read, Bash]`) and a single comma-separated string (`"Read, Bash"`)
each have every entry trimmed and blanks dropped. `undefined` returns `[]`. This is what fills
`SkillInfo.allowedTools`, drawing from `allowed-tools` and falling back to `tools`; when both keys are
present, `allowed-tools` wins. The result is always a new array — the input is never mutated.

## `mergeSkills`

```ts
function mergeSkills(groups: ResolvedSkill[][]): ResolvedSkill[];
```

Fold per-root skill groups into one list in **ascending precedence** — a later group's skill overrides
an earlier one of the same name (last-wins), keyed on the frontmatter `name`. Pass one group per root,
lowest-precedence first; the result carries one `ResolvedSkill` per name. This is the cross-root
override step, so it **never throws** on a repeated name — a higher root shadowing a lower one is
normal precedence, not a duplicate. (Within-root duplicate detection happens earlier, before the
merge.)

```ts
interface ResolvedSkill {
  info: SkillInfo;
  body: string;
}
```

## `resolveResourcePath`

```ts
function resolveResourcePath(skillDir: string, rel: string): string;
```

Confine a relative path to a skill directory and return the absolute path — pure path arithmetic, no
I/O. `rel` must be relative and non-empty, else `invalid_input` (an absolute `rel` is rejected the
same way). `skillDir` is canonicalized with `realpath` first, and the existing prefix of the target
too, so a `../` climb or a symlink hop that lands outside the real skill directory raises
`path_escape`.

Unlike the registry's `resource` (and the factory's `resourcePath`), this does **not** check that the
target exists or that it is a file — it only guarantees the path stays inside the skill directory. Use
it when you want the confinement guarantee without touching the filesystem; use `resource` /
`resourcePath` when you want a path that is known to point at an existing file.

## `skillFrontmatterSchema`

```ts
const skillFrontmatterSchema: ZodType<SkillFrontmatter>;
```

The `zod` schema every skill's frontmatter is validated against. It is `.passthrough()`, so unknown
keys survive onto `SkillInfo.metadata` untouched. `name` (matching `/^[A-Za-z0-9._-]+$/` — no path
separators or whitespace) and a non-empty `description` are required; `version`, `allowed-tools`,
`tools`, `user-invocable`, `argument-hint`, and `license` are the recognised optional keys. Exported
so a consumer can validate a frontmatter object without going through `parseSkill`.

## Errors & warnings {#errors-warnings}

```ts
class SkillError extends Error {
  readonly code: ErrorCode;
  readonly fields: Record<string, unknown>;
}

type ErrorCode =
  | "invalid_skill" | "duplicate_skill" | "not_found" | "not_a_file"
  | "path_escape" | "invalid_input" | "io_error";

function fsError(err: NodeJS.ErrnoException, path: string): SkillError;

function setWarnSink(fn: WarnSink | null): void;
type WarnSink = (message: string) => void;
```

- **`SkillError`** — the structured error discovery and `resourcePath` / `resolveResourcePath` throw.
  `code` is the stable [error code](/reference/error-codes); `fields` carry structured detail (a
  `path`, `name`, `rel`, `paths`, or the failing frontmatter key `at`). There is no serializer — read
  `code`, `message`, and `fields` at your boundary and build a JSON envelope yourself if you want one.
- **`fsError(err, path)`** — maps a Node `fs` errno (`ENOENT` → `not_found`, `EISDIR`/`ENOTDIR` →
  `not_a_file`, else `io_error`) to a `SkillError` carrying `{ path }`. Useful when writing your own
  reader around the library.
- **`setWarnSink(fn)` / `WarnSink`** — non-fatal warnings (a malformed skill skipped, an in-root
  duplicate ignored, a dangling or escaping resource symlink, a frontmatter-`name`/directory mismatch)
  are written to `process.stderr` by default. `setWarnSink(fn)` redirects them to your own sink (a
  logger, a test buffer); `setWarnSink(null)` resets to stderr. This is a process-global switch, and
  the library reads no environment of its own. Coded failures are `SkillError`s, not warnings.

## Defaults & startup

```ts
const DEFAULT_STRICT: false;
const DEFAULT_FOLLOW_SYMLINKS: true;

class StartupError extends Error {}
```

- **`DEFAULT_STRICT`** — the fallback for `strict`. Left `false`, a malformed skill or an in-root
  duplicate is skipped with a warning; `true` turns both into thrown `SkillError`s.
- **`DEFAULT_FOLLOW_SYMLINKS`** — the fallback for `followSymlinks`. Left `true`, symlinked skill
  directories, manifests, and resources are followed; `false` ignores all three.
- **`StartupError`** — thrown by `resolveConfig` when the explicit `workspace` option is not an
  existing directory. It is a separate class from `SkillError`. See
  [Configuration](/reference/configuration).

## Types

```ts
interface SkillInfo {
  name: string;
  description: string;
  metadata: SkillFrontmatter; // raw validated frontmatter (unknown keys preserved)
  allowedTools?: string[]; // absent when neither allowed-tools nor tools is declared
  userInvocable: boolean; // frontmatter user-invocable, default true
  scope: SkillScope;
  source: SkillSource;
  root: string; // the root the skill was found under
  dir: string; // the skill directory
  path: string; // the SKILL.md manifest
}

interface SkillContent extends SkillInfo {
  body: string; // trimmed markdown instructions
  resources: SkillResource[];
}

interface SkillResource {
  kind: "scripts" | "references" | "assets" | "examples" | "other";
  rel: string; // POSIX-relative path within the skill directory
  path: string; // absolute path
}

type SkillScope = "user" | "workspace";
type SkillSource = string;
```

- **`SkillInfo`** — a catalog entry (tier 1). `metadata` is the **raw** validated frontmatter, not a
  normalized view; normalization only lands on `allowedTools`.
- **`SkillContent`** — a `SkillInfo` plus the loaded `body` and enumerated `resources` (tiers 2 & 3).
- **`SkillResource`** — one bundled file; `kind` comes from the top path segment, and the `SKILL.md`
  manifest is never listed.
- **`SkillScope` / `SkillSource`** — provenance labels: `workspace` vs `user`, and `source` (a
  free-form string; the clarvis preset uses `clarvis` / `agents`). Neither affects precedence.
- **`SkillRoot`** — a normalized discovery root: `{ path, scope, source }` (`source` is a free-form
  string).
- **`SkillRootInput`** — the input root shape accepted in `options.roots`: `{ path, scope?, source? }`;
  `resolveConfig` normalizes it into a `SkillRoot`.
- **`SkillRegistry`** — the object returned by `discoverSkills` (above).
- **`ResolvedSkill`** — `{ info: SkillInfo; body: string }`, the unit `mergeSkills` folds.
- **`SkillFrontmatter`** — `z.infer` of `skillFrontmatterSchema`; the validated frontmatter with
  unknown keys preserved. Identical to `SkillInfo.metadata`.
- **`ParsedSkill`** — `{ frontmatter, body }`, the return of `parseSkill`.

## See also

- [createAgentSkills](/reference/create-agent-skills) — the factory that wraps a `SkillRegistry`
- [Configuration](/reference/configuration) — `resolveConfig` / `SkillConfig` and the configured roots
- [The catalog export](/reference/catalog) — `renderSkillCatalog`
- [Error codes](/reference/error-codes) — reading a `SkillError` and every `code` value
