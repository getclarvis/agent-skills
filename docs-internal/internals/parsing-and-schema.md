# Internals: frontmatter parsing & schema

Source-level reference for how a `SKILL.md` file is split into frontmatter + body and validated. The
user-facing format guide lives at [the skill format](/explanation/the-skill-format) and the option
catalog at [configuration](/reference/configuration); this page covers the split/parse mechanics and
the `zod` schema those pages summarize.

## Source files

| Path | Responsibility |
|---|---|
| [`src/parse.ts`](https://github.com/getclarvis/agent-skills/blob/main/src/parse.ts) | `splitFrontmatter` (internal), `parseSkill`, `normalizeTools`, the `FRONTMATTER_RE`, and the `ParsedSkill` type. |
| [`src/schema.ts`](https://github.com/getclarvis/agent-skills/blob/main/src/schema.ts) | `skillFrontmatterSchema` (`zod`) and the inferred `SkillFrontmatter` type. |

`parseSkill`, `normalizeTools`, `ParsedSkill`, `skillFrontmatterSchema`, and `SkillFrontmatter` are
part of the public surface (re-exported from `src/index.ts`). `splitFrontmatter` is internal — the
splitter `parseSkill` composes with.

## Splitting: `splitFrontmatter(raw) → { data, body }`

The splitter returns `{ data: unknown, body: string }`. `data` is deliberately typed `unknown`: this
step guarantees only that any frontmatter is **syntactically** valid YAML, never that it is an object
— shape validation is the schema's job.

The fence matcher:

```ts
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
```

Steps:

1. **Normalize the head** — `raw.replace(/^\uFEFF/, "").trimStart()` strips a single leading UTF-8
   BOM (`U+FEFF`), then trims leading whitespace (including a blank line before the opening fence).
   The regex runs against this `text`, not the original `raw`.
2. **Match the fence** — an opening `---` on its own line, a non-greedy YAML capture, a closing
   `---`, an optional trailing newline, then the remainder as body. The `\r?\n` in every position
   makes the fences **CRLF-tolerant**; capture group 1 is the YAML text, group 2 the body.
3. **No match** — two outcomes:
   - `text` starts with `---` (an opening fence with no valid closing fence) →
     `throw SkillError("invalid_skill", …)` — *"malformed YAML frontmatter (missing or misaligned
     closing '---' fence)"*.
   - otherwise there is **no frontmatter at all** → return `{ data: {}, body: raw }`. The body is the
     **original** `raw` (not the BOM-stripped / `trimStart`ed `text`), so a fence-less file is served
     verbatim.
4. **Parse the YAML** — `yamlText.trim().length === 0 ? {} : parseYaml(yamlText)`. Empty or
   whitespace-only frontmatter short-circuits to `{}`; a comment-only block parses to `null`, which
   the trailing `data ?? {}` folds back to `{}`. A YAML syntax error is caught and re-thrown as
   `invalid_skill` — *"invalid YAML frontmatter: `<detail>`"*.
5. **Return** `{ data: data ?? {}, body }`. Frontmatter that parses to a **scalar** (e.g. `42` or a
   bare string) is returned as-is and rejected later by the schema (see below).

## Parsing: `parseSkill(raw) → { frontmatter, body }`

`parseSkill` composes the split with schema validation:

1. `const { data, body } = splitFrontmatter(raw)`.
2. `skillFrontmatterSchema.safeParse(data)`.
3. On failure, take the **first** issue and throw:
   ```ts
   throw new SkillError("invalid_skill", issue.message, { at: issue.path.join(".") });
   ```
   `fields.at` is the dotted `zod` path of the offending key (`"name"`, `"description"`, …); it is the
   **empty string** when the failure is at the root — e.g. a scalar / `null` where an object was
   expected. `issue.message` is the schema's own message.
4. On success, return `{ frontmatter: parsed.data, body: body.trim() }`. The body is trimmed **here**
   (`splitFrontmatter` leaves it untrimmed); `frontmatter` is the validated object, which the registry
   later stores verbatim as `SkillInfo.metadata`.

Every parse failure — missing/misaligned fence, invalid YAML, non-object frontmatter, or a schema
violation — surfaces as a single `invalid_skill` `SkillError`. Discovery turns that into a
skip-with-warning by default, or a throw under `strict`.

## Normalizing tools: `normalizeTools(tools) → string[]`

The tool-list normalizer accepts the two YAML shapes the schema allows and flattens them identically:

```ts
import { normalizeTools } from "@clarvis/agent-skills";

normalizeTools(["read", " bash "]); // → ["read", "bash"]
normalizeTools("read, bash ,");     // → ["read", "bash"]
normalizeTools(undefined);          // → []
```

- `undefined` → a fresh `[]`.
- an **array** is used as-is; a **string** is `split(",")`.
- both then `map(trim)` and `filter(len > 0)`, so surrounding whitespace and blank/trailing entries
  drop out.

The result is always a new array. `normalizeTools` handles a single value; the
`allowed-tools`-wins-over-`tools` precedence (and the "absent when neither is declared" rule) lives in
the registry that builds `SkillInfo.allowedTools`, not here.

## The schema: `skillFrontmatterSchema`

A `zod` object with `.passthrough()`, so **unknown keys are preserved** on the validated result (and
thus on `SkillInfo.metadata`):

```ts
z.object({
  name: z
    .string()
    .trim()
    .min(1, "name is required")
    .regex(/^[A-Za-z0-9._-]+$/, "name must not contain path separators or whitespace"),
  description: z.string().trim().min(1, "description is required"),
  version: z.string().optional(),
  "allowed-tools": z.union([z.array(z.string()), z.string()]).optional(),
  "user-invocable": z.boolean().optional(),
  tools: z.union([z.array(z.string()), z.string()]).optional(),
  "argument-hint": z.string().optional(),
  license: z.string().optional(),
}).passthrough();
```

| Key | Rule |
|---|---|
| `name` | **required**; trimmed; non-empty; `/^[A-Za-z0-9._-]+$/` — no path separators or whitespace. This is the skill's identity and merge key. |
| `description` | **required**; trimmed; non-empty. |
| `version` | optional string. |
| `allowed-tools` | optional; a string array **or** a single (comma-separated) string. |
| `user-invocable` | optional boolean. |
| `tools` | optional; the same union as `allowed-tools`; the fallback source when `allowed-tools` is absent. |
| `argument-hint` | optional string, e.g. `"<required> [optional]"`. |
| `license` | optional string. |
| *any other key* | preserved verbatim by `.passthrough()`. |

Notes:

- `.trim()` is a **transform**, so `name` and `description` reach the caller already trimmed.
- The schema does **not** apply the `user-invocable` default. It stays optional here; the `true`
  default is applied downstream by the registry (`SkillInfo.userInvocable`), not the schema.
- The union types validate **shape only** — they do not normalize. `normalizeTools` flattens the two
  `allowed-tools` / `tools` shapes; nothing in the schema transforms them.
- `SkillFrontmatter = z.infer<typeof skillFrontmatterSchema>`; because of `.passthrough()` it carries
  an index signature for the preserved keys.

## Maintainer notes

- **All parse failures are `invalid_skill`.** `splitFrontmatter` throws it for a dangling opening
  fence and for a YAML syntax error; `parseSkill` throws it for any schema violation, attaching
  `fields.at`. Keep new failure modes on that one code so discovery's skip-with-warn / `strict`-throw
  behaviour stays uniform.
- **`data` is `unknown` on purpose.** Do not tighten `splitFrontmatter`'s return to an object — a
  scalar / `null` frontmatter must reach the schema so it fails with a clean `at: ""`, never a
  `TypeError`.
- **The body is trimmed once, in `parseSkill`.** `splitFrontmatter` returns it raw; don't add a second
  trim, and don't trim inside the regex.
- **Defaults live downstream.** The schema validates; `user-invocable`'s default and the
  `allowed-tools` / `tools` precedence belong to the registry. Add a new frontmatter field to
  `skillFrontmatterSchema` (optional unless truly required), then mirror it in
  [the skill format](/explanation/the-skill-format) and the README — `.passthrough()` means an
  un-schema'd key still survives on `metadata`, but only a schema'd key is validated and typed.
