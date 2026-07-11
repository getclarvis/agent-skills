# The SKILL.md format

> A skill is a directory with a `SKILL.md` manifest and, optionally, some bundled files. The manifest
> is a YAML frontmatter fence followed by a markdown body. This page is the anatomy of that file —
> what the frontmatter may declare, how identity and tool lists are resolved, and what makes a manifest
> valid. The guiding principle is *the frontmatter is validated, the body and metadata are served as
> authored*.

## Anatomy of a skill

A skill lives in its own directory, one level under a [root](/guide/discovery-and-precedence):

```
<root>/
└── pdf/
    ├── SKILL.md          # the manifest: frontmatter + body
    ├── scripts/          # optional bundled resources
    │   └── extract.py
    ├── references/
    │   └── pdf-spec.md
    └── assets/
        └── template.pdf
```

Discovery is **one level deep** — `<root>/<name>/SKILL.md`, never recursive — so a skill is exactly
one directory with a manifest at its top. The manifest filename is matched **case-insensitively**
(`SKILL.md`, `skill.md`, `Skill.md` all count); write it as `SKILL.md`. Everything else in the
directory is a [resource](/guide/progressive-disclosure) served on demand.

## The frontmatter fence

The manifest opens with a YAML block delimited by `---` fences, then a markdown body:

```md
---
name: pdf
description: Extract text and tables from PDF files.
---

# PDF toolkit

The markdown body starts here.
```

A few tolerances make the fence robust to how files are authored on different machines:

- A leading **UTF-8 BOM** and any leading whitespace are stripped before parsing, and **CRLF** line
  endings are accepted — a file exported with a BOM or authored on Windows parses the same as a clean
  LF file.
- The closing `---` must sit on its own line; a missing or misaligned closing fence is an
  `invalid_skill` error.
- An **empty or comment-only** frontmatter parses to an empty object — which then fails the schema's
  required `name` and `description`, so it too surfaces as `invalid_skill`.
- Frontmatter that parses to a **non-object scalar** (a bare number, string, or list) is rejected with
  `invalid_skill`.

Because `name` and `description` are required, a `SKILL.md` with no frontmatter at all is invalid: the
whole file is treated as the body and the empty frontmatter fails the schema.

## The frontmatter schema

The frontmatter is validated by a zod schema with **passthrough** — declared keys are typed and
checked; any unknown key is preserved verbatim on the skill's `metadata`.

| Key | Type | Required | Notes |
| --- | --- | --- | --- |
| `name` | string | **yes** | Matches `^[A-Za-z0-9._-]+$` — no path separators or whitespace. This is the skill's identity and the merge key. |
| `description` | string | **yes** | Non-empty (trimmed). The one-line summary shown in the catalog. |
| `version` | string | no | Free-form version label. |
| `allowed-tools` | `string[]` or comma-separated string | no | Tools the skill may use. Normalized to `SkillInfo.allowedTools`. |
| `tools` | `string[]` or comma-separated string | no | Alias for `allowed-tools`; `allowed-tools` wins when both are present. |
| `user-invocable` | boolean | no | Defaults to `true`; surfaces as `SkillInfo.userInvocable`. |
| `argument-hint` | string | no | A usage hint such as `<file> [--pages 1-3]`; preserved verbatim on `metadata` for the consumer to use as it sees fit. |
| `license` | string | no | Free-form licence label. |
| *(any other key)* | any | no | Preserved as-is on `metadata`. |

`SkillInfo.metadata` is the **raw validated frontmatter** — the object as authored, including all
passthrough keys. The only *derived* field is `allowedTools` (the normalized tools list); `metadata`
itself is never reshaped. Note the schema does `.trim()` `name` and `description`, so those two land
on `metadata` as their trimmed (validated) values; every other key is preserved byte-for-byte. See
[Configuration](/reference/configuration) for the full schema surface.

## Naming and identity

A skill's identity is its frontmatter `name`, **not** its directory name. The `name` regex forbids
path separators and whitespace so a name is always a safe, flat key.

When the frontmatter `name` differs from the directory name, the **frontmatter name wins** and a
**non-fatal warning** fires — the skill still loads under its declared name. Keeping the directory and
the `name` identical is the convention; the warning exists to catch the accidental mismatch, not to
reject it.

The `name` is also the merge key across the configured roots: a later (higher-precedence) root
overriding a same-named skill is normal precedence, while two same-named skills **within one root**
collide — the first by sorted directory order wins with a warning, or throws `duplicate_skill` under
`strict`. See [Discovery & precedence](/guide/discovery-and-precedence) for the full ordering.

## Declaring tools

`allowed-tools` (or its alias `tools`) may be written as either a YAML flow array or a
comma-separated string — the two shapes normalize **identically**: each entry is trimmed and blank
entries are dropped.

```yaml
allowed-tools:
  - bash
  - read_file
```

```yaml
allowed-tools: bash, read_file
```

Both yield `SkillInfo.allowedTools === ["bash", "read_file"]`. When both `allowed-tools` and `tools`
are present, `allowed-tools` wins. When neither is declared, `allowedTools` is **absent** from
`SkillInfo` — it is never an empty array standing in for "no declaration". The raw keys stay on
`metadata` untouched; normalization only lands on `allowedTools`.

## The body

Everything after the closing fence is the markdown **body** — the instructions an agent reads when it
opens the skill. The body is served **trimmed** (leading and trailing whitespace removed) but is
otherwise passed through verbatim; `agent-skills` never interprets or executes it. The body is Tier 2
of [progressive disclosure](/guide/progressive-disclosure): it is loaded only when a skill is opened,
not when the catalog is listed.

## Resources

Any file in the skill directory other than the manifest is a **resource**. Resources are grouped by
their top-level directory into five kinds:

| Directory | `kind` |
| --- | --- |
| `scripts/` | `scripts` |
| `references/` | `references` |
| `assets/` | `assets` |
| `examples/` | `examples` |
| *(anything else)* | `other` |

Resources are enumerated only when a skill is loaded, and each is reachable through `resourcePath`,
which confines the returned path to the skill directory. See
[Progressive disclosure](/guide/progressive-disclosure) for how resources are served.

## A complete example

```md
---
name: pdf
description: Extract text and tables from PDF files, and fill PDF forms.
version: 1.2.0
allowed-tools:
  - bash
  - read_file
argument-hint: <file> [--pages 1-3]
license: MIT
maintainer: platform-team
---

# PDF toolkit

Use this skill when the user asks to read, extract from, or fill a PDF.

## Extract text

Run `scripts/extract.py <file>` to dump the document's text layer to stdout.
Pass `--pages 1-3` to limit the range.

## Fill a form

See `references/form-fields.md` for the field-name conventions, then run
`scripts/fill.py <file> <values.json>`.
```

Here `maintainer` is an unknown key: it is not part of the schema, so it is preserved on
`metadata.maintainer` and ignored by everything else. `allowed-tools` normalizes to
`["bash", "read_file"]`, `user-invocable` defaults to `true`, and the two `scripts/` files plus the
`references/` file become resources of kind `scripts` and `references`.

## See also

- [Discovery & precedence](/guide/discovery-and-precedence) — the configured roots and the merge rules
- [Progressive disclosure](/guide/progressive-disclosure) — how catalog, body, and resources are served
- [Configuration](/reference/configuration) — the frontmatter schema and options in full
