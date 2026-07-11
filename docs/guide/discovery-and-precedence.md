# Discovery & precedence

> You pass the roots to scan; `agent-skills` reads each one level deep and folds them **last-wins** by
> skill `name`, in **ascending precedence** — so a later root overrides an earlier one of the same
> name. The clarvis four-root convention is the opt-in `clarvisSkillRoots()` preset.

## You supply the roots

Discovery scans exactly the roots you pass as `options.roots` — an ordered list, read in **ascending
precedence (last wins)**. The library ships **no built-in default**: it scans the roots you give it and
nothing else. Discovery is one level deep — `<root>/<name>/SKILL.md`, **not** recursive.

Each root is a `SkillRootInput`:

```ts
interface SkillRootInput {
  path: string;        // "~"/"~/x" expands against home; a relative path resolves against the
                       // workspace (else cwd); an absolute path is used as-is
  scope?: SkillScope;  // "user" | "workspace" — provenance label only; default "workspace"
  source?: string;     // free-form provenance label; default ""
}
```

- **`path`** is normalized by the same rule the exported `resolveAgainst` applies: a `~` or `~/x`
  prefix expands against the home directory (the `home` option, else `os.homedir()`); a **relative**
  path resolves against the `workspace` (else the cwd); an **absolute** path is used as-is.
- **`scope`** (`"user" | "workspace"`, default `"workspace"`) and **`source`** (a free-form string,
  default `""`) are **pure provenance labels**. They are surfaced on each `SkillInfo` so a consumer can
  tell where a skill came from, but they **do not affect precedence**.

**Precedence is only the array order** — the last root that declares a given `name` wins. A missing
root is never an error (it contributes nothing); passing an **empty `roots` list throws
`StartupError`**. The `workspace` that relative roots resolve against is the `workspace` option, else
the current working directory — **never** an environment variable; an explicit `workspace` that is not
an existing directory throws `StartupError`.

The manifest filename is matched **case-insensitively** — `SKILL.md`, `skill.md`, and `Skill.md` are
all accepted. Write it as `SKILL.md`.

## The clarvis preset

The clarvis convention ships as the exported **`clarvisSkillRoots()`** preset — a plain builder you opt
into, **not** a default. It returns four `SkillRootInput` roots, in this (ascending) order:

| # | Root | Scope | Source |
| --- | --- | --- | --- |
| 0 | `~/.agents/skills` | user | agents |
| 1 | `<ws>/.agents/skills` | workspace | agents |
| 2 | `~/.clarvis/skills` | user | clarvis |
| 3 | `<ws>/.clarvis/skills` | workspace | clarvis |

Pass its result as `options.roots`:

```ts
import { createAgentSkills, clarvisSkillRoots } from "@clarvis/agent-skills";

const skills = createAgentSkills({ roots: clarvisSkillRoots({ workspace: process.cwd() }) });
```

`clarvisSkillRoots` takes `{ workspace?, cwd?, home? }`; `<ws>` is its `workspace` (else the current
directory), and `~` its `home` (else `os.homedir()`). Because precedence is just the array order, the
preset's ordering **is** the clarvis rule: source is primary (`.clarvis` beats `.agents`, even a
user-global `.clarvis` skill over a workspace `.agents` one) and scope is the tiebreak (within one
source, the workspace copy beats the user copy). The library itself holds no opinion here — the effect
comes entirely from the order of the four roots above. An embedder that wants a different layout passes
its own roots.

## Identity is the frontmatter name

A skill's identity is its frontmatter `name`, not its directory name — `name` is the merge key across
all the roots. When the two differ, the frontmatter `name` wins and a **non-fatal warning** fires. Keep
them equal to avoid surprises: `~/.clarvis/skills/pdf/SKILL.md` should declare `name: pdf`.

## Name collisions

- **Across roots** — a duplicate `name` in a higher-precedence (later) root simply **overrides** the
  earlier one. This is the whole point of an ordered roots list; it is **never** an error, not even
  under `strict`.
- **Within one root** — a duplicate `name` keeps the **first by sorted directory order** and emits a
  warning. Under `strict` it throws `duplicate_skill` instead.

## Strict vs. lenient

By default (`strict: false`) discovery is resilient: a malformed `SKILL.md`, an in-root duplicate,
or a dangling symlink is **skipped with a warning** routed through the `WarnSink` (redirect it with
`setWarnSink`). A missing root contributes nothing, silently.

Pass `strict: true` to turn both **malformed skills** and **in-root duplicates** into thrown
`SkillError`s (`invalid_skill` and `duplicate_skill`) — useful when authoring skills or gating CI. A
cross-root override still never throws; that is normal precedence, not a duplicate.

```ts
import { createAgentSkills, clarvisSkillRoots } from "@clarvis/agent-skills";

const skills = createAgentSkills({
  roots: clarvisSkillRoots({ workspace: "/srv/project" }),
  strict: true,
});
// throws on a malformed manifest, or on a same-name pair inside one root
```

## The .agents shared store

The clarvis preset's `.agents/skills` roots are the cross-tool [skills.sh](https://skills.sh) / `npx
skills` store, shared with other agent runners. On many machines the per-tool skill directories there
are **symlinks** into a central store, and `agent-skills` **follows them by default**
(`followSymlinks: true`).

`followSymlinks` governs all three symlink shapes uniformly — a symlinked skill **directory**, a
symlinked `SKILL.md` **manifest**, and symlinked **resources** inside a skill. Set
`followSymlinks: false` to ignore all three:

```ts
const skills = createAgentSkills({
  roots: clarvisSkillRoots({ workspace: process.cwd() }),
  followSymlinks: false,
});
```

Trust the roots you point it at: a skill body is instructions an agent may follow, and a skill may
ship a `scripts/` directory. See [How it works](/explanation/how-it-works) for the trust model.

## See also

- [How it works](/explanation/how-it-works) — discovery, the registry, and the trust model
- [Configuration](/reference/configuration) — `roots`, `workspace`, `strict`, and `followSymlinks`
