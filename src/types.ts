import type { SkillFrontmatter } from "./schema.js";

export type SkillScope = "user" | "workspace";

export type SkillSource = string;

export interface SkillRoot {
  path: string;
  scope: SkillScope;
  source: SkillSource;
}

export interface SkillRootInput {
  path: string;
  scope?: SkillScope;
  source?: SkillSource;
}

export interface SkillResource {
  kind: "scripts" | "references" | "assets" | "examples" | "other";
  rel: string;
  path: string;
}

/**
 * A skill that was hidden because another skill with the same name won during
 * cross-root merging (last-root-wins). Carries just enough to identify where the
 * shadowed skill came from — consumers use this to report plugin collisions.
 */
export interface ShadowedSkill {
  source: SkillSource;
  scope: SkillScope;
  root: string;
  dir: string;
}

export interface SkillInfo {
  name: string;
  description: string;
  metadata: SkillFrontmatter;
  allowedTools?: string[];
  userInvocable: boolean;
  scope: SkillScope;
  source: SkillSource;
  root: string;
  dir: string;
  path: string;
  /**
   * Same-named skills from lower-precedence roots that this one shadowed during
   * the merge. Present only on a winner that actually shadowed something.
   */
  shadowed?: ShadowedSkill[];
}

export interface SkillContent extends SkillInfo {
  body: string;
  resources: SkillResource[];
}

export interface ResolvedSkill {
  info: SkillInfo;
  body: string;
}

export interface SkillRegistry {
  list(): SkillInfo[];
  get(name: string): SkillContent | undefined;
  resource(name: string, rel: string): string;
  readonly size: number;
}

export type { SkillFrontmatter } from "./schema.js";
