# Embed skills in an agent

> The core pattern: discover skills once, advertise a cheap **catalog** in the system prompt, and pull
> a skill's **body** (and its **resources**) in only when the model decides to use one.
> `@clarvis/agent-skills` gives you the discovery, the catalog, and the confined resource paths — you
> own the model call and the loop.

## The cycle

Skills come in three tiers of increasing cost, and an agent loop touches them in order. That ordering
**is** the value the library adds — see [Progressive disclosure](/guide/progressive-disclosure):

1. **Advertise** — render `skills.listSkills()` into the system prompt as a catalog (name + description only).
2. **Model call** — the model replies, and may decide to invoke a skill *by name*.
3. **Open** — for the chosen name, call `skills.loadSkill(name)` and feed `content.body` back as instructions.
4. **Resolve resources** — when the body points at a bundled file, hand the model a confined path from `skills.resourcePath(name, rel)`.
5. **Repeat** — the catalog stays resident; bodies and resources come and go per turn.

```text
   listSkills() ──▶ catalog in system prompt ──▶ model picks a skill by name
                                                          │
                                                          ▼
   content.body / resourcePath(name, rel) ◀── loadSkill(name)
```

`@clarvis/agent-skills` owns discovery and serving only. The model call, the tool/prompt wiring, and
the loop are yours — which keeps the package free of any provider, transport, or framework dependency.
It reads and serves skill content; it **executes nothing**.

## Discover

`createAgentSkills` scans the roots you pass once and returns a handle. Give it `roots` — the ordered
list to scan; the `clarvisSkillRoots` preset builds the clarvis four-root layout from a `workspace`,
which is the `<ws>` in its roots and is **never** read from the environment. An explicit `workspace`
that is not an existing directory throws `StartupError`.

```ts
import { createAgentSkills, clarvisSkillRoots } from "@clarvis/agent-skills";

const skills = createAgentSkills({ roots: clarvisSkillRoots({ workspace: process.cwd() }) });
```

Discovery runs at construction, so `listSkills()` is already populated and cheap to read repeatedly.
See [createAgentSkills](/reference/create-agent-skills) for every option.

## Advertise the catalog

`listSkills()` returns `SkillInfo[]` — `name`, `description`, the raw validated `metadata`,
`allowedTools?`, `userInvocable`, and provenance (`scope`, `source`, `root`, `dir`, `path`). The
`@clarvis/agent-skills/catalog` export renders that list into a system-prompt section without coupling
the core to any consumer:

```ts
import { renderSkillCatalog } from "@clarvis/agent-skills/catalog";

const catalog = renderSkillCatalog(skills.listSkills());
// "# Available skills\n\n- **pdf** — Extract text and tables from PDF files\n"

const systemPrompt = `${basePrompt}\n\n${catalog}`;
```

`renderSkillCatalog` sorts by name and returns an **empty string** when there are no skills, so an
empty roots set contributes nothing to the prompt. Pass `{ heading }` to change the `# Available skills`
title. See [The catalog export](/reference/catalog).

Only each skill's name and description reach the model here — the body stays on disk. That is what
keeps the catalog affordable to hold in context for a whole session.

## Open a skill on demand

When the model invokes a skill by name, call `loadSkill` and feed the body back as instructions:

```ts
const content = skills.loadSkill(name); // SkillContent | undefined
if (content) {
  sendToModel(content.body); // the trimmed markdown instructions
}
```

`loadSkill` returns `undefined` for an unknown name rather than throwing, so a hallucinated skill name
is a soft miss you can report back to the model instead of a crash. `content` is a `SkillInfo` plus its
`body` and `resources`.

## Resolve resources (confined)

A skill body may reference bundled files under `scripts/`, `references/`, `assets/`, or `examples/`.
`content.resources` enumerates them, and `resourcePath(name, rel)` turns a POSIX-relative path into an
absolute one **guaranteed to stay inside the skill directory**:

```ts
const script = skills.resourcePath("pdf", "scripts/extract.py"); // a confined absolute path
```

The `rel` must be relative and non-empty — an empty or absolute `rel` throws
`SkillError("invalid_input")`. A relative path that escapes the skill directory — via `../` or a
symlink pointing outside — throws `SkillError("path_escape")`; a missing file throws `not_found`, and
a `rel` that resolves to a directory throws `not_a_file`. This confinement
lets a skill live **outside** the workspace (e.g. in the clarvis preset's `~/.agents/skills`) while
still bounding what the agent can read from it. It is defense-in-depth for file access, not a
substitute for OS-level
isolation — see [Deploy securely](/operations/deploy-securely).

## A prompt or slash-command surface

To expose skills as MCP prompts or slash commands — instead of, or alongside, a system-prompt catalog —
build the surface from the fields on each `SkillInfo`: `name` and `description` name the command, and
the skill's `argument-hint` frontmatter is preserved verbatim on `metadata` for you to use as you see
fit — for example, parse a `<token>` into a required argument and a `[token]` into an optional one on
your side.

Use `userInvocable` to decide which skills a human is allowed to trigger. Skills default to
`user-invocable: true`, but a skill can set it to `false` to stay agent-only; filter on it before you
surface a slash-command list:

```ts
const userFacing = skills.listSkills().filter((s) => s.userInvocable);
```

## Keeping skills in sync

Discovery is a one-time snapshot taken at `createAgentSkills`. When skills change on disk — added,
edited, or removed — call `refresh()` to re-scan the configured roots and rebuild the catalog:

```ts
skills.refresh();
const catalog = renderSkillCatalog(skills.listSkills()); // reflects the change
```

For authoring or CI, construct with `strict: true`. Discovery is resilient by default — a malformed
`SKILL.md` or an in-root duplicate name is skipped with a warning routed through the `WarnSink` — but
`strict` turns both into a thrown `SkillError`, so a broken skill fails the build instead of silently
disappearing. A cross-root override is normal precedence, never a duplicate, and never throws even
under `strict`.

## A downstream example: the agent-loop grant

`@clarvis/agent-loop` consumes this library exactly as above. Its `use_skills` grant injects
`renderSkillCatalog(listSkills())` into the agent's system prompt and attaches a built-in `load_skill`
tool that calls `loadSkill` / `resourcePath` to pull a body or resource on demand — the same three
tiers, wired for that engine's own tool protocol. You do not need agent-loop to do any of this; it is
just one concrete assembly of the primitives on this page.

## See also

- [Progressive disclosure](/guide/progressive-disclosure) — the three tiers in depth
- [The catalog export](/reference/catalog) — `renderSkillCatalog`
- [createAgentSkills](/reference/create-agent-skills) — every option and the `AgentSkills` handle
