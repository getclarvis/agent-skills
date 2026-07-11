# `createAgentSkills`

> The ergonomic entry point. It resolves a config once, runs discovery once, and returns an
> `AgentSkills` object with `listSkills()`, `loadSkill()`, `resourcePath()`, and `refresh()`. This is
> the high-level API; the [lower-level surface](/reference/api) exposes the same behavior unwrapped.

## Signature

```ts
function createAgentSkills(options: AgentSkillsOptions): AgentSkills;
```

`options` is the object accepted by [`resolveConfig`](/reference/configuration) — `roots` is
**required**, every other field is optional. Discovery runs **once**, synchronously, inside
`createAgentSkills`; the configured roots are not re-scanned until you call `refresh()`. An empty
`roots` list, or an explicit `workspace` that is not an existing directory, throws a `StartupError`
synchronously (see [Options](#options)).

```ts
import { createAgentSkills, clarvisSkillRoots } from "@clarvis/agent-skills";

const skills = createAgentSkills({ roots: clarvisSkillRoots({ workspace: process.cwd() }) });
```

## `AgentSkills`

```ts
interface AgentSkills {
  readonly config: SkillConfig;
  listSkills(): SkillInfo[];
  loadSkill(name: string): SkillContent | undefined;
  resourcePath(name: string, rel: string): string;
  refresh(): void;
}
```

| Member         | Type                                       | Description                                                                                                        |
| -------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `config`       | `SkillConfig`                              | The fully-resolved config produced at construction (see [Configuration](/reference/configuration#skillconfig)).   |
| `listSkills`   | `() => SkillInfo[]`                         | The discovered catalog across the configured roots — tier 1, cheap, computed at discovery.                       |
| `loadSkill`    | `(name) => SkillContent \| undefined`      | The body and resources for one skill by `name`, or `undefined` when unknown — tiers 2 and 3.                      |
| `resourcePath` | `(name, rel) => string`                    | A confined absolute path to a bundled resource; throws on an unknown skill, an escape, or a missing/non-file target. |
| `refresh`      | `() => void`                               | Re-scan the configured roots, reflecting added, body-modified, and removed skills.                                |

The object is a thin wrapper: `listSkills()`, `loadSkill()`, and `resourcePath()` delegate to the
registry built by [`discoverSkills`](/reference/api); `refresh()` rebuilds that registry from the
same `config`.

Identity is the frontmatter `name`, not the directory name. When the two differ the frontmatter
`name` wins and a non-fatal warning fires; `name` is also the key used to override across roots and
to look skills up here. See [Discovery & precedence](/guide/discovery-and-precedence).

## Options

```ts
interface AgentSkillsOptions {
  roots: SkillRootInput[];
  workspace?: string;
  cwd?: string;
  home?: string;
  strict?: boolean;
  followSymlinks?: boolean;
}
```

| Option           | Type               | Default            | Meaning                                                                                                                              |
| ---------------- | ------------------ | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `roots`          | `SkillRootInput[]` | — (**required**)   | The roots to scan, in **ascending precedence (last wins)**. Each is a `{ path, scope?, source? }`; an empty list throws `StartupError`. See [`SkillRootInput`](#skillrootinput). |
| `workspace`      | `string`           | `cwd`              | The base for **relative** root paths — set via this option, else the cwd. **Never** read from an environment variable.                |
| `cwd`            | `string`           | `process.cwd()`    | Base for resolving a relative `workspace`, and the fallback base for relative roots when `workspace` is omitted.                    |
| `home`           | `string`           | `os.homedir()`     | Base for `~`/`~/…` expansion in a root `path`.                                                                                      |
| `strict`         | `boolean`          | `false`            | When `true`, a malformed skill and a within-root duplicate name throw a `SkillError` instead of being skipped with a warning.        |
| `followSymlinks` | `boolean`          | `true`             | When `true`, follow symlinked skill directories, symlinked `SKILL.md` manifests, and symlinked resources; `false` ignores all three. |

An empty `roots` list throws `StartupError`, as does an explicit `workspace` that is not an existing
directory — the workspace is never inferred from the environment, so it never silently redirects. A
cross-root override (a higher-precedence root shadowing a lower one of the same `name`) is normal
precedence and **never** throws, even under `strict`; only a duplicate `name` **within one root** is a
`duplicate_skill`.

### `SkillRootInput`

Each entry in `roots` is a `SkillRootInput`:

```ts
interface SkillRootInput {
  path: string;        // "~"/"~/x" expands against home; a relative path resolves against the
                       // workspace (else cwd); an absolute path is used as-is
  scope?: SkillScope;  // "user" | "workspace" — provenance label only; default "workspace"
  source?: string;     // free-form provenance label; default ""
}
```

`path` follows the exported [`resolveAgainst`](/reference/configuration#path-helpers) rule. `scope`
and `source` are **pure provenance labels** — they are surfaced on each `SkillInfo` (`scope`,
`source`) but do **not** affect resolution or precedence; precedence is only the array order, last
wins. For the clarvis four-root layout, use the
[`clarvisSkillRoots`](/reference/configuration#presets) preset rather than writing the roots by hand:

```ts
import { createAgentSkills, clarvisSkillRoots } from "@clarvis/agent-skills";

const skills = createAgentSkills({ roots: clarvisSkillRoots({ workspace: process.cwd() }) });
```

## `SkillInfo`

The catalog record `listSkills()` returns for each skill — tier 1 of
[progressive disclosure](/guide/progressive-disclosure).

```ts
interface SkillInfo {
  name: string;
  description: string;
  metadata: SkillFrontmatter;
  allowedTools?: string[];
  userInvocable: boolean;
  scope: "user" | "workspace";
  source: string;
  root: string;
  dir: string;
  path: string;
}
```

| Field           | Type                     | Description                                                                                                            |
| --------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `name`          | `string`                 | The frontmatter `name` — the identity and merge key.                                                                 |
| `description`   | `string`                 | The frontmatter `description` — a non-empty trimmed string.                                                          |
| `metadata`      | `SkillFrontmatter`       | The **raw** validated frontmatter, with unknown keys preserved. Not normalized — normalization lands on `allowedTools`. |
| `allowedTools`  | `string[]` \| _absent_   | The declared tool allow-list, from `allowed-tools` (falling back to `tools`). Absent when neither is declared.        |
| `userInvocable` | `boolean`                | The frontmatter `user-invocable`, default `true`.                                                                    |
| `scope`         | `"user" \| "workspace"`  | The provenance `scope` label of the root this skill came from.                                                       |
| `source`        | `string`                 | The free-form `source` label of the root this skill came from (the clarvis preset uses `"agents"` / `"clarvis"`).    |
| `root`          | `string`                 | The absolute path of the winning root.                                                                               |
| `dir`           | `string`                 | The absolute path of the skill's own directory.                                                                     |
| `path`          | `string`                 | The absolute path of the skill's `SKILL.md` manifest.                                                                |

`allowedTools` is the one normalized field: both `allowed-tools` and `tools` accept a YAML flow array
(`[Read, Bash]`) or a comma-separated string (`"Read, Bash"`), trimmed and blank-dropping identically;
`allowed-tools` wins when both are present. See [Configuration](/reference/configuration) for the full
frontmatter schema.

## `SkillContent`

What `loadSkill(name)` returns — `SkillInfo` plus the body (tier 2) and enumerated resources
(tier 3), or `undefined` when no skill has that `name`.

```ts
interface SkillContent extends SkillInfo {
  body: string;
  resources: SkillResource[];
}
```

| Field       | Type               | Description                                                                          |
| ----------- | ------------------ | ----------------------------------------------------------------------------------- |
| `body`      | `string`           | The trimmed markdown body of the `SKILL.md`, below the frontmatter.                 |
| `resources` | `SkillResource[]`  | The bundled resource files under the skill directory (the `SKILL.md` is excluded).  |

### `SkillResource`

```ts
interface SkillResource {
  kind: "scripts" | "references" | "assets" | "examples" | "other";
  rel: string;
  path: string;
}
```

| Field  | Type                                                      | Description                                                                                    |
| ------ | -------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `kind` | `"scripts" \| "references" \| "assets" \| "examples" \| "other"` | Derived from the top path segment; anything else is `"other"`.                        |
| `rel`  | `string`                                                | POSIX-relative path from the skill directory.                                                 |
| `path` | `string`                                                | The absolute path on disk.                                                                    |

Enumeration walks the whole skill directory, guarded against symlink loops by a visited-real-path
set. A dangling symlink, or a resource symlink whose real target escapes the skill directory, is
skipped with a warning — so enumeration agrees with `resourcePath`'s confinement. To read one
resource by hand, pass its `rel` to `resourcePath`; the returned path is guaranteed inside the skill
directory. See [Resource confinement](/explanation/resource-confinement).

## Example

```ts
import { createAgentSkills, clarvisSkillRoots } from "@clarvis/agent-skills";

const skills = createAgentSkills({ roots: clarvisSkillRoots({ workspace: process.cwd() }) });

for (const skill of skills.listSkills()) {
  console.log(skill.name, "→", skill.description, `(${skill.source}/${skill.scope})`);
}

const pdf = skills.loadSkill("pdf");
if (pdf) {
  console.log(pdf.body);
  for (const res of pdf.resources) {
    console.log(res.kind, res.rel);
  }
  const script = skills.resourcePath("pdf", "scripts/extract.py"); // confined absolute path
  console.log(script);
}

skills.refresh(); // re-scan the configured roots after skills change on disk
```

## See also

- [Configuration](/reference/configuration) — the `AgentSkillsOptions`, `SkillConfig`, and root shapes
- [API reference](/reference/api) — `discoverSkills` and the `SkillRegistry` behind this factory
- [Error codes](/reference/error-codes) — what `resourcePath` and strict discovery throw
- [Resource confinement](/explanation/resource-confinement) — how `resourcePath` stays inside the skill dir
- [Progressive disclosure](/guide/progressive-disclosure) — the catalog → body → resources tiers
