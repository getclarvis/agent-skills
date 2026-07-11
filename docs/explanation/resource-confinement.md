# Resource confinement

> A skill's resources — its `scripts/`, `references/`, `assets/`, `examples/` — are addressed by a
> path relative to the skill's own directory, and that path is not allowed to leave it. This is the
> load-bearing security property of the resource tier — and also its limits: confinement is
> defense-in-depth for *file* access, not a sandbox, and skills are semi-trusted content.

## The rule

`resourcePath(name, rel)` (and the free function `resolveResourcePath(skillDir, rel)`) resolve `rel`
against the skill directory and then check the result against that directory's real path. These are
rejected with **`path_escape`**:

- `../` traversal that climbs above the skill dir,
- a symlink inside the skill dir whose real target lies outside it.

`rel` must be a non-empty **relative** path. An empty `rel`, or an absolute one, never reaches the
escape check — it is rejected earlier as **`invalid_input`**. A relative `rel` resolves against the
skill dir; the resolved absolute path is what gets checked.

```ts
import { createAgentSkills, clarvisSkillRoots } from "@clarvis/agent-skills";

const skills = createAgentSkills({ roots: clarvisSkillRoots({ workspace: "/srv/project" }) });

skills.resourcePath("release", "scripts/publish.sh"); // ok — inside the skill dir
skills.resourcePath("release", "../other-skill/notes.md"); // path_escape
skills.resourcePath("release", "/etc/passwd"); // invalid_input (absolute)
skills.resourcePath("release", ""); // invalid_input (empty)
```

## The check runs on real paths

Both the skill dir and the target are canonicalized with `realpath` before they are compared, so a
symlink hop can't smuggle you out — the guard sees where the links actually point.

- The **skill dir is canonicalized first.** A skill directory that is itself a symlink into a shared
  store (for example, with the clarvis preset, a `~/.agents/skills/<name>` populated by `npx skills`)
  resolves to its real location before the containment check, so the check is against the true
  directory, not the link.
- The **existing prefix of the target is canonicalized too.** The target need not exist yet: the
  guard walks up to the deepest ancestor that does exist, canonicalizes that, and re-joins the
  missing tail. A symlink hop anywhere in the existing prefix is therefore caught.

## Two functions, two contracts

The confinement check is identical in both, but they differ in what else they verify:

- **`resolveResourcePath(skillDir, rel)`** does *only* the path check. It returns an absolute path
  guaranteed inside `skillDir` — but does **not** confirm the resource exists, and does **not** check
  whether it is a file. It is the pure resolver.
- **`resourcePath(name, rel)`** does the same check and then two more: the resource must **exist**
  (**`not_found`** if it doesn't, or if `name` is not a known skill) and must be a **file**
  (**`not_a_file`** if the path resolves to a directory). Use it to hand a caller a path it can open
  directly.

```ts
import { resolveResourcePath } from "@clarvis/agent-skills";

// Pure resolver — confined, but no existence or is-file check:
resolveResourcePath("/srv/project/.clarvis/skills/release", "references/api.md");
```

## Enumeration agrees with the guard

Every resource that `loadSkill(name).resources` lists is guaranteed to resolve under `resourcePath` —
the enumerator applies the same boundary. As it walks the skill tree, a **resource symlink whose real
target escapes the skill dir is skipped with a warning**, so a listed resource never turns out to be
un-resolvable. Dangling symlinks are skipped with a warning too. What you can enumerate, you can
resolve.

## Symlink loops are bounded

The enumerator tracks the **real path** of every directory it has already entered and stops when it
sees one again, so a cyclic `scripts/` → `../scripts` (or any self-referential tree) can't send it
into an infinite descent. This is a visited-set, not a depth or count cap — a legitimately deep tree
enumerates in full; only an actual loop is cut.

## `followSymlinks: false`

`followSymlinks` defaults to `true`, which follows symlinked skill **directories**, symlinked
`SKILL.md` **manifests**, and symlinked **resources**. Setting it to `false` ignores all three: a
symlinked skill dir or manifest is not discovered, and symlinked resources are not enumerated. The
containment guard is unchanged — turning symlinks off narrows *what* is reachable, not *whether* the
boundary holds.

## The limits

Confinement keeps a `rel` from wandering outside one skill's directory. It is **not** a sandbox and it
does **not** isolate the process:

- **Skills are semi-trusted content.** A skill's body is a block of **instructions an agent may
  follow**, and its resources may include a `scripts/` directory. `@clarvis/agent-skills` reads and
  serves that content — it never runs a script and never acts on an instruction — but a consumer that
  surfaces a body to an LLM, or executes a bundled script, is trusting whoever authored the skill.
- **Trust your roots.** You choose the discovery roots — only point them at skills you trust. If you
  use the clarvis preset, its cross-tool `~/.agents/skills` and `<ws>/.agents/skills` roots are the
  shared store populated by external tooling (`npx skills`, skills.sh) and can hold third-party
  content; trust those accordingly.
- **Path confinement is defense-in-depth for file access,** not a substitute for OS-level isolation.
  When an agent driven by these skills can run commands, run it inside a sandbox scoped to the project.

See the package's [`SECURITY.md`](https://github.com/getclarvis/agent-skills/blob/main/SECURITY.md)
for the full trust model.

## See also

- [Deploy securely](/operations/deploy-securely) — concrete sandboxing guidance for the consumer
- [Error codes](/reference/error-codes) — `path_escape`, `invalid_input`, `not_found`, `not_a_file`
