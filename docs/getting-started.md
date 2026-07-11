# Getting started

> `@clarvis/agent-skills` is a pure-ESM leaf library that discovers, parses, merges, and serves
> **`SKILL.md` skills** to an LLM agent. A skill is a directory holding one YAML-frontmatter markdown
> file — the instructions — plus optional bundled `scripts/`, `references/`, `assets/`, and
> `examples/`. The library reads and serves that content with **progressive disclosure**; it carries
> no transport and **executes nothing**. This page takes you from install to a first catalog, a first
> body, and a first resource path.

## Install

```bash
npm install @clarvis/agent-skills
```

- **Node ≥ 20, ESM only.** The package ships ES modules with type declarations; there is no CommonJS
  build. Import it from an ESM module (or a `.mts` / `"type": "module"` project).
- **Two runtime dependencies.** `yaml` parses the frontmatter and `zod` validates it. Both are pulled
  in automatically; there are no `@clarvis/*` dependencies — this is a leaf library.

## A skill on disk

A skill is one directory, one level under a skills root — here one of the clarvis preset's roots —
containing a `SKILL.md` manifest and any resources it bundles:

```text
~/.clarvis/skills/pdf/
├── SKILL.md
├── scripts/
│   └── extract.py
└── references/
    └── spec.md
```

The manifest is markdown with a YAML frontmatter block:

```md
---
name: pdf
description: Extract text and tables from PDF files
allowed-tools: [Read, Bash]
argument-hint: <file> [--pages]
---

To extract text from a PDF, run `scripts/extract.py <file>` and read the result …
```

- **Only `name` and `description` are required.** `name` must match `^[A-Za-z0-9._-]+$` (no path
  separators or whitespace); `description` must be a non-empty string.
- **The manifest name is matched case-insensitively** — `SKILL.md`, `skill.md`, and `Skill.md` are all
  accepted — but always write it as `SKILL.md`.
- **Unknown frontmatter keys are preserved.** The schema validates the known keys (`version`,
  `allowed-tools` / `tools`, `user-invocable`, `argument-hint`, `license`) and keeps everything else
  verbatim on `metadata`, so you can carry your own fields.

Identity is the frontmatter `name`, not the directory name. When they differ, the frontmatter name
wins and a non-fatal warning fires.

## Use it

The ergonomic entry point is `createAgentSkills`. Give it the **roots** to scan and it discovers every
skill under them once, then lets you read them in three tiers. The `clarvisSkillRoots` preset builds the
clarvis four-root layout from a **workspace** — an existing directory:

```ts
import { createAgentSkills, clarvisSkillRoots } from "@clarvis/agent-skills";

const skills = createAgentSkills({ roots: clarvisSkillRoots({ workspace: process.cwd() }) });

// Tier 1 — catalog: cheap metadata for every discovered skill.
for (const info of skills.listSkills()) {
  console.log(info.name, "—", info.description);
}

// Tier 2 — body: the markdown instructions, loaded on demand.
const pdf = skills.loadSkill("pdf");
console.log(pdf?.body); // trimmed markdown, or undefined if there is no such skill

// Tier 3 — resources: a confined absolute path to a bundled file.
const script = skills.resourcePath("pdf", "scripts/extract.py");
```

Each tier does a little more work than the last — that is the point:

- **`listSkills()` → `SkillInfo[]`** is the catalog. Each entry is
  `{ name, description, metadata, allowedTools?, userInvocable, scope, source, root, dir, path }`,
  computed once at discovery. `metadata` is the raw validated frontmatter; `allowedTools` is the
  normalized `allowed-tools` (falling back to `tools`), absent when neither is declared. This is the
  cheap tier you advertise to a model.
- **`loadSkill(name)` → `SkillContent | undefined`** adds the trimmed markdown `body` and the
  enumerated `resources`. It returns `undefined` for an unknown name — no throw.
- **`resourcePath(name, rel)` → `string`** returns an absolute path **guaranteed to sit inside the
  skill directory**. `rel` must be a relative, existing file; an absolute or escaping path, or a
  missing file, throws a `SkillError` rather than returning.

Discovery runs once, when you call `createAgentSkills`. Call **`skills.refresh()`** to re-scan the
configured roots and pick up added, edited, or removed skills.

`workspace` — in the preset, the `<ws>` in its roots; on `createAgentSkills` itself, the base for any
relative root — defaults to the current working directory and is never an environment variable. An
explicit `workspace` that is not an existing directory throws a `StartupError`.

## Where skills come from

`createAgentSkills` scans exactly the roots you pass in `options.roots`, in ascending precedence —
**the last match wins**. The library ships no built-in default; the clarvis four-root layout is the
`clarvisSkillRoots()` preset, an opt-in builder that produces:

| # | Root | Scope | Source |
| --- | --- | --- | --- |
| 0 | `~/.agents/skills` | user | agents |
| 1 | `<ws>/.agents/skills` | workspace | agents |
| 2 | `~/.clarvis/skills` | user | clarvis |
| 3 | `<ws>/.clarvis/skills` | workspace | clarvis |

Discovery is one level deep (`<root>/<name>/SKILL.md`, not recursive), and `<ws>` is the preset's
`workspace` (else the current directory). Precedence is **just the array order**, so within the preset
the effect is source-primary, scope-tiebreak — `.clarvis` beats `.agents`, and within one source the
workspace copy beats the user one, which is exactly the ordering above. A skill declared in a
higher-precedence (later) root overrides the same name lower down — that is normal layering, never an
error. See [Discovery & precedence](/guide/discovery-and-precedence) for the full rules, including
within-root duplicates and `strict` mode.

## See also

- [Guide overview](/guide/) — the shape of the library and where each piece fits
- [Embed in an agent](/guide/embed-in-an-agent) — advertise the catalog, load a body on demand, and
  render a prompt catalog with `@clarvis/agent-skills/catalog`
- [Progressive disclosure](/guide/progressive-disclosure) — the catalog → body → resources tiers in depth
- [createAgentSkills](/reference/create-agent-skills) — every option, method, and return type
