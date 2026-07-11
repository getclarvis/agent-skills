<!-- Thanks for contributing to @clarvis/agent-skills! -->

## Summary

<!-- What does this PR change, and why? -->

## Checklist

- [ ] `npm run pre-commit` is green (typecheck + format:check + test:coverage at the 95% gate).
- [ ] Tests added/updated for the behavior change (`tests/contract/` for a module's input/output/error
      contract, `tests/integration/` for cross-cutting behavior — discovery precedence, the public
      API, malformed-skill handling, symlinked stores).
- [ ] If a **contract** changed (discovery, precedence, the frontmatter schema, an error code, or the
      public API), `SPEC.md`, the matching page under `docs/reference/`, and the module's contract test
      were updated together.
- [ ] A `CHANGELOG.md` entry was added; any **BREAKING** change to the API or a contract is called out.
- [ ] Docs updated if an option or observable behavior changed (`docs/`, and the matching
      `docs-internal/internals/` page).
- [ ] Security-sensitive paths (resource-path confinement, symlink following, workspace/home
      resolution) were reviewed — see `SECURITY.md`.

## Notes for reviewers

<!-- Anything reviewers should pay special attention to. -->
