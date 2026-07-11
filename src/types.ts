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
