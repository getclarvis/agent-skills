# Guide

> How to use `@clarvis/agent-skills` in practice: discover `SKILL.md` skills across the roots you
> configure, serve them to a model with progressive disclosure, and reach their bundled resources
> safely. Every page here is task-oriented; the [API reference](/reference/api) has the exhaustive
> contracts.

## The mental model

`agent-skills` is a **leaf library** — no `@clarvis/*` dependencies, no transport, and it **executes
nothing**. It discovers a skill (a directory holding a `SKILL.md` manifest plus optional `scripts/`,
`references/`, `assets/`, and `examples/`), then serves it in three tiers so an agent can know a skill
*exists* cheaply and pull in detail only when it decides to use one: a catalog first, the markdown
body on demand, and bundled resources lazily. Skills are found across the roots you pass in — scanned
in array order, ascending precedence (last wins) — so a later root can override a shared skill by
`name`. The clarvis four-root layout is the opt-in `clarvisSkillRoots()` preset.

## Pick your entry point

### The factory — for embedding in an agent loop

`createAgentSkills(options)` resolves a config and runs discovery **once**, then returns
`listSkills()` / `loadSkill()` / `resourcePath()` / `refresh()`. Its `roots` option is **required** —
the ordered list to scan; the `clarvisSkillRoots()` preset builds the clarvis layout. This is what most
consumers want: advertise the catalog to a model, then load a body and its resources when the model
reaches for a skill.

```ts
import { createAgentSkills, clarvisSkillRoots } from "@clarvis/agent-skills";

const skills = createAgentSkills({ roots: clarvisSkillRoots({ workspace: process.cwd() }) });
skills.listSkills();            // cheap SkillInfo[] — advertise this
skills.loadSkill("pdf")?.body;  // the markdown, loaded on demand
```

→ **[Embed it in an agent](/guide/embed-in-an-agent)**

### The free functions — for building your own wiring

The building blocks are exported too, so you can compose discovery yourself: `discoverSkills` returns a
`SkillRegistry` — call its `.list()` / `.get(name)` / `.resource(name, rel)`; `parseSkill` parses one
manifest; `mergeSkills` is the ascending-precedence fold; `resolveConfig` produces the `SkillConfig`;
and `resolveResourcePath` gives you skill-directory confinement without the factory.

→ **[Lower-level surface](/reference/api#lower-level-surface)**

## In this guide

- **[Embed it in an agent](/guide/embed-in-an-agent)** — wire the factory into a loop, render the
  catalog for a system prompt, and load bodies and resources on trigger.
- **[Discovery & precedence](/guide/discovery-and-precedence)** — the roots you configure, precedence
  as array order, the `clarvisSkillRoots` preset, name collisions, and strict vs. lenient discovery.
- **[Progressive disclosure](/guide/progressive-disclosure)** — the three tiers (catalog → body →
  resources), resource confinement, and `refresh()`.

## See also

- [Getting started](/getting-started) — install and a first `listSkills` / `loadSkill`
- [API reference](/reference/api) — every export, option, and error code
