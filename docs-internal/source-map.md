# Source map

> Where each user-facing behavior is implemented, and the per-subsystem internals pages. Use this to
> jump from a documented behavior to the code behind it.

## Per-subsystem internals

Each page below catalogs the `src/` files, internal functions, and constants behind one area (the
detail that was stripped from `SPEC.md` and the published reference):

| Subsystem | Internals page | User-facing counterpart |
|---|---|---|
| Discovery & root scan · resource enumeration | [internals/discovery-and-scan.md](./internals/discovery-and-scan.md) | [/guide/discovery-and-precedence](https://agent-skills.clarvis.dev/guide/discovery-and-precedence), [/explanation/how-it-works](https://agent-skills.clarvis.dev/explanation/how-it-works) |
| Frontmatter parsing, schema & tool normalization | [internals/parsing-and-schema.md](./internals/parsing-and-schema.md) | [/explanation/the-skill-format](https://agent-skills.clarvis.dev/explanation/the-skill-format) |
| Path resolution & resource confinement | [internals/paths-and-confinement.md](./internals/paths-and-confinement.md) | [/explanation/resource-confinement](https://agent-skills.clarvis.dev/explanation/resource-confinement) |
| Registry, merge & precedence fold | [internals/registry-and-merge.md](./internals/registry-and-merge.md) | [/guide/discovery-and-precedence](https://agent-skills.clarvis.dev/guide/discovery-and-precedence), [/guide/progressive-disclosure](https://agent-skills.clarvis.dev/guide/progressive-disclosure) |
| Catalog rendering | [internals/catalog.md](./internals/catalog.md) | [/reference/catalog](https://agent-skills.clarvis.dev/reference/catalog) |
| Error contract, config & warn sink | [internals/errors-and-config.md](./internals/errors-and-config.md) | [/reference/error-codes](https://agent-skills.clarvis.dev/reference/error-codes), [/reference/configuration](https://agent-skills.clarvis.dev/reference/configuration) |

## Key entry points

| Area | Source |
|---|---|
| Public API surface | `src/index.ts` |
| Config resolution / root normalization (`resolveConfig`, `normalizeRoot`) | `src/config.ts` |
| Clarvis root preset (`clarvisSkillRoots`) | `src/preset.ts` |
| Path resolution & resource confinement | `src/paths.ts` |
| Root scan & resource enumeration | `src/scan.ts` |
| Frontmatter split | `src/parse.ts` |
| Frontmatter schema (zod) | `src/schema.ts` |
| Registry, merge & precedence | `src/registry.ts` |
| Discovery wrapper (`discoverSkills`) | `src/core.ts` |
| Error contract & `fsError` | `src/errors.ts` |
| Warn sink (`setWarnSink`) | `src/lib/log.ts` |
| Catalog rendering (`renderSkillCatalog`) | `src/catalog/index.ts` |
| Shared types | `src/types.ts` |

See [architecture.md](./architecture.md) for how these fit together.
