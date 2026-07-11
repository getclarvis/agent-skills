# Security Policy

## Supported versions

This project is pre-1.0. Security fixes are applied to the latest published `0.x` release.

## Trust model

`@clarvis/agent-skills` is a **library** that discovers, parses, and serves `SKILL.md` skills from
user- and workspace-level directories. It carries no transport, spawns no processes, and **executes
nothing** — it reads files and hands their content (frontmatter, markdown body) and confined resource
paths to a caller. Two boundaries matter:

- **Resource paths are skill-dir-confined.** `resourcePath(name, rel)` resolves `rel` against the
  skill's own directory and rejects any path that escapes it — `../` traversal, an absolute path, or a
  symlink whose real target lies outside — with `path_escape`. The skill directory is canonicalized
  with `realpath` first, so a skill dir that is itself a symlink into a shared store (e.g.
  `~/.agents/skills`) is resolved before the containment check. The existing prefix of the target is
  canonicalized too, so symlink hops in resources are caught.
- **Skills are semi-trusted content.** A skill's body is a block of **instructions the agent may
  follow**, and its bundled resources may include a `scripts/` directory. `@clarvis/agent-skills`
  never runs those scripts and never follows those instructions — but a consumer that surfaces a skill
  body to an LLM, or that executes a skill's script, is trusting whoever authored the skill. The
  cross-tool `~/.agents/skills` and `<ws>/.agents/skills` roots are populated by external tooling
  (`npx skills` / skills.sh) and may contain third-party content.

Because a discovered skill can influence an agent's behavior, the trust model is the **content
source**:

> **Only place skills you trust in the discovery roots.** Treat `.agents/skills` (the shared,
> cross-tool store) as you would any downloaded plugin. When an agent driven by these skills can run
> commands, run it inside an OS-level sandbox scoped to the project — resource-path confinement is
> defense-in-depth for file access, not a substitute for OS-level isolation.

### Defense-in-depth notes

- **Malformed skills fail safe.** By default a `SKILL.md` that cannot be read, has broken YAML
  frontmatter, or fails schema validation is **skipped with a warning** (via the `WarnSink`), so one
  broken third-party skill cannot brick discovery for the rest. `strict: true` flips this to fail-loud
  (`invalid_skill`) for authoring and CI.
- **Discovery never throws on a missing root.** A root that does not exist or is not a directory
  contributes nothing; it is not an error.
- **Symlink loops are bounded.** Resource enumeration tracks the real path of every directory it
  enters in a visited set and refuses to re-enter one, so a cyclic `scripts/`/`references/`/`assets/`
  tree cannot loop forever. A dangling symlink, and a resource symlink whose real target escapes the
  skill directory, are each skipped with a warning — so enumeration never surfaces a resource that
  `resourcePath` would then reject with `path_escape`.
- **The workspace is never taken from the environment.** The workspace root comes only from the
  explicit `workspace` option (else the cwd), never from an environment variable, so an ambient
  env cannot silently redirect which skills load.
- **Coded errors carry no file contents.** A `SkillError` exposes a stable `code`, a `message`, and
  structured `fields` (paths, names) — never raw file contents — so a consumer can surface or
  serialize the failure without leaking a skill's bytes.

## Reporting a vulnerability

Please report security issues **privately**. Do not open a public issue for a vulnerability.

- Use GitHub's [private vulnerability reporting](https://github.com/getclarvis/agent-skills/security/advisories/new), or
- email the maintainers at **security@clarvis.dev**.

We aim to acknowledge reports within a few business days and will coordinate a fix and disclosure
timeline with you.
