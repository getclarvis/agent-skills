# Internals: discovery scan (dirs · manifest · resources)

Source-level reference for the filesystem walk behind discovery — how a root is listed one level
deep, how the `SKILL.md` manifest is matched, and how a skill's resource tree is enumerated. The
user-facing model lives at [discovery and precedence](/guide/discovery-and-precedence) and
[resource confinement](/explanation/resource-confinement); this page covers the `src/scan.ts`
mechanics — the symlink handling, the loop guard, and the resource classification — those pages
leave out.

## Source files

| Path | Responsibility |
|---|---|
| [`src/scan.ts`](https://github.com/getclarvis/agent-skills/blob/main/src/scan.ts) | `listSkillDirs`, `findSkillFile`, `enumerateResources` / `walk`, and the `safe*` / `is*Entry` helpers. |
| [`src/registry.ts`](https://github.com/getclarvis/agent-skills/blob/main/src/registry.ts) | The only caller: `scanRoot` runs `listSkillDirs` per root; the registry's `get` runs `enumerateResources`. |
| [`src/lib/log.ts`](https://github.com/getclarvis/agent-skills/blob/main/src/lib/log.ts) | `warn` → the `WarnSink` every skip-with-warning routes through (`setWarnSink` redirects it). |

Nothing in `scan.ts` is a public export — these functions are package-internal, driven entirely by
`registry.ts`. The stable surface is `listSkills` / `loadSkill` / `resourcePath` on the
`AgentSkills` object; this is what runs underneath them.

## Listing a root: `listSkillDirs(root, followSymlinks)`

Discovery is **one level deep, not recursive**. `listSkillDirs` reads the immediate children of a
root, and for each child directory looks for a manifest:

```ts
for (const entry of safeReaddir(root)) {
  const dir = join(root, entry.name);
  if (!isDirEntry(entry, dir, followSymlinks)) continue;
  const file = findSkillFile(dir, followSymlinks);
  if (file !== undefined) out.push({ dir, file });
}
return out.sort((a, b) => a.dir.localeCompare(b.dir));
```

- A child is a candidate only if `isDirEntry` holds — a real directory, or (when `followSymlinks`) a
  symlink that resolves to one.
- The dir is kept only if `findSkillFile` locates a manifest; a directory with no `SKILL.md` is not a
  skill and is dropped.
- The result is sorted by `dir.localeCompare`. That deterministic order is load-bearing: the
  within-root "keep the first, warn on the rest" duplicate rule in `registry.ts` resolves against
  **sorted directory order**, so which of two same-named skills wins is reproducible.
- A missing or unreadable root yields `[]` — `safeReaddir` swallows the error, so an absent root is
  silently empty, never a throw. (Only `strict` malformed skills and in-root duplicates raise, and
  those raise upstream in `registry.ts`.)

## Matching the manifest: `findSkillFile(dir, followSymlinks)`

`SKILL_FILE` is the lowercase constant `"skill.md"`, and matching is **case-insensitive**:

```ts
if (entry.name.toLowerCase() !== SKILL_FILE) continue;
```

So `SKILL.md`, `skill.md`, and `Skill.md` are all accepted. The first matching entry that is a file
— a regular file, or (with `followSymlinks`) a symlinked file, per `isFileEntry` — wins and its
absolute path is returned; otherwise `undefined`, and `listSkillDirs` skips the directory. The
canonical spelling everywhere in the docs and examples is `SKILL.md`; the case-insensitive match is
a courtesy, not a second supported name.

## Enumerating resources: `enumerateResources(dir, followSymlinks)`

This is tier three of progressive disclosure — the registry's `get` calls it to fill
`SkillContent.resources`. It seeds a depth-first walk and returns the collected list sorted by `rel`:

```ts
walk(dir, dir, out, new Set<string>(), followSymlinks, safeRealpath(dir));
return out.sort((a, b) => a.rel.localeCompare(b.rel));
```

The sixth argument — `safeRealpath(dir)` — is `rootReal`, the canonical skill-dir boundary threaded
**unchanged** through every recursion. It is the same realpath-first boundary that
`resolveResourcePath` uses in [`src/paths.ts`](https://github.com/getclarvis/agent-skills/blob/main/src/paths.ts),
which is why enumeration and [resource confinement](/explanation/resource-confinement) agree on what
is inside the skill.

### `walk` — depth-first with a loop guard

Each entry into a directory records its real path first:

```ts
const real = safeRealpath(current);
if (visited.has(real)) return;
visited.add(real);
```

This is a **cycle** guard, not a budget. `visited` holds the realpath'd path of every directory
already entered, so a symlink that points back up the tree can't spin the walk forever. There is no
depth cap and no file-count cap — a deep but acyclic tree enumerates in full.

For each entry under `current`, in order:

1. **Escaping symlink** — if the entry is a symlink, `followSymlinks` is on, and
   `escapesRoot(rootReal, full)`, it is **skipped with a warning**
   (`skipping resource symlink escaping skill dir …`) and never enumerated. `escapesRoot` realpaths
   the target and rejects it unless it equals `rootReal` or sits under `rootReal + sep`. This pre-skip
   is what keeps enumeration in lockstep with `resourcePath`: a symlink the walk would otherwise
   surface but `resolveResourcePath` would later reject with `path_escape` is dropped up front, so the
   two never disagree.
2. **File** — `isFileEntry` (a regular file, or a symlinked file when following). The **top-level
   manifest is excluded**: `current === skillDir && entry.name.toLowerCase() === "skill.md"` is
   skipped, so `SKILL.md` never appears as a resource. The exclusion is scoped to the skill-dir root —
   a `skill.md` nested deeper (say `references/skill.md`) is a normal resource. Otherwise the file is
   pushed as `{ kind: classify(...), rel: toPosixRel(...), path: full }`.
3. **Directory** — `isDirEntry` (a real dir, or a symlinked dir when following) → recurse with the
   same `skillDir`, `rootReal`, and shared `visited`.

### Classifying and relativizing

`classify(skillDir, full)` reads the **top path segment** relative to the skill dir: `scripts`,
`references`, `assets`, and `examples` map to themselves, everything else to `other`. Classification
is always taken against the skill-dir root, so `scripts/build/run.sh` is `scripts` no matter how deep
it nests.

`toPosixRel(skillDir, full)` is `relative(skillDir, full)` with the OS separator rewritten to `/`, so
`SkillResource.rel` is POSIX-relative on every platform — the exact string a caller hands back to
`resourcePath(name, rel)`.

## The `safe*` and `is*Entry` helpers

Every filesystem touch in `scan.ts` goes through one of these so a single bad entry degrades to
"skip it" instead of aborting the scan:

- **`safeReaddir(dir)`** — `readdirSync(dir, { withFileTypes: true })`, returning `[]` on any error.
  This is why a missing root, an unreadable dir, or a permission failure is silently empty rather than
  fatal — discovery is best-effort per directory.
- **`safeRealpath(p)`** — `realpathSync.native(p)`, falling back to the **input path unchanged** when
  it can't resolve. It feeds both the loop-guard key and the `escapesRoot` / `rootReal` boundary.
- **`isFileEntry(entry, full, followSymlinks)`** — true for a regular file; for a symlink, true only
  when `followSymlinks` and `safeStatIsFile(full)`.
- **`isDirEntry(entry, full, followSymlinks)`** — true for a directory; for a symlink, only when
  `followSymlinks` and `safeStatIsDir(full)`.
- **`safeStatIsFile` / `safeStatIsDir`** — `statSync(full).isFile()` / `.isDirectory()`; on error they
  **warn** `skipping dangling symlink …` and return `false`. A symlink whose target no longer exists is
  therefore dropped from the walk with a warning instead of crashing it.

Two of the library's non-fatal warnings originate here — the **dangling symlink** (via `safeStat*`)
and the **escaping resource symlink** (via `walk`); both go through `warn` in `src/lib/log.ts`, i.e.
the `WarnSink` a host can redirect with `setWarnSink`. (The other warnings — malformed skill, in-root
duplicate, name/dir mismatch — are raised in `registry.ts` / `parse.ts`, not here.)

## Maintainer notes

- **`followSymlinks` gates all three link kinds uniformly.** `isDirEntry`, `isFileEntry`, and the
  `escapesRoot` skip consult the same flag, so a symlinked skill **directory**, a symlinked `SKILL.md`
  **manifest**, and a symlinked **resource** are all followed or all ignored together. Don't split it.
- **The loop guard is a cycle guard, not a cap.** Keep it keyed on the realpath (`visited.add(real)`);
  never swap it for a depth or file-count limit — that would silently truncate a large but valid skill.
- **Enumeration must agree with `resolveResourcePath`.** The `escapesRoot` pre-skip exists so the walk
  never surfaces a resource that `resourcePath` would later reject with `path_escape`. Change one
  boundary check and you must change the other (see [resource confinement](/explanation/resource-confinement)).
- **Only the top-level `SKILL.md` is excluded.** The exclusion is scoped to `current === skillDir`; a
  nested `skill.md` is intentionally a resource. Preserve that scoping.
- **Sorted order is contract.** `listSkillDirs` sorts by `dir` and `enumerateResources` sorts by
  `rel`; the within-root "first wins" duplicate rule and stable resource listings both rely on it.
- **The `safe*` helpers swallow, they don't throw.** A per-directory read or stat failure means "skip
  this entry" — the rest of the scan (other roots, other skills) continues. Fatal conditions belong
  upstream in `registry.ts`, never in the walk.
