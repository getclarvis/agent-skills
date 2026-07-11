# Changelog

All notable changes to `@clarvis/agent-skills` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-07-10

Initial public release.

### Added

- **`createAgentSkills({ roots })` progressive-disclosure façade** — discovers the skills once
  at construction and serves them in three tiers: `listSkills()` returns the cheap catalog
  (`SkillInfo[]`), `loadSkill(name)` adds the trimmed markdown body and enumerated resources
  (`SkillContent`, or `undefined` for an unknown name), `resourcePath(name, rel)` resolves a
  confined resource path, and `refresh()` re-scans the configured roots to pick up added, edited, and
  removed skills. Options: `roots` (**required** — the ordered `SkillRootInput[]` to scan; an empty
  list throws `StartupError`), `workspace` (the base for relative roots, else `cwd`; an explicit path
  that is not an existing directory throws `StartupError`), `cwd`, `home`, `strict` (default `false`),
  and `followSymlinks` (default `true`). The workspace is never read from the environment.
- **Caller-supplied roots; array-order precedence.** Skills are found one level deep at
  `<root>/<name>/SKILL.md` (matched case-insensitively; not recursive) across the roots you pass in
  `options.roots`, scanned in **ascending precedence — the last root that declares a name wins**. Each
  root is a `SkillRootInput { path, scope?, source? }` (`~`→home, relative→workspace, absolute as-is;
  `scope`/`source` are pure provenance labels). The frontmatter `name` is the merge key and the skill's
  identity; when it differs from the directory name the frontmatter name wins with a non-fatal warning.
  A cross-root name collision is a normal override (the later root wins); a within-root collision keeps
  the first by sorted directory order. A missing root is never an error.
- **`clarvisSkillRoots()` convention preset.** The clarvis four-root layout — `~/.agents/skills`,
  `<ws>/.agents/skills`, `~/.clarvis/skills`, `<ws>/.clarvis/skills`, in ascending order (source
  primary, scope tiebreak) — ships as an **opt-in** builder (`ClarvisSkillRootsOptions`), passed as
  `roots: clarvisSkillRoots({ workspace })`; it is not a built-in default. The `.agents/skills` roots
  are the cross-tool `skills.sh` / `npx skills` shared store; `.clarvis/skills` are clarvis-specific.
- **`SKILL.md` parsing with a permissive `zod` schema.** `parseSkill(raw)` splits YAML frontmatter
  from the markdown body; `skillFrontmatterSchema` (`.passthrough`) requires `name`
  (`/^[A-Za-z0-9._-]+$/`) and a non-empty `description`, recognises `version`, `allowed-tools`,
  `tools`, `user-invocable` (default `true`), `argument-hint`, and `license`, and preserves any other
  key on `SkillInfo.metadata` (the raw validated frontmatter). `normalizeTools` folds `allowed-tools`
  (or `tools` as the fallback; `allowed-tools` wins when both are present) from either the flow-array
  or comma-separated-string shape into `SkillInfo.allowedTools`, trimmed and blank-dropped —
  identically for both shapes, and absent when neither is declared.
- **Lower-level, composable surface.** The building blocks are exported directly: `discoverSkills`
  (which returns a `SkillRegistry` — call its `.list()` / `.get(name)` / `.resource(name, rel)`),
  `parseSkill` / `normalizeTools`, `mergeSkills` (ascending-precedence, last-wins fold of
  `ResolvedSkill[][]`), `resolveResourcePath` and the path helpers (`resolveWorkspaceDir`,
  `resolveAgainst`, `expandHome`), and the config layer `resolveConfig` (reading `roots`, `workspace`,
  `strict`, and `followSymlinks` from the options object) with `StartupError`, `DEFAULT_STRICT`, and
  `DEFAULT_FOLLOW_SYMLINKS`.
- **Stable `SkillError` contract.** `SkillError { code, message, fields }` — a consumer catches it and
  reads `.code`, `.message`, and `.fields` directly, building its own envelope if it wants one (e.g.
  `JSON.stringify({ error: err.code, message: err.message, ...err.fields })`) — plus `fsError` mapping
  a Node `ErrnoException`. The `ErrorCode` union is `invalid_skill`, `duplicate_skill`, `not_found`,
  `not_a_file`, `path_escape`, `invalid_input`, and `io_error`.
- **Skill-directory resource confinement.** `resourcePath(name, rel)` and the exported
  `resolveResourcePath(skillDir, rel)` return an absolute path guaranteed inside the skill directory:
  `rel` must be relative and non-empty (`invalid_input` otherwise, including an absolute `rel`), the
  skill directory and the existing prefix of the target are canonicalised with `realpath` first, and a
  relative target escaping the real skill directory — via `../` or a symlink pointing outside — raises
  `path_escape`. `resourcePath` additionally requires the resource to exist (`not_found`) and
  to be a file (`not_a_file`); `resolveResourcePath` does neither check.
- **Symlink following with loop protection.** With `followSymlinks: true` (the default), symlinked
  skill directories, symlinked `SKILL.md` manifests, and symlinked resources are all followed;
  `false` ignores all three. Resource enumeration walks the whole skill directory guarded against
  symlink loops by a visited-real-path set; dangling symlinks and resource symlinks whose real target
  escapes the skill directory are skipped with a warning, so enumeration agrees with `resourcePath`'s
  confinement.
- **Skip-with-warning by default; `strict` to fail loud.** A malformed skill or a within-root
  duplicate name is skipped with a warning; softer conditions warn without dropping the skill — a
  name/directory mismatch still loads it (the frontmatter name wins) and a dangling or escaping
  resource symlink drops only that resource. All warnings route through a `WarnSink` (default
  `process.stderr`, redirectable via `setWarnSink`). `strict: true` instead throws `invalid_skill` for
  a malformed skill and `duplicate_skill` for a within-root duplicate; a cross-root override is never
  an error, even under `strict`.
- **`@clarvis/agent-skills/catalog` secondary export.** `renderSkillCatalog(skills, { heading? })`
  (with the `RenderSkillCatalogOptions` type) produces the name-sorted `# Available skills` markdown
  list (an empty string when there are no skills). The `argument-hint` frontmatter field is preserved
  verbatim on `SkillInfo.metadata` for the consumer to use as it sees fit.
- **VitePress documentation site** ([agent-skills.clarvis.dev](https://agent-skills.clarvis.dev)) and
  the canonical [`SPEC.md`](SPEC.md).

[Unreleased]: https://github.com/getclarvis/agent-skills/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/getclarvis/agent-skills/releases/tag/v0.1.0
