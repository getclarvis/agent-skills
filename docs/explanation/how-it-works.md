# How it works

> A conceptual map of what happens between your `createAgentSkills()` and a served skill: the config
> you resolve once, the configured roots that fold into one registry, and the pipeline discovery runs
> through. This is the library's whole mechanism — it carries no transport and executes nothing.

## The shape of the package

`@clarvis/agent-skills` is a small, pure library built on `node:fs` + `yaml` + `zod` and nothing
else. The roots you configure are scanned, folded into one registry, and that registry serves three
tiers:

```text
   options.roots  (ascending precedence — last wins) · e.g. the clarvisSkillRoots() preset:
   ~/.agents/skills   <ws>/.agents/skills   ~/.clarvis/skills   <ws>/.clarvis/skills
        (0)                 (1)                   (2)                 (3)  ◀ last wins
         └───────────────────┴──────────┬──────────┴───────────────────┘
                                         │  scan one level deep: <name>/SKILL.md
                                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│ DISCOVER (per root)                                                   │
│   list dirs → parse + validate frontmatter (yaml · zod) → dedupe name │
└─────────────────────────────────────────┬───────────────────────────┘
                                          │  merge — ascending precedence, last wins
                                          ▼
                         ┌────────────────────────────────┐
                         │ REGISTRY  (skills by name)      │
                         │   list() · get() · resource()   │
                         └────────────────┬───────────────┘
                                          │
                                          ▼
            catalog (cheap)  ·  body (on demand)  ·  resources (lazy, confined)

  resolved once at createAgentSkills; refresh() re-scans the configured roots
```

You own the agent loop and the transport; the package is the middle — turning a set of directories on
disk into a queryable set of skills.

## Config is resolved once

`resolveConfig` (called by `createAgentSkills`) runs at construction. It picks `home`
(default `os.homedir()`) and `cwd` (default `process.cwd()`), derives the workspace directory, and
**normalizes `options.roots`** into the ordered `config.roots` (resolving each `path`, defaulting
`scope` / `source`). An empty `roots` list, or an explicit `workspace` that is not an existing
directory, fails fast with a `StartupError`; a missing root is never an error — it simply contributes
no skills. The workspace comes from the `workspace` option, else `cwd` — **never** from an
environment variable. Every later `listSkills` / `loadSkill` / `resourcePath` reads that same frozen
`SkillConfig`; there is no per-call setup and no hidden global state. See
[Configuration](/reference/configuration).

## The discovery pipeline

Discovery runs **once**, at `createAgentSkills`, folding the configured roots into one registry
through six steps:

1. **Normalize `options.roots`.** Take the caller-ordered roots and normalize each into a `SkillRoot`
   on `config.roots` (resolve the `path`; default `scope` / `source`). Order is the caller's —
   ascending precedence, the last root wins. (The clarvis preset, for example, orders them
   `~/.agents/skills` · `<ws>/.agents/skills` · `~/.clarvis/skills` · `<ws>/.clarvis/skills`.)
2. **Scan each root, one level deep.** For every `<root>/<name>/` directory, look for a manifest —
   the filename is matched **case-insensitively**, so `SKILL.md`, `skill.md`, and `Skill.md` are all
   accepted. This is a single level, **not** a recursive walk. It is symlink-aware: with
   `followSymlinks: true` (the default) a symlinked skill directory or a symlinked manifest is
   followed; `false` ignores both. Directories are visited in sorted order.
3. **Parse & validate.** Split the leading `---` fence, parse the YAML with `yaml`, and validate the
   frontmatter against `skillFrontmatterSchema` (a `zod` `.passthrough` object). `name` and
   `description` are required; unknown keys are preserved on `metadata`; `allowed-tools` (falling
   back to `tools`) normalises to `allowedTools`. Identity is the frontmatter `name`, not the
   directory name — when the two differ the frontmatter name wins and a **non-fatal warning** fires.
   A malformed manifest raises `invalid_skill`. See
   [The SKILL.md format](/explanation/the-skill-format).
