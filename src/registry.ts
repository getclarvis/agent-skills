import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { SkillError, fsError } from "./errors.js";
import { warn } from "./lib/log.js";
import { normalizeTools, parseSkill } from "./parse.js";
import { resolveResourcePath } from "./paths.js";
import { enumerateResources, listSkillDirs } from "./scan.js";
import type { SkillConfig } from "./config.js";
import type {
  ResolvedSkill,
  ShadowedSkill,
  SkillContent,
  SkillInfo,
  SkillRegistry,
  SkillRoot,
} from "./types.js";

export function buildRegistry(config: SkillConfig): SkillRegistry {
  const groups = config.roots.map((root) => scanRoot(root, config));
  const byName = new Map<string, ResolvedSkill>(
    mergeSkills(groups).map((skill) => [skill.info.name, skill]),
  );
  return makeRegistry(byName, config);
}

export function mergeSkills(groups: ResolvedSkill[][]): ResolvedSkill[] {
  const byName = new Map<string, ResolvedSkill>();
  for (const group of groups) {
    for (const skill of group) {
      const existing = byName.get(skill.info.name);
      if (existing === undefined) {
        byName.set(skill.info.name, skill);
        continue;
      }
      // Later roots win (last-wins precedence). The previous winner — and anything
      // it had already shadowed — is now shadowed by this skill.
      const shadowed: ShadowedSkill[] = [
        ...(skill.info.shadowed ?? []),
        toShadowed(existing.info),
        ...(existing.info.shadowed ?? []),
      ];
      byName.set(skill.info.name, { ...skill, info: { ...skill.info, shadowed } });
    }
  }
  return [...byName.values()];
}

function toShadowed(info: SkillInfo): ShadowedSkill {
  return {
    source: info.source,
    scope: info.scope,
    root: info.root,
    dir: info.dir,
  };
}

function scanRoot(root: SkillRoot, config: SkillConfig): ResolvedSkill[] {
  const byName = new Map<string, ResolvedSkill>();
  for (const { dir, file } of listSkillDirs(root.path, config.followSymlinks)) {
    let resolved: ResolvedSkill;
    try {
      resolved = buildResolvedSkill(root, dir, file);
    } catch (err) {
      if (config.strict) throw err;
      warn(
        `clarvis-agent-skills: skipping ${file}: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      continue;
    }
    const existing = byName.get(resolved.info.name);
    if (existing !== undefined) {
      if (config.strict) {
        throw new SkillError(
          "duplicate_skill",
          `Duplicate skill name '${resolved.info.name}' in ${existing.info.dir} and ${dir}.`,
          { name: resolved.info.name, paths: [existing.info.dir, dir] },
        );
      }
      warn(
        `clarvis-agent-skills: duplicate skill '${resolved.info.name}' in ${dir} ignored ` +
          `(already defined in ${existing.info.dir})\n`,
      );
      continue;
    }
    byName.set(resolved.info.name, resolved);
  }
  return [...byName.values()];
}

function buildResolvedSkill(root: SkillRoot, dir: string, file: string): ResolvedSkill {
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch (err) {
    throw fsError(err as NodeJS.ErrnoException, file);
  }
  const { frontmatter, body } = parseSkill(raw);

  const dirName = path.basename(dir);
  if (frontmatter.name !== dirName) {
    warn(
      `clarvis-agent-skills: skill name '${frontmatter.name}' does not match directory ` +
        `'${dirName}' (${file})\n`,
    );
  }

  const rawTools = frontmatter["allowed-tools"] ?? frontmatter.tools;
  const info: SkillInfo = {
    name: frontmatter.name,
    description: frontmatter.description,
    metadata: frontmatter,
    ...(rawTools === undefined ? {} : { allowedTools: normalizeTools(rawTools) }),
    userInvocable: frontmatter["user-invocable"] ?? true,
    scope: root.scope,
    source: root.source,
    root: root.path,
    dir,
    path: file,
  };
  return { info, body };
}

function makeRegistry(byName: Map<string, ResolvedSkill>, config: SkillConfig): SkillRegistry {
  return {
    list(): SkillInfo[] {
      return [...byName.values()].map((s) => s.info).sort((a, b) => a.name.localeCompare(b.name));
    },
    get(name: string): SkillContent | undefined {
      const skill = byName.get(name);
      if (skill === undefined) return undefined;
      return {
        ...skill.info,
        body: skill.body,
        resources: enumerateResources(skill.info.dir, config.followSymlinks),
      };
    },
    resource(name: string, rel: string): string {
      const skill = byName.get(name);
      if (skill === undefined) {
        throw new SkillError("not_found", `No such skill: ${name}`, { name });
      }
      const abs = resolveResourcePath(skill.info.dir, rel);
      let stat;
      try {
        stat = statSync(abs);
      } catch {
        throw new SkillError("not_found", `No such resource '${rel}' in skill '${name}'`, {
          name,
          rel,
        });
      }
      if (!stat.isFile()) {
        throw new SkillError("not_a_file", `Resource '${rel}' in skill '${name}' is not a file`, {
          name,
          rel,
        });
      }
      return abs;
    },
    get size(): number {
      return byName.size;
    },
  };
}
