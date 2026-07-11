---
layout: home

hero:
  name: "@clarvis/agent-skills"
  text: The skills your agent needs — as a plain library
  tagline: Discover, parse, merge, and serve Claude-Code / opencode-style SKILL.md skills across the roots you configure, with progressive disclosure and resource confinement. A pure-ESM leaf library that carries no transport and executes nothing — embed it in any agent.
  image:
    src: /loop.webp
    alt: "@clarvis/agent-skills"
  actions:
    - theme: brand
      text: Get started
      link: /getting-started
    - theme: alt
      text: The API
      link: /reference/create-agent-skills
    - theme: alt
      text: View on GitHub
      link: https://github.com/getclarvis/agent-skills

features:
  - icon: 🗂️
    title: Roots you configure
    details: You pass the roots to scan via options.roots; discovery reads each one level deep and merges by frontmatter name, with precedence set by array order — ascending, last wins. The clarvisSkillRoots() preset is the opt-in clarvis convention — ~/.agents/skills, <ws>/.agents/skills, ~/.clarvis/skills, <ws>/.clarvis/skills, in that order.
  - icon: 🪜
    title: Progressive disclosure
    details: Three tiers, cheapest first — listSkills() returns a catalog computed at discovery, loadSkill(name) reads a full markdown body on demand, and bundled scripts/, references/, and assets/ resources are enumerated only when you reach for them.
  - icon: 🛡️
    title: Safe by construction
    details: resourcePath(name, rel) returns an absolute path guaranteed inside the skill directory — ../ traversal and symlink escapes are rejected with path_escape after realpath canonicalization (an absolute or empty rel is rejected earlier with invalid_input). The library reads and serves skill content and executes nothing.
  - icon: 🧩
    title: Consumer-agnostic
    details: A leaf library with no @clarvis/* dependencies and no transport. The @clarvis/agent-skills/catalog export renders the catalog into a system-prompt markdown block.
  - icon: 🩹
    title: Resilient, or loud
    details: A malformed skill or a within-root duplicate name is skipped with a non-fatal warning by default, so one bad directory never sinks discovery. Flip strict to true to turn both into thrown errors when you would rather fail loud.
  - icon: 📦
    title: Zero-dependency leaf
    details: Pure ESM, Node ≥ 20, two small runtime dependencies (yaml and zod), and zero @clarvis/* dependencies — a self-contained leaf you can drop into any agent stack.
---

## What it gives your agent

`@clarvis/agent-skills` is the skill layer for an LLM agent, packaged as a library you call directly.
You give it the roots to scan; it discovers every `SKILL.md` under the roots you configure, parses and
validates the frontmatter, merges same-named skills by precedence, and hands you a
progressive-disclosure surface — the catalog, the bodies, and the bundled resources:

- **Advertise a skill catalog to your model.** `listSkills()` returns each skill's `name`,
  `description`, declared `allowedTools`, `scope`, and `source` — cheap to compute at discovery and
  safe to inject into a system prompt on every turn.
- **Load a body only when the model reaches for it.** `loadSkill(name)` returns the trimmed markdown
  instructions plus an enumerated list of bundled resources, or `undefined` for an unknown name.
- **Resolve a bundled file, confined.** `resourcePath(name, rel)` returns an absolute path guaranteed
  inside the skill directory — so `scripts/extract.py` reaches a real file, but `../secrets` comes
  back as a `path_escape` error rather than touching the host.
- **Stay resilient — or fail loud.** A malformed skill or a within-root duplicate name is skipped
  with a warning by default; `strict: true` turns both into thrown errors. Discovery runs once at
  construction; `refresh()` re-scans the roots to pick up added, edited, and removed skills.

It carries **no transport** and **executes nothing** — it is discovery, parsing, merge, and serving,
and nothing else. A skill body is instructions an agent may choose to follow, and a skill may bundle
a `scripts/` directory, so trust the roots you point it at.

## Install

```bash
npm install @clarvis/agent-skills
```

Node ≥ 20, ESM only. Runtime dependencies: [`yaml`](https://www.npmjs.com/package/yaml) and
[`zod`](https://www.npmjs.com/package/zod) — and no `@clarvis/*` dependencies.

## Quick start

```ts
import { createAgentSkills, clarvisSkillRoots } from "@clarvis/agent-skills";

const skills = createAgentSkills({ roots: clarvisSkillRoots({ workspace: process.cwd() }) });

// Tier 1 — the catalog, computed at discovery (cheap to inject into a prompt):
const catalog = skills.listSkills(); // SkillInfo[] — name, description, scope, source, …

// Tier 2 — a full body, loaded on demand:
const pdf = skills.loadSkill("pdf");
console.log(pdf?.body); // the trimmed markdown instructions, or undefined if unknown

// Tier 3 — a bundled resource, as an absolute path confined to the skill directory:
const script = skills.resourcePath("pdf", "scripts/extract.py");
```

`roots` is required. Here the `clarvisSkillRoots` preset builds the clarvis four-root layout; its
`workspace` is the `<ws>` whose `.agents/` and `.clarvis/` skill directories join the two user-home
roots, defaulting to `cwd` and **never** read from the environment. See
[Discovery & precedence](/guide/discovery-and-precedence) for how the configured roots merge.

## Two ways in

**Use the factory.** `createAgentSkills(options)` resolves a config once and hands back
`listSkills()` / `loadSkill()` / `resourcePath()` / `refresh()` — the ergonomic path for wiring
skills into an agent. Start with [Getting started](/getting-started), then
[Embed it in an agent](/guide/embed-in-an-agent).

**Drive the core directly.** The building blocks are exported too — `resolveConfig`,
`discoverSkills` (which returns a `SkillRegistry` — call its `.list()` / `.get(name)` /
`.resource(name, rel)`), `mergeSkills`, the `parseSkill` parser, and `resolveResourcePath` — for
building your own surface (an MCP-prompt bridge, a test harness). The
[`@clarvis/agent-skills/catalog`](/reference/catalog) export renders the catalog straight to a
system-prompt block. See [The API](/reference/api).

## Built for safety

`@clarvis/agent-skills` reads and serves skill content but **never executes it** — a skill body is
instructions your agent may follow, and a skill may bundle a `scripts/` directory. Trust the roots
you point it at, especially a shared store such as the `~/.agents/skills` the clarvis preset includes.
Resource-path confinement is
defense-in-depth for **file access** — it is **not** a sandbox for whatever your agent does with a
script it reads, and the workspace is never taken from the environment. See
[Resource confinement](/explanation/resource-confinement) and
[Deploy securely](/operations/deploy-securely).
