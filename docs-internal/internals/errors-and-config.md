# Internals: errors & config

Source-level reference for the error contract, config resolution, and the warning sink. The
user-facing pages live at
[error codes](https://agent-skills.clarvis.dev/reference/error-codes) and
[configuration](https://agent-skills.clarvis.dev/reference/configuration); this page covers the
`SkillError` shape, the fs-error mapping, the config primitives, and the `WarnSink` indirection those
pages omit.

## Source files

| Path | Responsibility |
|---|---|
| [`src/errors.ts`](https://github.com/getclarvis/agent-skills/blob/main/src/errors.ts) | The `ErrorCode` union, the `SkillError` class, and `fsError`. |
| [`src/config.ts`](https://github.com/getclarvis/agent-skills/blob/main/src/config.ts) | The whole config subsystem: `SkillConfig`, `AgentSkillsOptions`, the `DEFAULT_*` constants, `resolveConfig`, `normalizeRoot`, and `StartupError`. |
| [`src/preset.ts`](https://github.com/getclarvis/agent-skills/blob/main/src/preset.ts) | `clarvisSkillRoots` / `ClarvisSkillRootsOptions` — the opt-in builder for the clarvis four-root layout. |
| [`src/lib/log.ts`](https://github.com/getclarvis/agent-skills/blob/main/src/lib/log.ts) | The `WarnSink` indirection: `warn`, `setWarnSink`, and the default stderr sink. |
| [`src/index.ts`](https://github.com/getclarvis/agent-skills/blob/main/src/index.ts) | Re-exports the public surface of all three (minus the internal `warn`). |

## Exports

| Symbol | Kind | Notes |
|---|---|---|
| `ErrorCode` | type | The closed union of error codes (below). |
| `SkillError` | class | `Error` subclass carrying `code: ErrorCode` and `fields: Record<string, unknown>`. |
| `fsError(err, path)` | function | Maps a Node `ErrnoException` to a coded `SkillError`. |
| `resolveConfig(options)` | function | Options → validated `SkillConfig`. Requires `options.roots`; throws `StartupError` on an empty `roots` list or a bad explicit `workspace`. |
| `SkillConfig` / `AgentSkillsOptions` | types | The resolved config, and the options accepted by `resolveConfig` / `createAgentSkills`. |
| `clarvisSkillRoots(opts?)` | function | Builds the clarvis four-root layout as a `SkillRootInput[]` — opt-in, pass it as `options.roots`. From `src/preset.ts`. |
| `ClarvisSkillRootsOptions` | type | `{ workspace?, cwd?, home? }` — options for `clarvisSkillRoots`. |
| `StartupError` | class | Thrown for invalid config; distinct from a runtime `SkillError`. |
| `DEFAULT_STRICT` `DEFAULT_FOLLOW_SYMLINKS` | const | The shipped defaults (`false` / `true`), exported for callers and tests. |
| `setWarnSink(fn)` | function | Redirects the non-fatal warning stream; `setWarnSink(null)` resets to stderr. |
| `WarnSink` | type | `(message: string) => void` — the sink signature. |

Internal (not exported): `warn` (`src/lib/log.ts`), and `normalizeRoot`, `validateDir`
(`src/config.ts`).

## The code union

```ts
type ErrorCode =
  | "invalid_skill" | "duplicate_skill" | "not_found" | "not_a_file"
  | "path_escape" | "invalid_input" | "io_error";
```

Where each is raised (representative, not exhaustive):

| Code | Raised by |
|---|---|
| `invalid_skill` | `parseSkill` / discovery — a missing/misaligned closing `---` fence, invalid YAML, a schema failure, or frontmatter that parses to a non-object scalar. Warned-and-skipped when lenient; thrown when `strict`. |
| `duplicate_skill` | discovery, `strict` only — two skills declaring the same `name` **within one root**. A cross-root override is normal precedence, never this error. |
| `not_found` | unknown skill name; missing resource file; `fsError` `ENOENT`. (The `loadSkill` method and `registry.get(name)` return `undefined` for an unknown name — they don't throw.) |
| `not_a_file` | `resourcePath` when `rel` resolves to a directory; `fsError` `EISDIR`/`ENOTDIR`. |
| `path_escape` | `resourcePath` / `resolveResourcePath` — a relative resource escaping the realpath-canonicalized skill dir via `../` or an outward symlink (an absolute `rel` is `invalid_input`, checked first). |
| `invalid_input` | `resourcePath` / `resolveResourcePath` — an empty or absolute `rel`. |
| `io_error` | discovery/read paths; `fsError` fallback for any other Node `ErrnoException`. |

The union is closed — it is part of the public contract that consumers switch on. Some codes attach
structured `fields` (`path`, `name`, `rel`, `paths`, `at`) alongside the message; a consumer reads
them straight off the `SkillError`.

## Reading a failure: `SkillError`

This library **throws** rather than returns. Every foreseeable failure surfaces as a `SkillError`
carrying a `code` (one of the [seven codes](#the-code-union)), a human-readable `message`, and a
`fields` object — a consumer catches it and reads those directly:

```ts
try {
  skills.resourcePath(name, rel);
} catch (err) {
  if (err instanceof SkillError) {
    // code / message / fields are all yours to shape
    JSON.stringify({ error: err.code, message: err.message, ...err.fields });
  }
}
```

- A `SkillError`'s `fields` (e.g. `{ path }`, `{ name }`, `{ rel }`, `{ paths }`) carry structured
  detail without a separate shape — spread them into whatever envelope the host wants.
- The library ships **no** serialization helper: turning a failure into wire JSON, a log line, or an
  MCP error is the consumer's boundary, not the library's.

`createAgentSkills` and the registry (`discoverSkills(config)` → `.list()` / `.get()` / `.resource()`)
raise `SkillError` directly; there is no central `dispatch` here (that lives downstream in the engine).

## fs-error mapping: `fsError(err, path)`

Normalizes Node errno codes to `SkillError`s so read paths don't hand-roll the mapping:

| errno | → code / message |
|---|---|
| `ENOENT` | `not_found` — "No such file: `<path>`" |
| `EISDIR` | `not_a_file` — "Path is a directory: `<path>`" |
| `ENOTDIR` | `not_a_file` — "Not a directory: `<path>`" |
| anything else | `io_error` — "`<code|EIO>`: `<message>`" |

All variants carry `{ path }` in `fields`.

## Config resolution: `resolveConfig(options)`

`resolveConfig` applies the defaults, validates an explicit `workspace`, normalizes the caller-supplied
roots, and returns a flat `SkillConfig` — every field concrete:

```ts
interface SkillConfig {
  home: string;          // options.home ?? os.homedir()
  workspaceDir: string;  // the resolved <ws> (absolute)
  roots: SkillRoot[];    // options.roots, normalized — same order the caller passed
  strict: boolean;       // options.strict ?? DEFAULT_STRICT (false)
  followSymlinks: boolean; // options.followSymlinks ?? DEFAULT_FOLLOW_SYMLINKS (true)
}
```

The resolution order:

- `home` defaults to `os.homedir()`, `cwd` to `process.cwd()`.
- When `options.workspace !== undefined`, the resolved `<ws>` (`resolveWorkspaceDir(workspace, cwd,
  home)`) is checked by **`validateDir`** — `statSync`; a throw → `StartupError` "Workspace does not
  exist: …", a non-directory → "Workspace is not a directory: …". The `cwd` fallback (used when
  `workspace` is omitted) is trusted as-is and never validated.
- **`options.roots` is required.** An empty array throws `StartupError` ("createAgentSkills requires at
  least one root in options.roots"). Each `SkillRootInput` is mapped through the internal
  **`normalizeRoot`** into a concrete `SkillRoot`: `path` is resolved with `resolveAgainst` (`~`→home,
  a relative path against `<ws>`, an absolute path as-is), `scope` defaults to `"workspace"` and
  `source` to `""`. The array order is **preserved verbatim** — it *is* the precedence. No environment
  variable is ever read.

`StartupError` (a bare `Error` subclass) is deliberately **not** a `SkillError`: it signals a bad
configuration *before any discovery runs*, and is the only failure `resolveConfig` raises.

### Precedence is the caller's array order

There is **no built-in root table**. `resolveConfig` fixes nothing about *which* roots exist or *how*
they rank — precedence is exactly the order of `options.roots`, ascending, last wins. `normalizeRoot`
only resolves each `path` and defaults the two provenance labels; `scope`/`source` are metadata and do
**not** affect resolution.

The clarvis convention lives in the opt-in **`clarvisSkillRoots()`** builder
([`src/preset.ts`](https://github.com/getclarvis/agent-skills/blob/main/src/preset.ts)), which returns
these four `SkillRootInput`s in ascending precedence:

| `path` | `scope` | `source` |
|---|---|---|
| `~/.agents/skills` | `user` | `agents` |
| `<ws>/.agents/skills` | `workspace` | `agents` |
| `~/.clarvis/skills` | `user` | `clarvis` |
| `<ws>/.clarvis/skills` | `workspace` | `clarvis` |

That ordering happens to make `source` primary (`.clarvis` after `.agents`) and `scope` the tiebreak
(workspace after user) — but it is just the array the preset emits, not a rule the library enforces. A
missing root is never an error.

## The warning sink: `src/lib/log.ts`

Non-fatal warnings — a malformed skill skipped, an in-root duplicate, a dangling symlink, a name/dir
mismatch, an escaping resource symlink — are a **separate stream** from thrown `SkillError`s. They all
route through a single module-level indirection:

```ts
type WarnSink = (message: string) => void;

const defaultSink: WarnSink = (m) => process.stderr.write(m);
let sink: WarnSink = defaultSink;

export function warn(message: string): void { sink(message); }
export function setWarnSink(fn: WarnSink | null): void { sink = fn ?? defaultSink; }
```

- `warn(message)` is the internal call site every warning goes through. It is **not** exported from
  the package barrel.
- `setWarnSink(fn)` redirects the stream — a test collects warnings into an array, a host forwards
  them to its own logger. `setWarnSink(null)` resets to the default stderr sink.
- The sink is process-global module state, not per-config — installing one affects every
  `createAgentSkills` instance in the process.

## Maintainer notes

- **Expected failures are `SkillError`s.** If a code path can fail for a foreseeable reason, throw a
  `SkillError` with the right `code` and useful `fields` — never a bare `Error`, or the caller has no
  `code` to switch on.
- **Route fs failures through `fsError`** so `ENOENT`/`EISDIR`/`ENOTDIR` map consistently everywhere,
  and everything else lands on `io_error` with `{ path }`.
- **Adding a code:** extend the `ErrorCode` union, raise it where appropriate, and mirror it in
  `docs/reference/error-codes.md` and `SPEC.md`. Keep the union closed.
- **`fields` must not carry secrets.** A consumer spreads them verbatim into whatever it logs or returns.
- **Config validation is `StartupError`, runtime failure is `SkillError`.** Keep the two hierarchies
  distinct so a caller can tell a boot-time config failure from a runtime one.
- **The subsystem reads no env.** All input is the options object passed to `resolveConfig`; a code
  path that reaches into `process.env` breaks the "workspace is never inferred from the environment"
  contract. `CLARVIS_SKILLS_ENABLED` belongs to the downstream agent-loop consumer, not this leaf
  library.
- **Warnings vs throws.** Route a non-fatal diagnostic through `warn`, not `console.*` — that keeps it
  redirectable via `setWarnSink` and off any hard-coded stream. Reserve throws for `strict` mode and
  genuine errors.
