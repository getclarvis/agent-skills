# The catalog export

> The secondary entry point `@clarvis/agent-skills/catalog` turns a `SkillInfo[]` (from
> [`listSkills()`](/reference/api#createagentskills-options)) into a markdown **catalog section** for a
> system prompt — the cheapest way to advertise to a model which skills *exist*. It is the analog of
> agent-tools' `./guard` — a thin, presentation-only layer that keeps the core free of any transport
> or host assumption. It is pure: no I/O, no environment reads, and it never mutates the array you
> pass it.

```ts
import { renderSkillCatalog } from "@clarvis/agent-skills/catalog";
```

`renderSkillCatalog` takes the plain `SkillInfo[]` that `listSkills()` returns, so nothing here
re-scans the disk — you compute the list once (see [Progressive disclosure](/guide/progressive-disclosure))
and render it wherever you need it.

## renderSkillCatalog(skills, options?)

Render the skill list as a markdown section suitable for a system-prompt preamble — the cheapest way
to tell a model which skills *exist* without spending a token on any skill's body.

| Input             | Type          | Required | Default              | Notes                                          |
| ----------------- | ------------- | -------- | -------------------- | ---------------------------------------------- |
| `skills`          | `SkillInfo[]` | yes      | —                    | The catalog, typically `skills.listSkills()`.  |
| `options.heading` | string        | no       | `"# Available skills"` | Replaces the leading heading line verbatim.  |

**Output.** A markdown string: the heading, a blank line, then one bullet per skill —
`- **<name>** — <description>` — and a trailing newline. Skills are **sorted by `name`** with
`localeCompare` (the input array is copied first, never reordered in place). An **empty `skills`
array returns the empty string** `""` — not a lonely heading — so a fleet with no skills contributes
nothing to the prompt.

```ts
renderSkillCatalog(skills.listSkills());
// # Available skills
//
// - **pdf** — Extract text and tables from PDF files
// - **review** — Review a diff for correctness
```

Pass `heading` to slot the catalog under an existing document structure:

```ts
renderSkillCatalog(skills.listSkills(), { heading: "## Skills you may invoke" });
// ## Skills you may invoke
//
// - **pdf** — Extract text and tables from PDF files
// - …
```

## Types

```ts
interface RenderSkillCatalogOptions {
  heading?: string; // default "# Available skills"
}
```

`SkillInfo` — the input to `renderSkillCatalog` — is documented under the
[API reference](/reference/api#types); only its `name` and `description` are consulted here. The
`argument-hint` frontmatter field is preserved verbatim on `metadata["argument-hint"]` for the
consumer to use as it sees fit, but this layer does not read it.

## A worked example

Wire `renderSkillCatalog` into a host that speaks to a model — it seeds the system prompt with the
skills the agent may reach for.

```ts
import { createAgentSkills, clarvisSkillRoots } from "@clarvis/agent-skills";
import { renderSkillCatalog } from "@clarvis/agent-skills/catalog";

const skills = createAgentSkills({ roots: clarvisSkillRoots({ workspace: process.cwd() }) });
const catalog = skills.listSkills();

// A system-prompt preamble: what the agent may reach for.
const systemPrompt = [
  "You are a coding agent.",
  renderSkillCatalog(catalog),
].join("\n\n");
```

When the agent triggers a skill, the host pulls the body with `skills.loadSkill(name)` — the next tier
of [progressive disclosure](/guide/progressive-disclosure). For the end-to-end integration, including
how the catalog becomes a system-prompt block and a `load_skill` tool inside a real loop, see
[Embed in an agent](/guide/embed-in-an-agent).

## See also

- [Embed in an agent](/guide/embed-in-an-agent) — the full consumer wiring
- [Progressive disclosure](/guide/progressive-disclosure) — catalog → body → resources
- [API reference](/reference/api) — `createAgentSkills`, `listSkills`, and the `SkillInfo` shape
