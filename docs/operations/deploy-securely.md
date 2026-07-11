# Deploy securely

> `agent-skills` reads and serves skill content — it carries no transport and **executes nothing**.
> But a `SKILL.md` body is a block of instructions that **steers an agent**, and a skill may ship a
> `scripts/` directory. This page is the short, blunt version of how to deploy it without letting a
> downloaded skill drive your machine through the agent that follows it.

## The one rule

The library never runs a skill, but whatever consumes the skills does — an LLM follows the body, and a
tool runner may execute a bundled script. Two things carry the boundary:

1. **Trust the content source.** You choose the [discovery
   roots](/guide/discovery-and-precedence) — only point them at skills you trust. If you use the
   `clarvisSkillRoots()` preset, its cross-tool `~/.agents/skills` and `<ws>/.agents/skills` roots are
   the shared [skills.sh](https://skills.sh) / `npx skills` store — treat anything there like any other
   downloaded plugin.
2. **Sandbox the consumer.** Run the agent that follows these skills inside an **OS-level sandbox**,
   scoped to the project — a **container** (Docker/Podman) with only the project mounted, a **VM**, a
   **dedicated low-privilege user** with filesystem ACLs, or **seccomp / AppArmor / Landlock**
   confinement.

Everything below is defense-in-depth *on top of* those two — not a replacement for either.

## Why the content source is the boundary

`agent-skills` hands a caller three things: the raw frontmatter (`metadata`), the trimmed markdown
`body`, and confined resource paths. The body is **instructions an agent may follow**; a resource may
be a script an agent may run. The library does neither — but the moment a consumer surfaces a body to
an LLM or executes a skill's script, it is trusting whoever authored that skill.

So the interesting lever this library gives you is **which roots you point discovery at**. With the
`clarvisSkillRoots()` preset, skills in `~/.clarvis/skills` and `<ws>/.clarvis/skills` are yours,
while the `.agents/skills` roots may be third-party content synced from a central store. Trust each
root as much as you trust its authors.

## Layer these on top

- **Pin `strict` for the phase.** Use [`strict: true`](/reference/configuration) when **authoring** a
  skill or gating CI — a malformed manifest or an in-root duplicate throws instead of being skipped,
  so you catch the mistake at build time. Leave it **`false` (the default) in production** so one bad
  third-party skill fails safe rather than aborting the whole run.
- **Set `followSymlinks` deliberately.** The default (`true`) follows symlinked skill directories,
  symlinked `SKILL.md` manifests, and symlinked resources — which is what lets discovery reach into
  the symlink-based shared store. Set it to `false` when you do **not** want discovery reaching
  through symlinks out of a root you only partly trust.
- **Never source the workspace from the environment.** `<ws>` comes from the `workspace` option, else
  the current working directory — the library reads **no environment
  variables of its own**. An ambient env var cannot silently redirect which skills load. Pin
  `workspace` explicitly in a service; an explicit workspace that is not an existing directory throws
  `StartupError` rather than falling back.
- **Keep resource confinement in perspective.** `resourcePath` (and the exported
  `resolveResourcePath`) guarantee a returned path stays inside the skill's own directory — `../`
  traversal or a symlink pointing outside are rejected with `path_escape` (an absolute or empty `rel`
  is rejected earlier with `invalid_input`). See
  [Resource confinement](/explanation/resource-confinement) for exactly what it checks. It guards
  **file access only**; it is not a substitute for the OS-level sandbox above.

```ts
import { createAgentSkills, clarvisSkillRoots } from "@clarvis/agent-skills";

// Authoring / CI: fail loud on a malformed or in-root-duplicated skill.
const authoring = createAgentSkills({
  roots: clarvisSkillRoots({ workspace: "/srv/project" }),
  strict: true,
});

// Production: pin the workspace explicitly (never from env) and keep the
// default lenient discovery so one bad skill can't brick the rest. Refuse
// symlink hops into the shared store when you don't fully trust it.
const serving = createAgentSkills({
  roots: clarvisSkillRoots({ workspace: "/srv/project" }),
  followSymlinks: false,
});
```

## Malformed skills fail safe

By default, a `SKILL.md` that can't be read, has broken YAML frontmatter, or fails schema validation
is **skipped with a warning** — as is an in-root duplicate name and a dangling symlink. Discovery
keeps every other skill, so one broken or hostile third-party manifest **cannot brick the catalog**
for the rest. The warnings route through the `WarnSink` (default `process.stderr`); redirect them with
`setWarnSink` to feed your own logs, and flip to fail-loud with `strict: true` where you'd rather stop.

## Checklist

- [ ] The agent that consumes these skills runs in a container / VM / low-priv user scoped to one project
- [ ] Only trusted skills sit in the roots you configure; with the clarvis preset, the shared `.agents/skills` store is treated like a downloaded plugin
- [ ] `workspace` is pinned explicitly (or left to cwd) — never sourced from an env var
- [ ] `strict: true` in authoring / CI; left `false` in production so a bad skill fails safe
- [ ] `followSymlinks` set deliberately for whether discovery reaches through the shared store
- [ ] Resource-path confinement understood as file-access defense-in-depth, not OS isolation

## See also

- [Resource confinement](/explanation/resource-confinement) — what the path guard rejects, and what it does not cover
- [Discovery & precedence](/guide/discovery-and-precedence) — the roots you configure (and, with the clarvis preset, the `.agents` shared store)
- [SECURITY.md](https://github.com/getclarvis/agent-skills/blob/main/SECURITY.md) — the full trust model and disclosure policy
