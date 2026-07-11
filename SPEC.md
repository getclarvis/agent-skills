# @clarvis/agent-skills — Specification

This document specifies the behavior of `@clarvis/agent-skills` — the leaf library that discovers,
parses, merges, and serves `SKILL.md` skills for an LLM agent. It is the canonical contract; the
implementation and tests conform to it. For installation, the family context, and the security model,
see [README.md](./README.md). The library carries **no transport and executes nothing** — it reads
and serves skill content only.

## Conventions

- **A skill** is a directory `<root>/<name>/SKILL.md` — a YAML frontmatter block followed by a
  markdown body. The directory may also carry bundled resources (see
  [Resource enumeration](#resource-enumeration)).
- **The manifest filename is matched case-insensitively.** `SKILL.md`, `skill.md`, and `Skill.md`
  are all accepted (the internal constant is the lowercase `skill.md`). Write it as `SKILL.md`.
- **Identity is the frontmatter `name`, not the directory name.** When they differ the frontmatter
  name wins and a non-fatal warning is emitted. `name` is also the merge key across roots.
- **Discovery is one level deep**: only immediate children of a root are considered
  (`<root>/<name>/SKILL.md`); it is not recursive. Discovery runs **once** inside
  `createAgentSkills`; `refresh()` re-scans the configured roots (reflecting added, body-modified, and
  removed skills).
- **Progressive disclosure** — three tiers of cost:
  1. **Catalog** (`listSkills()`) — `name`, `description`, and the raw validated `metadata`. Cheap;
     computed at discovery.
  2. **Body** (`loadSkill(name).body`) — the trimmed markdown instructions, held in the discovery
     snapshot.
  3. **Resources** (`loadSkill(name).resources`, `resourcePath(name, rel)`) — bundled files,
     enumerated lazily when a skill is opened.
- **Failure is non-fatal by default.** A malformed skill or an in-root name collision is skipped with
  a warning; `strict: true` turns both into thrown `SkillError`s. A missing root is never an error,
  and a cross-root override is never an error (it is normal precedence, not a duplicate).
- **Symlinks.** `followSymlinks` (default `true`) governs three things uniformly: a symlinked skill
  **directory** under a root, a symlinked `SKILL.md` **manifest**, and symlinked **resources** inside
  a skill. With `followSymlinks: false` all three are ignored.
- **The caller supplies the roots.** Discovery scans exactly the roots passed in `options.roots`;
  the library ships **no built-in default**. The `workspace` option is only the base for relative
  roots (else the cwd) and is never read from the environment. The library reads **no environment
  variables of its own** (the downstream agent-loop's `CLARVIS_SKILLS_ENABLED` switch belongs to that
  consumer, not here).
- **Warnings are non-fatal and routed through a sink.** Malformed skills, in-root duplicates, dangling
  symlinks, name/directory mismatches, and escaping resource symlinks all emit a warning to a
  `WarnSink` (default `process.stderr`); see [`setWarnSink`](#warnings).

## Discovery roots & precedence

The caller supplies the roots as `options.roots` — an ordered list scanned in **ascending precedence
(last wins)**. Each root is a `SkillRootInput`:

```ts
interface SkillRootInput {
  path: string;        // "~"/"~/x" expands against home; a relative path resolves against the
                       // workspace (else cwd); an absolute path is used as-is
  scope?: SkillScope;  // "user" | "workspace" — provenance label only; default "workspace"
  source?: string;     // free-form provenance label; default ""
}
```

`scope` and `source` are **pure metadata** — they label a skill's origin on `SkillInfo` but do not
affect resolution or precedence. Precedence is **only** the order of the array: the last root that
declares a given `name` wins. A missing root is never an error (it contributes nothing); passing an
empty `roots` list throws `StartupError`.

The clarvis convention is available as the exported **`clarvisSkillRoots()`** preset (see
[Presets](#presets)) — the four roots `~/.agents/skills`, `<ws>/.agents/skills`, `~/.clarvis/skills`,
`<ws>/.clarvis/skills`, in that (ascending) order. It is **not** a built-in default: an embedder that
wants a different layout passes its own roots.

Merge semantics:

- **Across roots** — a duplicate `name` in a higher-precedence (later) root **overrides** the earlier
  one. Never an error, even under `strict`.
- **Within a single root** — a duplicate `name` keeps the first by sorted directory order and warns
  (default), or throws `duplicate_skill` (`strict`).

## Frontmatter schema

Validated with a permissive (`passthrough`) schema — unknown keys are preserved verbatim on
`metadata`. Exported as `skillFrontmatterSchema`.

| Field | Required | Type | Notes |
| --- | --- | --- | --- |
| `name` | yes | string | trimmed, min 1; `^[A-Za-z0-9._-]+$` — no path separators or whitespace; the merge key |
| `description` | yes | string | trimmed, non-empty |
| `version` | no | string | |
| `allowed-tools` | no | `string[]` \| string | primary tool declaration; normalized to `allowedTools` |
| `user-invocable` | no | boolean | defaults to `true` when absent → `SkillInfo.userInvocable` |
| `tools` | no | `string[]` \| string | fallback for `allowed-tools` |
| `argument-hint` | no | string | e.g. `<required> [optional]`; preserved verbatim on `metadata` for the consumer to use as it sees fit |
| `license` | no | string | |
| _(any other key)_ | no | unknown | preserved on `metadata` |

**Tool normalization.** `allowed-tools` (falling back to `tools`; **`allowed-tools` wins** when both
are present) is normalized to `string[]` on `SkillInfo.allowedTools`, which is **absent** when neither
is declared. Both YAML shapes normalize identically: a flow array and a comma-separated string are
each trimmed and stripped of blank entries. `metadata` is the **raw validated frontmatter** — it is
not normalized; normalization only lands on `allowedTools`.

## Public API surface

The primary entry point is `@clarvis/agent-skills`; the presentation helper lives at
`@clarvis/agent-skills/catalog` (see [The catalog export](#the-catalog-export)).

### `createAgentSkills` and `AgentSkills`

```ts
function createAgentSkills(options: AgentSkillsOptions): AgentSkills;

interface AgentSkillsOptions {
  roots: SkillRootInput[];  // REQUIRED — the roots to scan, ascending precedence (last wins)
  workspace?: string;       // base for relative roots; else cwd. Never read from env.
  cwd?: string;             // defaults to process.cwd()
  home?: string;            // defaults to os.homedir()
  strict?: boolean;         // DEFAULT_STRICT = false
  followSymlinks?: boolean; // DEFAULT_FOLLOW_SYMLINKS = true
}

interface AgentSkills {
  readonly config: SkillConfig;
  listSkills(): SkillInfo[];                          // catalog
  loadSkill(name: string): SkillContent | undefined;  // body + resources; undefined if unknown
  resourcePath(name: string, rel: string): string;    // confined absolute path; throws on escape
  refresh(): void;                                     // re-scan the configured roots
}
```

`createAgentSkills` resolves config and runs discovery **once**. `roots` is required — an empty list
throws `StartupError`. An explicit `workspace` that is not an existing directory also throws
`StartupError` (see [Config](#config)). For the clarvis four-root layout, pass
`roots: clarvisSkillRoots({ workspace })` (see [Presets](#presets)).

### Free discovery function

The registry that `createAgentSkills` wraps is also reachable directly:

```ts
function discoverSkills(config: SkillConfig): SkillRegistry;

interface SkillRegistry {
  list(): SkillInfo[];
  get(name: string): SkillContent | undefined;
  resource(name: string, rel: string): string;
  readonly size: number;
}
```

`discoverSkills` returns a `SkillRegistry` — call its `.list()`, `.get(name)`, and
`.resource(name, rel)` directly (`.size` reports the merged skill count).

### Parsing

```ts
function parseSkill(raw: string): ParsedSkill;                          // { frontmatter, body }
function normalizeTools(tools: string[] | string | undefined): string[];
interface ParsedSkill { frontmatter: SkillFrontmatter; body: string; }
```

`parseSkill` splits the frontmatter fence, parses the YAML, validates it against
`skillFrontmatterSchema`, and returns the trimmed body. A missing or misaligned fence, invalid YAML,
frontmatter that parses to a non-object scalar, or a schema failure throws `invalid_skill`.
`normalizeTools` is the shared trim-and-drop-blanks routine used for `allowedTools`.

### Merge

```ts
function mergeSkills(groups: ResolvedSkill[][]): ResolvedSkill[];
```

An **ascending-precedence, last-wins** fold: given one group per root in root order, a later group's
skill overrides an earlier group's skill of the same `name`.

### Config

```ts
function resolveConfig(options: AgentSkillsOptions): SkillConfig;
const DEFAULT_STRICT = false;
const DEFAULT_FOLLOW_SYMLINKS = true;
class StartupError extends Error {}

interface SkillConfig {
  home: string;
  workspaceDir: string;
  roots: SkillRoot[];   // the caller's roots, normalized (path resolved; scope/source defaulted)
  strict: boolean;
  followSymlinks: boolean;
}
```

`resolveConfig` defaults `home` to `os.homedir()` and `cwd` to `process.cwd()`; `workspace`, `strict`,
and `followSymlinks` are set via the options object. It normalizes each `SkillRootInput` into a
`SkillRoot` — resolving `path` (`~`→home, relative→workspace, absolute→as-is) and defaulting `scope`
to `"workspace"` and `source` to `""`. An empty `roots` list throws `StartupError`; an explicit
`workspace` that is not an existing directory throws `StartupError`.

### Presets

```ts
function clarvisSkillRoots(opts?: ClarvisSkillRootsOptions): SkillRootInput[];
interface ClarvisSkillRootsOptions { workspace?: string; cwd?: string; home?: string; }
```

`clarvisSkillRoots` builds the clarvis convention — the four `SkillRootInput` roots, in ascending
precedence: `~/.agents/skills` (user/agents), `<ws>/.agents/skills` (workspace/agents),
`~/.clarvis/skills` (user/clarvis), `<ws>/.clarvis/skills` (workspace/clarvis). The `.agents/skills`
roots are the cross-tool `skills.sh` / `npx skills` shared store; `.clarvis/skills` are
clarvis-specific. It is a plain builder — pass its result as `options.roots`; it is not applied
automatically.

### Paths

```ts
function resolveResourcePath(skillDir: string, rel: string): string; // confined; see below
function resolveWorkspaceDir(workspace: string | undefined, cwd: string, home: string): string;
function resolveAgainst(base: string, p: string, home: string): string;
function expandHome(p: string, home: string): string;
```

These are the general path utilities used to normalize roots and confine resources. `resolveAgainst`
is exactly the rule `resolveConfig` applies to each root `path`. `resolveResourcePath` is the
confinement primitive; its guarantees are specified under [Resource confinement](#resource-confinement).

### Warnings

```ts
function setWarnSink(fn: WarnSink | null): void;   // null resets to the default (process.stderr)
type WarnSink = (message: string) => void;
```

### Schema

```ts
const skillFrontmatterSchema: z.ZodType;   // the zod schema of the table above
```

### Errors

```ts
class SkillError extends Error { readonly code: ErrorCode; readonly fields: Record<string, unknown>; }
function fsError(err: NodeJS.ErrnoException, path: string): SkillError;
type ErrorCode = "invalid_skill" | "duplicate_skill" | "not_found" | "not_a_file"
  | "path_escape" | "invalid_input" | "io_error";
```

### Types

`SkillInfo`, `SkillContent`, `SkillResource`, `SkillScope`, `SkillSource`, `SkillRoot`,
`SkillRootInput`, `SkillRegistry`, `ResolvedSkill`, and `SkillFrontmatter` are all exported (see
[Progressive disclosure](#progressive-disclosure) for the two the caller reads most).

## Progressive disclosure

`SkillInfo` is the catalog entry, computed once at discovery; `SkillContent` extends it with the body
and resources, materialized on open:

```ts
interface SkillInfo {
  name: string;
  description: string;
  metadata: SkillFrontmatter; // the RAW validated frontmatter (passthrough keys preserved)
  allowedTools?: string[];    // absent when neither allowed-tools nor tools is declared
  userInvocable: boolean;     // from `user-invocable`, default true
  scope: SkillScope;          // "user" | "workspace" — the origin root's label
  source: SkillSource;        // free-form origin label (string); e.g. the preset uses "agents"/"clarvis"
  root: string;               // the discovery root the skill came from
  dir: string;                // the skill directory
  path: string;               // the resolved SKILL.md manifest
}

interface SkillContent extends SkillInfo {
  body: string;               // trimmed markdown
  resources: SkillResource[]; // enumerated on open
}
```

`listSkills()` returns the catalog sorted by `name` (`localeCompare`). `loadSkill(name)` returns
`SkillContent` for a known skill or `undefined` for an unknown one; its `resources` are enumerated
each time a skill is opened, not cached.

## Resource enumeration

`loadSkill(name).resources` walks the **entire** skill directory, excluding the `SKILL.md` manifest.
The walk is guarded against symlink **loops** by a visited-real-path `Set` — **not** a depth or count
cap. Each file becomes a `SkillResource`:

```ts
interface SkillResource {
  kind: "scripts" | "references" | "assets" | "examples" | "other";
  rel: string;   // POSIX path relative to the skill dir
  path: string;  // absolute path
}
```

`kind` is derived from the top-level path segment (`scripts`, `references`, `assets`, `examples`, or
`other`). Results are sorted by `rel`. Absent directories contribute nothing. A **dangling** symlink
is skipped with a warning. A resource symlink whose real target **escapes** the skill directory is
skipped with a warning — so enumeration agrees exactly with `resourcePath`'s confinement (a listed
resource is always resolvable).

## Resource confinement

`resourcePath(name, rel)` and the exported `resolveResourcePath(skillDir, rel)` return an absolute
path guaranteed to lie inside the skill directory:

- `rel` must be **relative and non-empty** — an empty or absolute `rel` throws `invalid_input`.
- The skill directory is canonicalized with `realpath` first, so a skill dir that is itself a symlink
  into a shared store resolves before the check. The existing prefix of the target is canonicalized
  too, so symlink hops are caught.
- A target that escapes the real skill directory — via `../` or a symlink pointing outside — throws
  `path_escape` (an empty or absolute `rel` is caught earlier as `invalid_input`).

`resourcePath` **additionally** requires the resource to **exist** (`not_found` if missing) and to be
a **file** (`not_a_file` if it resolves to a directory); it also throws `not_found` when the skill
name itself is unknown. `resolveResourcePath` does **neither** the existence nor the is-file check —
it validates and confines the path only.

## The catalog export

The secondary entry point `@clarvis/agent-skills/catalog` renders a `SkillInfo[]` into the markdown
shape a consumer advertises to a model. It is the analog of agent-tools' `./guard`: pure,
presentation-only, no I/O, no environment reads, and it never mutates the array it is passed.

```ts
import { renderSkillCatalog } from "@clarvis/agent-skills/catalog";

function renderSkillCatalog(skills: SkillInfo[], options?: RenderSkillCatalogOptions): string;

interface RenderSkillCatalogOptions { heading?: string; }
```

**`renderSkillCatalog`** — renders a markdown section for a system-prompt preamble: the heading
(default `# Available skills`), a blank line, then one `- **<name>** — <description>` bullet per skill,
and a trailing newline. Skills are **sorted by `name`** with `localeCompare` (the input is copied, not
reordered in place). An **empty `skills`** returns the empty string `""`.

## Errors

Every fault raises a `SkillError { code, message, fields }`. A consumer catches it and reads `.code`
(one of the seven `ErrorCode` values below), `.message`, and `.fields` directly — building its own
envelope if it wants one (e.g. `JSON.stringify({ error: err.code, message: err.message, ...err.fields })`).
`fsError(err, path)` maps a Node `ErrnoException` (`ENOENT` → `not_found`, `EISDIR`/`ENOTDIR` →
`not_a_file`, else `io_error`). `StartupError` is separate — a config-time failure thrown by
`resolveConfig`, not a `SkillError`.

| Code | Meaning |
| --- | --- |
| `invalid_skill` | Malformed frontmatter or body: a missing/misaligned `---` fence, invalid YAML, frontmatter that parses to a non-object scalar, or a schema failure. |
| `duplicate_skill` | The same `name` appears twice within one root (`strict` only). |
| `not_found` | Unknown skill name; a missing resource; `fsError` `ENOENT`. |
| `not_a_file` | A `resourcePath` `rel` that resolves to a directory; `fsError` `EISDIR`/`ENOTDIR`. |
| `path_escape` | A resource path escapes the skill directory. |
| `invalid_input` | A bad argument to a public function — an empty or absolute `rel`. |
| `io_error` | A filesystem failure while reading a skill; the `fsError` fallback. |
