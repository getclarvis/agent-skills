# Progressive disclosure

> Skills are served in three tiers of rising cost, so an agent can know a skill *exists* for almost
> nothing and pull in detail only when it decides to use one. This page walks the tiers — the catalog,
> the body, and the resources — plus `refresh()`.

## Tier 1 — the catalog

`listSkills()` returns `SkillInfo[]`, sorted by `name`, computed once at discovery — cheap enough to
keep in context or advertise to a model on every turn. Each entry carries:

| Field | What it is |
| --- | --- |
| `name` | the frontmatter `name` — also the merge key across roots |
| `description` | the frontmatter `description` |
| `metadata` | the **raw** validated frontmatter, every key as written (`zod .passthrough`) — *not* normalized |
| `allowedTools?` | the one **normalized** field (see below); absent when the skill declares no tools |
| `userInvocable` | from `user-invocable`, defaulting to `true` |
| `scope` · `source` · `root` · `dir` · `path` | provenance — which root the skill won from, and where it lives on disk |

```ts
for (const s of skills.listSkills()) {
  console.log(`${s.name} — ${s.description}`);
}
```

`metadata` is the frontmatter verbatim: reach for `metadata.version`, `metadata["argument-hint"]`,
`metadata.license`, or any custom key you put in the YAML. The single field the library normalizes is
`allowedTools` — it reads `allowed-tools` (falling back to `tools`, with `allowed-tools` winning when
both are present), accepts either a YAML array or a comma-separated string, and returns a trimmed
`string[]` with blanks dropped. When neither key is declared, `allowedTools` is absent entirely.

### The `./catalog` export

`@clarvis/agent-skills/catalog` turns a `SkillInfo[]` into a system-prompt section, without coupling
the core library to any one consumer:

```ts
import { renderSkillCatalog } from "@clarvis/agent-skills/catalog";

renderSkillCatalog(skills.listSkills());
// "# Available skills\n\n- **pdf** — Extract text from PDFs\n"
```

`renderSkillCatalog` sorts by `name`, emits one `- **name** — description` line per skill, and returns
the **empty string** when the list is empty. Pass `{ heading }` to override the default `# Available
skills` title. The frontmatter `argument-hint` is preserved verbatim on each skill's `metadata` for the
consumer to use as it sees fit.

See [The catalog export](/reference/catalog) for the full signatures.

## Tier 2 — the body

`loadSkill(name)` returns a `SkillContent` — a `SkillInfo` plus the trimmed markdown `body` and the
enumerated `resources` — or `undefined` for an unknown name. Load it only once the agent has decided to
trigger the skill; the `body` is the instructions the model will follow.

```ts
const content = skills.loadSkill("pdf");
if (content) sendToModel(content.body);
```

## Tier 3 — resources

`SkillContent.resources` lists the skill's bundled files as `SkillResource` entries — `{ kind, rel,
path }`, where `rel` is POSIX-relative to the skill directory and `kind` is taken from the top path
segment: `scripts`, `references`, `assets`, `examples`, or `other`. The `SKILL.md` manifest itself is
excluded. Enumeration walks the whole skill directory (missing conventional dirs simply contribute
nothing) and is guarded against symlink loops; a dangling symlink, or a resource symlink whose real
target escapes the skill directory, is skipped with a warning — so the listing always agrees with what
`resourcePath` will hand back.

To turn a `rel` into an absolute path you can read, call `resourcePath(name, rel)`. It confines the
result to the skill directory and only returns a path to a real file:

```ts
const script = skills.resourcePath("pdf", "scripts/extract.py"); // absolute path, inside the skill dir
```

It throws a `SkillError` when the request cannot be honoured safely:

| Code | When |
| --- | --- |
| `invalid_input` | `rel` is empty or absolute |
| `path_escape` | `rel` resolves outside the skill directory (via `../` or a symlink pointing outside) |
| `not_found` | the skill name is unknown, or the resource does not exist |
| `not_a_file` | `rel` resolves to a directory rather than a file |

The exported `resolveResourcePath(skillDir, rel)` runs the same confinement check without the existence
or is-a-file checks — the raw path resolver, so it can throw `invalid_input` or `path_escape` but never
`not_found` or `not_a_file`. See [Resource confinement](/explanation/resource-confinement) for exactly
how the canonicalization works.

## Refreshing

Discovery runs once, when you call `createAgentSkills`. Call `refresh()` to re-scan the configured
roots — it reflects skills **added**, **edited** (a changed body), and **removed** on disk since the
last scan:

```ts
skills.refresh();
skills.listSkills(); // the re-scanned catalog
```

## See also

- [The catalog export](/reference/catalog) — the `renderSkillCatalog` signature
- [Resource confinement](/explanation/resource-confinement) — the realpath-based escape guard
- [Discovery & precedence](/guide/discovery-and-precedence) — how the configured roots resolve a name
