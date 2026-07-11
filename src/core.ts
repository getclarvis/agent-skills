import { buildRegistry } from "./registry.js";
import type { SkillConfig } from "./config.js";
import type { SkillRegistry } from "./types.js";

export function discoverSkills(config: SkillConfig): SkillRegistry {
  return buildRegistry(config);
}