4. **Dedupe within a root.** If two directories in the *same* root resolve to the same `name`, keep
   the first by sorted directory order and warn; under `strict` this throws `duplicate_skill`
   instead.
5. **Merge across roots.** Fold the per-root groups from lowest to highest precedence, last-wins by
   name. A same-name skill in a later (higher-precedence) root **overrides** the earlier one — this is
   the point of the array order, normal behaviour, never an error (even under `strict`). See
   [Discovery & precedence](/guide/discovery-and-precedence).
6. **Build the registry.** The surviving skills become a map keyed by `name`, exposing
   `list()` / `get()` / `resource()`.

## What the registry serves

The registry answers three tiers of query, cheapest first — this is progressive disclosure:

- **Catalog.** `listSkills()` returns `SkillInfo[]` (name, description, raw `metadata`,
  `allowedTools?`, `userInvocable`, plus the resolved `scope` / `source` / `root` / `dir` / `path`),
  sorted by name. It is computed at discovery, so listing is cheap.
- **Body.** `loadSkill(name)` returns a `SkillContent` (the `SkillInfo` plus the trimmed markdown
  `body` and the enumerated `resources`), or `undefined` for an unknown name.
- **Resources.** `resourcePath(name, rel)` returns an absolute path guaranteed to sit inside the
  skill's own directory. The path is canonicalised with `realpath` and any escape via `../` or an
  out-of-tree symlink is rejected with `path_escape`; an empty or absolute `rel` is `invalid_input`, a
  missing resource is `not_found`, and a directory is `not_a_file`. See
  [Resource confinement](/explanation/resource-confinement).

`refresh()` re-scans the configured roots from scratch, reflecting skills that were added, had their body
edited, or were removed. Nothing else re-scans — a long-lived `AgentSkills` holds the snapshot taken
at construction until you call `refresh()`.

## Resilient by default, strict to fail loud

Discovery is resilient by default. A malformed `SKILL.md` or an in-root duplicate name is **skipped
with a warning** rather than aborting the scan. Softer conditions only warn without dropping the
skill: a name/directory mismatch still loads the skill (its frontmatter name wins), and a dangling or
escaping resource symlink drops just that one resource, not the skill. Warnings route through a
`WarnSink` (default `process.stderr`); `setWarnSink(fn)` redirects them and `setWarnSink(null)`
restores the default.

Pass `strict: true` to turn the loud-enough-to-fix cases — malformed skills and in-root duplicates —
into thrown `SkillError`s. This is the mode for authoring skills or gating CI. A cross-root override
is *not* one of these cases: it is ordinary precedence, so it never throws.

## What it deliberately isn't

- **No transport.** No HTTP, socket, or RPC server is bundled — just functions you call. Wiring
  skills into an agent's prompt is the consumer's job (the downstream `@clarvis/agent-loop` does it
  with the `use_skills` grant).
- **No execution.** The library *reads and serves* skill text and file paths; it never runs a skill
  body's instructions or anything under a `scripts/` directory. A body is guidance an agent may
  choose to follow — trust the roots you configure (with the clarvis preset, especially the shared
  `~/.agents/skills` store). Resource confinement guards *file access*; it is not OS-level isolation.
- **No environment reads.** The library reads no environment variables of its own; the workspace
  comes from the option, else `cwd`, never from env. (The `CLARVIS_SKILLS_ENABLED` switch
  belongs to the downstream agent-loop consumer, not this library.)
- **No `@clarvis/*` dependencies.** It is a leaf — `yaml` + `zod` and the Node standard library.

## See also

- [Discovery & precedence](/guide/discovery-and-precedence) — the configured roots and the last-wins
  rule behind steps 4–5
- [The SKILL.md format](/explanation/the-skill-format) — the frontmatter step 3 validates
- [Progressive disclosure](/guide/progressive-disclosure) — the three tiers the registry serves
- [Configuration](/reference/configuration) — the options resolved once in step 1
- [Resource confinement](/explanation/resource-confinement) — the path guard behind `resource()`
