import { resolveConfig } from "./config.js";
import { discoverSkills } from "./core.js";
import type { AgentSkillsOptions, SkillConfig } from "./config.js";
import type { SkillContent, SkillInfo, SkillRegistry } from "./types.js";

export interface AgentSkills {
  readonly config: SkillConfig;

  listSkills(): SkillInfo[];

  loadSkill(name: string): SkillContent | undefined;

  resourcePath(name: string, rel: string): string;

  refresh(): void;
}

export function createAgentSkills(options: AgentSkillsOptions): AgentSkills {
  const config = resolveConfig(options);
  let registry: SkillRegistry = discoverSkills(config);
  return {
    config,
    listSkills: () => registry.list(),
    loadSkill: (name) => registry.get(name),
    resourcePath: (name, rel) => registry.resource(name, rel),
    refresh: () => {
      registry = discoverSkills(config);
    },
  };
}

export { discoverSkills } from "./core.js";
export { parseSkill, normalizeTools } from "./parse.js";
export type { ParsedSkill } from "./parse.js";
export { mergeSkills } from "./registry.js";

export { resolveResourcePath, resolveWorkspaceDir, resolveAgainst, expandHome } from "./paths.js";

export { clarvisSkillRoots } from "./preset.js";
export type { ClarvisSkillRootsOptions } from "./preset.js";

export { resolveConfig, StartupError, DEFAULT_STRICT, DEFAULT_FOLLOW_SYMLINKS } from "./config.js";
export type { SkillConfig, AgentSkillsOptions } from "./config.js";

export { skillFrontmatterSchema } from "./schema.js";

export { SkillError, fsError } from "./errors.js";
export type { ErrorCode } from "./errors.js";

export { setWarnSink } from "./lib/log.js";
export type { WarnSink } from "./lib/log.js";

export type {
  SkillInfo,
  SkillContent,
  SkillResource,
  SkillScope,
  SkillSource,
  SkillRoot,
  SkillRootInput,
  SkillRegistry,
  ResolvedSkill,
  SkillFrontmatter,
} from "./types.js";
