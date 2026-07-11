# Error codes

> Every coded failure is a `SkillError` with a stable `.code`. This page lists the codes and
> what raises each. Match on `.code`, never on `.message`.

## The envelope

<!-- @include: @/_partials/error-envelope.md -->

`SkillError` is thrown, not returned — `createAgentSkills` (via `resourcePath`) and the
`discoverSkills` registry raise it directly. Read `err.code`, `err.message`, and `err.fields` at your
boundary — build a JSON envelope from them yourself if you want one — and use
[`setWarnSink`](/reference/api#errors-warnings) to capture the separate stream of non-fatal warnings
(malformed skill skipped, in-root duplicate, dangling symlink, name/dir mismatch). Discovery itself
never throws for a bad skill unless [`strict`](/reference/configuration) is on — it warns and skips.

## Codes

| Code              | Meaning                                                            | Raised by (examples)                                                                                                             |
| ----------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `invalid_skill`   | Malformed frontmatter or body.                                    | `parseSkill`; discovery (`discoverSkills`) — a missing/misaligned closing `---` fence, invalid YAML, a schema failure, or frontmatter that parses to a non-object scalar. Warned-and-skipped when lenient; thrown when `strict`. |
| `duplicate_skill` | Two skills declaring the same `name` within one root.             | `discoverSkills` when `strict` is on. Lenient keeps the first by sorted directory order and warns. A cross-root override — a later root in `roots` declaring the same `name` — is normal precedence (last wins), never this error. |
| `not_found`       | Unknown skill name, or a missing resource file.                   | `resourcePath` (unknown skill name; the resource does not exist); `fsError` on `ENOENT`. Note `loadSkill` returns `undefined` for an unknown name — it does **not** throw. |
| `not_a_file`      | A path was a directory where a file was expected.                 | `resourcePath` when `rel` resolves to a directory; `fsError` on `EISDIR`/`ENOTDIR`.                                             |
| `path_escape`     | A relative resource path resolves outside the skill directory.    | `resourcePath` and `resolveResourcePath` — via `../` traversal or a symlink pointing outside the (realpath-canonicalized) skill dir. An absolute `rel` is `invalid_input`, not this. |
| `invalid_input`   | A bad argument to a public function.                              | `resourcePath` and `resolveResourcePath` — an empty or absolute `rel`.                                                         |
| `io_error`        | An underlying filesystem failure while reading a skill.           | Discovery/read paths; `fsError` fallback for any other Node `ErrnoException`.                                                   |

Some codes attach structured `fields` alongside the message — a `path`, a `name`, a `rel`, `paths`
(the two conflicting directories for `duplicate_skill`), or `at` (the failing frontmatter key for a
schema failure). Read them off `err.fields`.

## Handling them

- **Strict vs lenient.** With `strict: false` (the default) a malformed skill or an in-root duplicate
  is a **warning**, not a throw: discovery drops the offending directory and keeps going, so
  `listSkills()` returns the healthy skills. Set [`strict: true`](/reference/configuration) to turn
  `invalid_skill` and `duplicate_skill` into thrown errors instead — useful in CI. A cross-root
  override (a later root in `roots` shadowing an earlier one of the same `name`) is never a duplicate
  and never throws, even under `strict`.
- **`resourcePath` has four failure modes.** It throws `invalid_input` when `rel` is empty or
  absolute, `path_escape` when a relative target escapes the skill directory, `not_found` when the
  skill name is unknown or the resource file is missing, and `not_a_file` when `rel` resolves to a
  directory. See [Resource confinement](/explanation/resource-confinement) for exactly how the
  boundary is enforced.
- **`invalid_input` from `resolveResourcePath`.** The lower-level `resolveResourcePath(skillDir, rel)`
  validates its argument up front: an empty `rel` or an absolute `rel` is `invalid_input`. Unlike
  `resourcePath`, it performs neither an existence nor an is-file check — so it never raises
  `not_found` or `not_a_file`, only `invalid_input` or `path_escape`.

## See also

- [API reference → Errors & warnings](/reference/api#errors-warnings) — `SkillError`, `fsError`, `setWarnSink`
- [Resource confinement](/explanation/resource-confinement) — how `path_escape` / `not_found` / `not_a_file` are enforced
