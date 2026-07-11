# Configuration

> Every option, its default, and how discovery builds a `SkillConfig` from an options object
> (`resolveConfig`, used by `createAgentSkills`). This library reads **no environment variables** — the
> workspace is always an explicit option (else the cwd), never inferred from the environment.

## Options {#options}

`createAgentSkills(options)` and `resolveConfig(options)` accept the same `AgentSkillsOptions`:

| Option           | Type               | Default            | Meaning                                                                                                    |
| ---------------- | ------------------ | ------------------ | ---------------------------------------------------------------------------------------------------------- |
| `roots`          | `SkillRootInput[]` | — (**required**)   | The roots to scan, in **ascending precedence (last wins)**. Each is a `{ path, scope?, source? }` (see [Roots](#roots)). An empty list throws `StartupError`. |
| `workspace`      | `string`  | — (falls to `cwd`) | The base a **relative** root `path` resolves against. Relative paths resolve against `cwd`; `~` expands to `home`. If given, it **must** be an existing directory. |
| `cwd`            | `string`  | `process.cwd()`  | Base the `workspace` resolves against, and the base for relative roots when `workspace` is omitted.         |
| `home`           | `string`  | `os.homedir()`   | Base for `~`/`~/…` expansion in a root `path`.                                                              |
| `strict`         | `boolean` | `false`          | When `true`, a malformed skill or a within-root duplicate name throws a `SkillError` instead of being skipped with a warning. A cross-root override never throws — that is normal precedence, not a duplicate. |
| `followSymlinks` | `boolean` | `true`           | When `true`, follow symlinked skill directories, symlinked `SKILL.md` manifests, and symlinked resources. `false` ignores all three. |

```ts
import { createAgentSkills, clarvisSkillRoots } from "@clarvis/agent-skills";

const skills = createAgentSkills({
  roots: clarvisSkillRoots({ workspace: "/srv/project" }),
  strict: true,
  followSymlinks: false,
});
```

An empty `roots` list throws a `StartupError`, as does an explicit `workspace` that is not an existing
directory. The `cwd` fallback (used when `workspace` is omitted) is trusted as-is and never validated.

## `resolveConfig` {#resolveconfig}

```ts
function resolveConfig(options: AgentSkillsOptions): SkillConfig;
```

Applies the defaults above and **normalizes `options.roots` into `SkillConfig.roots`** — resolving
each root `path` and defaulting its `scope` / `source` — then returns a `SkillConfig`. An empty
`roots` list throws `StartupError`; when `workspace` is given it verifies the directory exists first
(else `StartupError`). `createAgentSkills` calls it internally; call it yourself when driving
`discoverSkills` directly. See [createAgentSkills](/reference/create-agent-skills) for the full
factory.

## `SkillConfig` {#skillconfig}

The resolved config that discovery consumes. All fields are concrete (no optionals):

```ts
interface SkillConfig {
  home: string; // resolved home directory
  workspaceDir: string; // resolved <ws> (absolute)
  roots: SkillRoot[]; // the caller's roots, normalized (path resolved; scope/source defaulted)
  strict: boolean;
  followSymlinks: boolean;
}
```

`createAgentSkills(...).config` exposes the same object, so a caller can inspect exactly which roots
were scanned.

## Roots {#roots}

You supply the roots as `options.roots` — an ordered array of **`SkillRootInput`** in **ascending
precedence (last wins)**. `resolveConfig` normalizes each into a **`SkillRoot`** on `config.roots`.

The input shape, `SkillRootInput`:

```ts
interface SkillRootInput {
  path: string;        // "~"/"~/x" expands against home; relative → workspace (else cwd); absolute as-is
  scope?: SkillScope;  // "user" | "workspace" — provenance label only; default "workspace"
  source?: string;     // free-form provenance label; default ""
}
```

The normalized shape on `config.roots`, `SkillRoot`:

```ts
interface SkillRoot {
  path: string;                 // the resolved absolute path to the <root>/ directory
  scope: "user" | "workspace";  // SkillScope — provenance label
  source: string;               // SkillSource (free-form) — provenance label
}
```

Precedence is **only the array order**: the array index is the precedence — a later root overrides an
earlier one of the same `name`, so the last matching root wins. `scope` and `source` are **pure
provenance labels** surfaced on `SkillInfo`; they do **not** affect resolution. A missing root is
never an error (it contributes nothing); an empty `roots` list throws `StartupError`. See
[Discovery & precedence](/guide/discovery-and-precedence) for how collisions resolve across and within
roots.

### The clarvis preset

The clarvis convention is the [`clarvisSkillRoots()`](#presets) preset — a plain builder you opt into,
**not** a default. It produces these four `SkillRootInput`, in this (ascending) order:

| Index | `path`                 | `scope`     | `source`  |
| ----- | ---------------------- | ----------- | --------- |
| `0`   | `~/.agents/skills`     | `user`      | `agents`  |
| `1`   | `<ws>/.agents/skills`  | `workspace` | `agents`  |
| `2`   | `~/.clarvis/skills`    | `user`      | `clarvis` |
| `3`   | `<ws>/.clarvis/skills` | `workspace` | `clarvis` |

Within that array order the effect is source-primary, scope-tiebreak: any `.clarvis` skill overrides
any `.agents` skill of the same name, and within one source the workspace copy overrides the user
copy — which is exactly the array order above. The library itself holds no such opinion; that ordering
is just what these four roots, in this sequence, happen to produce.

## Defaults {#defaults}

Both defaults are exported constants, so a consumer can reuse them without hard-coding:

| Constant                  | Value   | Applies to       |
| ------------------------- | ------- | ---------------- |
| `DEFAULT_STRICT`          | `false` | `strict`         |
| `DEFAULT_FOLLOW_SYMLINKS` | `true`  | `followSymlinks` |

## `StartupError` {#startuperror}

`resolveConfig` throws a `StartupError` (an `Error` subclass) — never a `SkillError` — when the
configuration itself is invalid, before any discovery runs:

- an empty `roots` list (`createAgentSkills requires at least one root in options.roots`);
- an explicit `workspace` that does not exist (`Workspace does not exist: …`);
- an explicit `workspace` that exists but is not a directory (`Workspace is not a directory: …`).

## Path helpers {#path-helpers}

These path utilities are exported for callers that normalize roots or expand `~` on their own. None of
them touch the filesystem:

| Helper                                  | Returns                                                                                                   |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `resolveWorkspaceDir(workspace, cwd, home)` | The absolute `<ws>`: `cwd` when `workspace` is `undefined`, otherwise `workspace` resolved against `cwd` with `~` expansion. |
| `expandHome(p, home)`                   | `p` with a leading `~` or `~/` swapped for `home`; any other path is returned unchanged.                 |
| `resolveAgainst(base, p, home)`         | `expandHome(p, home)` if absolute; otherwise resolved against `base`. This is exactly the rule `resolveConfig` applies to each root `path`. |

```ts
import { resolveAgainst } from "@clarvis/agent-skills";

const root = resolveAgainst("/srv/project", "./.clarvis/skills", "/home/me");
// root === "/srv/project/.clarvis/skills"
```

## Presets {#presets}

```ts
function clarvisSkillRoots(opts?: ClarvisSkillRootsOptions): SkillRootInput[];

interface ClarvisSkillRootsOptions {
  workspace?: string;
  cwd?: string;
  home?: string;
}
```

`clarvisSkillRoots` builds the clarvis four-root convention as a `SkillRootInput[]` — the four roots
`~/.agents/skills`, `<ws>/.agents/skills`, `~/.clarvis/skills`, `<ws>/.clarvis/skills`, in that
(ascending) order (see [Roots](#roots)). It is a **plain builder you opt into**, not a default: pass
its result as `options.roots`. The `.agents/skills` roots are the cross-tool
[skills.sh](https://skills.sh) / `npx skills` shared store; `.clarvis/skills` are clarvis-specific.

```ts
import { createAgentSkills, clarvisSkillRoots } from "@clarvis/agent-skills";

const skills = createAgentSkills({ roots: clarvisSkillRoots({ workspace: "/srv/project" }) });
// scans ~/.agents/skills, /srv/project/.agents/skills, ~/.clarvis/skills, /srv/project/.clarvis/skills
```

## See also

- [createAgentSkills](/reference/create-agent-skills) — the factory that wraps `resolveConfig`
- [Discovery & precedence](/guide/discovery-and-precedence) — how the configured roots merge and collisions resolve
- [The API](/reference/api) — `discoverSkills`, the `SkillRegistry`, and the rest of the surface
