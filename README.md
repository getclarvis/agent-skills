# @clarvis/agent-skills

Discover, parse, merge, and serve **Claude-Code / opencode-style `SKILL.md`
skills** for an LLM agent, usable as a **plain library**. A skill is a directory
with a `SKILL.md` (YAML frontmatter + markdown instructions) and optional bundled
`scripts/`, `references/`, `assets/`, and `examples/`. This package finds skills
across **the roots you configure**, resolves name collisions by a clear
precedence, and hands your agent a cheap **catalog**, on-demand **bodies**, and
confined **resource paths** — progressive disclosure in three tiers.

This package is a **pure-ESM leaf library**: it has no `@clarvis/*` dependencies,
carries no transport, and **executes nothing**. It reads skill content off disk
and serves it; running the instructions or the bundled scripts is the caller's
job. It is one of the two leaves that feed the engine:

```
@clarvis/agent-tools   (tools)  ─┐
                                 ├─▶  @clarvis/agent-loop  ─▶  @clarvis/mcp  ─▶  @clarvis/code
@clarvis/agent-skills  (skills) ─┘
```

> [!WARNING]
> A skill is **semi-trusted content**. Its body is instructions an agent may
> follow, and its resources may include a `scripts/` directory. This library
> never runs any of it, but you choose the roots it scans — and those may point
> at stores whose entries you did not author (the clarvis preset, for one,
> includes the shared `~/.agents/skills` store — the `npx skills` / `skills.sh`
> cross-tool store). **Trust the roots you point it at.**
> Resource-path confinement keeps `resourcePath` inside a skill's own directory,
> but that is defense-in-depth for file access — not a substitute for OS-level
> isolation of whatever executes the skill. See [Security](#security).

## Requirements

- Node.js >= 20
- Runtime dependencies: [`yaml`](https://www.npmjs.com/package/yaml) and
  [`zod`](https://zod.dev/). There are no external tools to install — discovery
  and parsing are pure `node:fs`.

## Install

```bash
npm install @clarvis/agent-skills
```

## Quickstart

The ergonomic entry point is `createAgentSkills`. Give it the **roots to scan**
(ascending precedence, last wins) and it resolves a config, scans them once, and
exposes the three disclosure tiers:

```ts
import { createAgentSkills } from "@clarvis/agent-skills";

const skills = createAgentSkills({
  roots: [{ path: "~/.myapp/skills", scope: "user", source: "myapp" }],
});

// Tier 1 — cheap catalog (name + description + metadata), computed at discovery
for (const s of skills.listSkills()) {
  console.log(`${s.name} — ${s.description}  [${s.scope}/${s.source}]`);
}

// Tier 2 — load one skill's full instructions on demand (undefined if unknown)
const pdf = skills.loadSkill("pdf");
console.log(pdf?.body);

// Tier 3 — resolve a bundled resource to a confined absolute path
const script = skills.resourcePath("pdf", "scripts/extract.py");
```

`roots` is required — pass whatever layout your app uses. For the clarvis
four-root convention, use the `clarvisSkillRoots` preset:

```ts
import { createAgentSkills, clarvisSkillRoots } from "@clarvis/agent-skills";

const skills = createAgentSkills({ roots: clarvisSkillRoots({ workspace: process.cwd() }) });
```

`loadSkill(name)` returns `undefined` for an unknown skill. `resourcePath(name,
rel)` throws a `SkillError` if the resource is missing, is a directory, or would
escape the skill directory (see [Security](#security)). Call `refresh()` to
re-scan the configured roots and pick up added, edited, or removed skills —
discovery otherwise runs once, at `createAgentSkills`.

## Discovery roots & precedence

Skills are discovered **one level deep** — `<root>/<name>/SKILL.md`, not a
recursive walk. You pass the roots via `options.roots`; they are scanned in
**ascending precedence** — the **last** root that declares a given name wins.
Each root is a `{ path, scope?, source? }`, where `path` may be `~`-prefixed
(expands against home), relative (resolves against the `workspace`, else the
cwd), or absolute; `scope` (`"user" | "workspace"`, default `"workspace"`) and
`source` (a free-form string) are **pure provenance labels** surfaced on
`SkillInfo` — they do not affect precedence. A missing root is never an error;
an empty `roots` list throws `StartupError`.

The clarvis convention ships as the **`clarvisSkillRoots()`** preset — the four
roots below, in this (ascending) order — but it is a plain builder you opt into,
not a default:

```
~/.agents/skills   →   <ws>/.agents/skills   →   ~/.clarvis/skills   →   <ws>/.clarvis/skills
       user/agents        workspace/agents          user/clarvis           workspace/clarvis
```

Within that preset the effect is source-primary, scope-tiebreak: any `.clarvis`
skill overrides any `.agents` skill of the same name, and within one source the
workspace copy overrides the user copy — which is just the array order above.
`<ws>` is the `workspace` option, else the current working directory — **never
the environment**.

A skill's **identity is its frontmatter `name`**, not its directory name; when
the two differ, the frontmatter name wins and a non-fatal warning fires. That
name is the merge key:

- **Across roots**, a duplicate name in a higher-precedence (later) root simply
  overrides the earlier one. This is normal precedence — never an error, even
  under `strict`.
- **Within one root**, a duplicate name keeps the first by sorted directory order
  and warns (default), or throws `duplicate_skill` under `strict: true`.

The clarvis preset's `.agents/skills` roots are the cross-tool shared store,
whose entries are often symlinks into a single content-addressed store — with
`followSymlinks` (the default) `agent-skills` follows them.

## The `SKILL.md` format

Each skill directory holds a manifest whose filename is matched
**case-insensitively** (`SKILL.md`, `skill.md`, `Skill.md` are all accepted;
write it as `SKILL.md`). The manifest is YAML frontmatter followed by a markdown
body:

```md
---
name: pdf
description: Extract text and tables from PDF files.
version: 1.2.0
allowed-tools: [read_file, bash]
argument-hint: "<file> [pages]"
---

# PDF extraction

Use `scripts/extract.py` to pull text and tables out of a PDF, then …
```

The frontmatter schema (`skillFrontmatterSchema`, a `zod` `.passthrough()`) is:

| Key              | Required | Meaning                                                                       |
| ---------------- | -------- | ----------------------------------------------------------------------------- |
| `name`           | **yes**  | Identity and merge key. Must match `^[A-Za-z0-9._-]+$` (no separators/space). |
| `description`    | **yes**  | Non-empty, trimmed. Shown in the catalog.                                     |
| `version`        | no       | Free-form version string.                                                     |
| `allowed-tools`  | no       | Tools the skill expects — a YAML array or a comma-separated string.           |
| `tools`          | no       | Alias for `allowed-tools`; `allowed-tools` wins when both are present.        |
| `user-invocable` | no       | Boolean, default `true` → `SkillInfo.userInvocable`.                          |
| `argument-hint`  | no       | e.g. `"<required> [optional]"`; preserved verbatim on `SkillInfo.metadata`.    |
| `license`        | no       | Free-form license string.                                                     |

Any other key is preserved verbatim on `SkillInfo.metadata` (the raw validated
frontmatter). Normalization touches only tools: `allowed-tools` (falling back to
`tools`) is trimmed and blank-stripped into `SkillInfo.allowedTools: string[]`,
which is absent when neither key is declared. Both YAML shapes — a flow array and
a comma-separated string — normalize identically. A malformed manifest (missing
or misaligned `---` fence, invalid YAML, a schema failure) is skipped with a
warning by default, or throws `invalid_skill` under `strict: true`.

## API

The default export (`@clarvis/agent-skills`) is the discovery and serving
surface:

- `createAgentSkills(options)` → `AgentSkills` with `{ config, listSkills(),
  loadSkill(name), resourcePath(name, rel), refresh() }`. The ergonomic entry
  point; takes the required `roots`, scans once, and memoizes the registry until
  `refresh()`.
- `clarvisSkillRoots(opts?)` → `SkillRootInput[]` — the clarvis four-root preset
  (`~/.agents/skills`, `<ws>/.agents/skills`, `~/.clarvis/skills`,
  `<ws>/.clarvis/skills`); pass its result as `roots`.
- `discoverSkills(config)` → `SkillRegistry` — the lower-level surface, for
  callers building their own lifecycle; call the registry's `.list()`,
  `.get(name)`, and `.resource(name, rel)`.
- `parseSkill(raw)` → `{ frontmatter, body }` — parse one manifest's text.
  `normalizeTools(tools)` → `string[]` — the tools trim/blank-strip rule as a
  standalone helper.
- `mergeSkills(groups)` → `ResolvedSkill[]` — the ascending-precedence, last-wins
  fold over per-root skill groups.
- `resolveConfig(options)` — config resolution from the options object (`roots`,
  `workspace`, `strict`, `followSymlinks`); normalizes each root and returns the
  `SkillConfig`. `DEFAULT_STRICT` (`false`), `DEFAULT_FOLLOW_SYMLINKS` (`true`),
  and `StartupError` (thrown for an empty `roots` list or a `workspace` that is
  not an existing directory) are exported alongside.
- `resolveResourcePath(skillDir, rel)` — the skill-directory confinement check
  (see [Security](#security)); `expandHome`, `resolveWorkspaceDir`, and
  `resolveAgainst` are the general path primitives (the last is exactly the rule
  applied to each root `path`).
- `skillFrontmatterSchema` — the `zod` schema above, for validating frontmatter
  outside this library.
- `SkillError` / `fsError` / `ErrorCode` — the structured error contract. A
  `SkillError` carries `.code` (one of the `ErrorCode` union), `.message`, and
  `.fields`; a consumer that wants a JSON envelope builds it from those (e.g.
  `JSON.stringify({ error: err.code, message: err.message, ...err.fields })`).
  `fsError(err, path)` maps a Node `ErrnoException` to a `SkillError`.
- `setWarnSink(fn | null)` / `WarnSink` — redirect the non-fatal warning stream
  (default `process.stderr`); pass `null` to reset it.
- Types: `SkillInfo`, `SkillContent`, `SkillResource`, `SkillScope`,
  `SkillSource`, `SkillRoot`, `SkillRootInput`, `SkillRegistry`, `ResolvedSkill`,
  `SkillFrontmatter`, `SkillConfig`, `AgentSkillsOptions`, `ParsedSkill`,
  `ClarvisSkillRootsOptions`.

Options: `{ roots, workspace?, cwd?, home?, strict?, followSymlinks? }`. `roots`
is **required** — the ordered list of `SkillRootInput` to scan (an empty list
throws `StartupError`). `workspace` is the base for relative roots (defaults to
`cwd`) and is never read from the environment; an explicit workspace that is not
an existing directory throws `StartupError`. `cwd` defaults to `process.cwd()`,
`home` to `os.homedir()`. `strict` defaults to `false` (skip malformed and
in-root-duplicate skills with a warning). `followSymlinks` defaults to `true`
(follow symlinked skill directories, manifests, and resources; `false` ignores
all three). This library reads **no environment variables of its own** — the
`CLARVIS_SKILLS_ENABLED` switch belongs to the downstream `agent-loop` consumer,
not here.

### `@clarvis/agent-skills/catalog`

A consumer-agnostic secondary export for turning a `SkillInfo[]` into a prompt
preamble — no discovery, just rendering:

```ts
import { renderSkillCatalog } from "@clarvis/agent-skills/catalog";

// A "# Available skills" markdown section (sorted by name; "" when there are none)
const preamble = renderSkillCatalog(skills.listSkills());
```

- `renderSkillCatalog(skills, { heading? })` → a markdown string of `- **name** —
  description` lines under a heading (default `# Available skills`), sorted by
  name; the empty string when `skills` is empty.
- Types: `RenderSkillCatalogOptions`.

## Security

This library **reads and serves** skill content and never executes it, so its
security surface is the file access it grants — stated plainly:

- **Skill-directory confinement.** `resourcePath(name, rel)` and the exported
  `resolveResourcePath(skillDir, rel)` return an absolute path guaranteed to sit
  **inside** the skill directory. `rel` must be relative and non-empty (an
  absolute or empty `rel` is `invalid_input`). The skill directory is
  canonicalized with `realpath` first (so a skill dir that is itself a symlink
  into a shared store resolves before the check), and the existing prefix of the
  target is canonicalized too (so symlink hops are caught). A target that escapes
  the real skill directory — via `../` or a symlink pointing outside — is rejected
  with `path_escape`. `resourcePath` additionally requires
  the resource to exist (`not_found`) and to be a file (`not_a_file`);
  `resolveResourcePath` does neither check.
- **Resource enumeration agrees with confinement.** Walking a skill's resources
  is guarded against symlink loops by a visited-real-path set; a resource symlink
  whose real target escapes the skill directory is skipped with a warning, so
  enumeration never surfaces a path `resourcePath` would then refuse.
- **The threat model is the content, not the reader.** A skill body is
  instructions an agent may follow, and `scripts/` may contain runnable code.
  Confinement is defense-in-depth for file access — it does not sandbox whatever
  ultimately runs the skill. **Trust the roots you point it at** (with the clarvis
  preset, especially the shared `~/.agents/skills` store), and run the executor
  inside an OS-level sandbox. The workspace is never taken from the environment.

See [SECURITY.md](SECURITY.md) for the full trust model.

## Documentation

Full guides and reference live at
**[agent-skills.clarvis.dev](https://agent-skills.clarvis.dev)** (source in
[`docs/`](docs/)):

- **Guide** — [getting started](https://agent-skills.clarvis.dev/getting-started),
  [embed in an agent](https://agent-skills.clarvis.dev/guide/embed-in-an-agent),
  [discovery & precedence](https://agent-skills.clarvis.dev/guide/discovery-and-precedence),
  [progressive disclosure](https://agent-skills.clarvis.dev/guide/progressive-disclosure).
- **Reference** — [createAgentSkills](https://agent-skills.clarvis.dev/reference/create-agent-skills),
  [configuration](https://agent-skills.clarvis.dev/reference/configuration),
  [the API](https://agent-skills.clarvis.dev/reference/api),
  [the catalog export](https://agent-skills.clarvis.dev/reference/catalog),
  [error codes](https://agent-skills.clarvis.dev/reference/error-codes).
- **Concepts & operations** —
  [how it works](https://agent-skills.clarvis.dev/explanation/how-it-works),
  [the SKILL.md format](https://agent-skills.clarvis.dev/explanation/the-skill-format),
  [resource confinement](https://agent-skills.clarvis.dev/explanation/resource-confinement),
  [deploy securely](https://agent-skills.clarvis.dev/operations/deploy-securely).

The canonical contract (discovery, precedence, the API surface, and error codes)
is [SPEC.md](SPEC.md).

## Development

```bash
npm run build         # tsc -> dist/ (emits .d.ts)
npm test              # vitest (contract + integration)
npm run test:coverage # vitest + 95% coverage gate
npm run typecheck
npm run lint
npm run format:check
npm run pre-commit    # typecheck + format:check + test:coverage
```

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, the
project layout, and the 95% quality gate; [SPEC.md](SPEC.md) for the canonical
contract; [`docs-internal/`](docs-internal/) for the architecture and
per-subsystem internals; and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Report
security issues privately per [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) © Clarvis
