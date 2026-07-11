# Releasing

> The pre-publish checklist for shipping `@clarvis/agent-skills` to GitHub and npm.

This is the maintainer runbook. The first public release is **0.1.0**; the public npm registry has no
prior release of this package. `@clarvis/agent-skills` is an **importable library** (no `bin`, no
shebang) — publishing targets the public registry (npmjs.com) via GitHub Actions, see
[Publish](#6-publish). Authentication is **npm trusted publishing (OIDC)** — there is no `NPM_TOKEN`;
publishing happens only in CI.

## 1. GitHub repository (one-time)

- [ ] `getclarvis/agent-skills` exists on GitHub and is **public** (all package metadata and doc links
      point there). The git remote resolves to it: `git remote -v` shows
      `https://github.com/getclarvis/agent-skills.git`.
- [ ] The **release branch is `main`** — `docs.yml` deploys the site only from `main`, so the current
      pre-release `develop` work must land on `main` before the first tag.
- [ ] Enable **private vulnerability reporting** (Settings → Security) so the SECURITY.md advisory
      link resolves.
- [ ] Confirm the security/conduct contacts are monitored: **security@clarvis.dev** (SECURITY.md) and
      **conduct@clarvis.dev** (CODE_OF_CONDUCT.md).
- [ ] Enable **GitHub Pages** (Settings → Pages → Source: GitHub Actions) so `docs.yml` can deploy the
      site to `agent-skills.clarvis.dev`.
- [ ] Configure the **npm trusted publisher** on the package's npm settings: org `getclarvis`, repo
      `agent-skills`, workflow `release.yml`, environment `npm-publish`. This is what lets the workflow
      publish over OIDC with provenance — **no `NPM_TOKEN` secret is used**.
- [ ] Create an **`npm-publish`** GitHub Environment with **required reviewers**. The release workflow
      (`.github/workflows/release.yml`) runs its `publish` job in that environment, so the protection
      rule becomes a **manual approval gate** before any publish.
- [ ] Ensure a **signing key** is configured for release tags (`git config user.signingkey` +
      `gpg.format`, registered on the GitHub account as a signing key) so the tag shows **Verified** —
      the family signs release tags (see [Publish](#6-publish)).

## 2. Quality gates

```bash
npm ci
npm run pre-commit       # typecheck + format:check + test:coverage
npm run lint
npm run build            # tsc -> dist/ with .d.ts
npm run docs:build       # VitePress build must succeed (broken links fail here)
```

- [ ] All green. `docs:build` is part of the gate because a broken internal link in `docs/` fails the
      build and would break the Pages deploy in `docs.yml`.

## 3. Version & changelog

- [ ] `package.json` version is the intended release (first public: **0.1.0**).
- [ ] In `CHANGELOG.md`, move the entries under `## [Unreleased]` down into a dated release heading —
      `## [x.y.z] - YYYY-MM-DD` — leaving a fresh empty `## [Unreleased]` above it. For **0.1.0** this
      is already done: `## [0.1.0] - 2026-07-10`.
- [ ] The tag you push in step 6 must match `package.json` exactly — the workflow rejects a mismatch.

## 4. Inspect the package tarball

```bash
npm pack --dry-run
```

- [ ] The tarball includes `dist/`, `README.md`, `SPEC.md`, `CHANGELOG.md`, `CONTRIBUTING.md`,
      `CODE_OF_CONDUCT.md`, `SECURITY.md`, and `LICENSE` — and nothing it shouldn't (no `src/`,
      `tests/`, `docs/`, `docs-internal/`, `.github/`). The whitelist is the `files` array in
      `package.json`; `docs/` and `docs-internal/` are deliberately outside it (the site ships to
      Pages, not npm).

## 5. Smoke-test the import

```bash
npm pack
mkdir -p /tmp/as-smoke/.clarvis/skills/hello && cd /tmp/as-smoke && npm init -y >/dev/null
npm i /path/to/clarvis-agent-skills-0.1.0.tgz
printf -- '---\nname: hello\ndescription: A smoke-test skill.\n---\nDo the thing.\n' \
  > .clarvis/skills/hello/SKILL.md
node --input-type=module -e "
  import { createAgentSkills, clarvisSkillRoots } from '@clarvis/agent-skills';
  import { renderSkillCatalog } from '@clarvis/agent-skills/catalog';
  const skills = createAgentSkills({ roots: clarvisSkillRoots({ workspace: process.cwd() }) });
  const list = skills.listSkills();
  console.log(list.map(s => s.name).join(', '));   // hello
  console.log(renderSkillCatalog(list));           // # Available skills ...
  console.log(skills.loadSkill('hello')?.body);    // Do the thing.
"
```

- [ ] Both entry points resolve (`.` and `./catalog`), the façade discovers the seeded skill,
      `listSkills()` returns it, `renderSkillCatalog` prints the catalog, and `loadSkill` returns the
      trimmed body.

## 6. Publish

Publishing is done by the **release workflow** — there is no laptop publish path, because trusted
publishing (OIDC provenance) is only available inside GitHub Actions. **Sign the tag** so it shows
Verified:

```bash
git tag -s v0.1.0 -m "agent-skills 0.1.0"
git push origin v0.1.0     # triggers .github/workflows/release.yml
```

The workflow (`.github/workflows/release.yml`) then:

1. Pins **npm 11.6.2** (trusted publishing needs npm ≥ 11.5.1; npm@latest/12 currently breaks
   provenance) and installs with `npm ci --ignore-scripts`.
2. **Verifies the version is releasable** — when triggered by a tag, the tag minus its leading `v`
   must equal the `package.json` version, and the version must be strictly greater than the current
   npm `latest` (it refuses to move `latest` backward or republish the same version). For the first
   release the published `latest` resolves to `0.0.0`, so `0.1.0` passes.
3. Runs **`npm publish --provenance --access public`**, which fires `prepublishOnly` first (asserts
   `README.md` and `SPEC.md` exist, then `build` + `test`). Auth is the OIDC token — no `NPM_TOKEN`.
4. Creates the **GitHub Release** for the tag (pointing at `CHANGELOG.md`).

The `publish` job runs in the **`npm-publish`** environment, so if you configured required reviewers
(step 1) the run **pauses for manual approval** before it publishes. `workflow_dispatch` can trigger
the same job without a tag (it skips the tag/version match and the Release-creation step).

## 7. Post-publish

- [ ] `npm view @clarvis/agent-skills version --registry=https://registry.npmjs.org` shows the release.
- [ ] The GitHub Release exists and links the CHANGELOG.
- [ ] Install from public npm in a clean dir and re-run the smoke test.
- [ ] The docs site deployed (Actions → `Docs` workflow green;
      [agent-skills.clarvis.dev](https://agent-skills.clarvis.dev) serves the new build).
- [ ] **Unblock the engine.** `@clarvis/agent-loop` currently depends on this package through a
      `file:../agent-skills` link (it cannot be published while a `file:` dep is unresolved for
      consumers). This first npm publish is the unblock: flip that dependency to a registry range
      (`"@clarvis/agent-skills": "^0.1.0"`) and rebuild agent-loop.

## See also

- [CONTRIBUTING.md](https://github.com/getclarvis/agent-skills/blob/main/CONTRIBUTING.md)
- [SECURITY.md](https://github.com/getclarvis/agent-skills/blob/main/SECURITY.md)
- [CHANGELOG.md](https://github.com/getclarvis/agent-skills/blob/main/CHANGELOG.md)
