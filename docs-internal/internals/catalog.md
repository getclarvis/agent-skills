# Internals: the `./catalog` rendering layer

Source-level reference for [`src/catalog/index.ts`](https://github.com/getclarvis/agent-skills/blob/main/src/catalog/index.ts) — the
`@clarvis/agent-skills/catalog` secondary entry point. The user-facing contract lives in
[`SPEC.md`](../../SPEC.md) and the published
[catalog reference](https://agent-skills.clarvis.dev/reference/catalog); this page maps the one
exported function to the code.

`./catalog` is the **consumer-agnostic rendering layer**, the analog of agent-tools' `./guard`. It
projects a `SkillInfo[]` (from `listSkills()`) onto the markdown **catalog section** a host embeds in
a model's system prompt. It is **pure** — no I/O, no environment reads, and it never mutates the array
it is handed — so it carries none of core's disk-scan or precedence machinery.

## Source files

| Path | Responsibility |
|---|---|
| [`src/catalog/index.ts`](https://github.com/getclarvis/agent-skills/blob/main/src/catalog/index.ts) | `renderSkillCatalog` and the `RenderSkillCatalogOptions` type. |
| [`src/types.ts`](https://github.com/getclarvis/agent-skills/blob/main/src/types.ts) | `SkillInfo` — the sole input type, imported type-only. |

The module imports nothing but `type SkillInfo`; it reaches into no other subsystem and holds no
state.

## The exported shape

```ts
interface RenderSkillCatalogOptions {
  heading?: string;               // default "# Available skills"
}
```

## `renderSkillCatalog(skills, opts?)`

```ts
export function renderSkillCatalog(skills, opts = {}): string {
  if (skills.length === 0) return "";
  const heading = opts.heading ?? "# Available skills";
  const lines = [...skills]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((s) => `- **${s.name}** — ${s.description}`);
  return `${heading}\n\n${lines.join("\n")}\n`;
}
```

- **Empty-first.** The length check returns `""` *before* the heading is read, so an empty `skills`
  array yields the empty string even when a custom `heading` was passed — a fleet with no skills
  contributes nothing to a prompt, never a lonely heading.
- **Copy-then-sort.** `[...skills]` clones the array before `.sort`, so the caller's array is never
  reordered in place. The sort key is `name`, compared with `localeCompare`.
- **Line shape.** One bullet per skill — `- **<name>** — <description>`, an em dash, space-padded,
  with `description` copied straight through. The result is the `heading`, a blank line, the joined
  bullets, and a single trailing newline.

## Maintainer notes

- **Keep it pure.** This is the presentation seam — no disk, no env, no transport, and no mutation of
  the input array. Anything that needs to read the filesystem belongs in
  [`src/core.ts`](https://github.com/getclarvis/agent-skills/blob/main/src/core.ts), not here; the
  catalog layer only reshapes a `SkillInfo[]` a caller already computed.
- **`argument-hint` is the consumer's to use.** The `argument-hint` field stays valid in the
  [frontmatter schema](https://github.com/getclarvis/agent-skills/blob/main/src/schema.ts) and is
  preserved verbatim on `SkillInfo.metadata`, but the catalog layer does not decode it — a host reads
  `metadata["argument-hint"]` and shapes it however it advertises prompts.
- **Sort only on a copy.** `renderSkillCatalog` sorts by `name`, but `[...skills]` clones the array
  first so the caller's array is never reordered in place.
