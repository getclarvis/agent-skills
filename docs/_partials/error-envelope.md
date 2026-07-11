Every coded failure is a `SkillError`, carrying a `.code` (one of the stable
[error codes](/reference/error-codes)), a human-readable `.message`, and a `.fields` record of
structured extras. A consumer that catches one can read those directly, or fold them into a single
JSON object of its own:

```json
{ "error": "<code>", "message": "<human-readable description>", "...": "extra fields" }
```

e.g. `JSON.stringify({ error: err.code, message: err.message, ...err.fields })`. Some codes add
structured fields to `.fields` (a `path`, a `name`, a `rel`, or `at` for the failing frontmatter
key). Match on the `.code`, never on `message` text.
