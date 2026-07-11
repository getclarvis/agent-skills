import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { stringify as stringifyYaml } from "yaml";
import { setWarnSink } from "../../src/lib/log.js";
import { clarvisSkillRoots } from "../../src/preset.js";
import type { SkillFrontmatter, SkillInfo, SkillRootInput } from "../../src/types.js";

export function makeHome(): string {
  return mkdtempSync(path.join(tmpdir(), "clarvis-skills-home-"));
}

export function makeWorkspace(): string {
  return mkdtempSync(path.join(tmpdir(), "clarvis-skills-ws-"));
}

export function cleanup(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

export function skillsRoot(base: string, source: "agents" | "clarvis"): string {
  return path.join(base, source === "agents" ? ".agents" : ".clarvis", "skills");
}

export function clarvisRoots(home: string, ws: string): SkillRootInput[] {
  return clarvisSkillRoots({ home, workspace: ws });
}

export interface WriteSkillOptions {
  frontmatter?: Record<string, unknown>;
  body?: string;
  raw?: string;
  resources?: Record<string, string>;
  dirName?: string;
}

export function writeSkill(root: string, name: string, opts: WriteSkillOptions = {}): string {
  const dir = path.join(root, opts.dirName ?? name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "SKILL.md"), opts.raw ?? buildSkillMd(name, opts));
  for (const [rel, body] of Object.entries(opts.resources ?? {})) {
    const p = path.join(dir, rel);
    mkdirSync(path.dirname(p), { recursive: true });
    writeFileSync(p, body);
  }
  return dir;
}

function buildSkillMd(name: string, opts: WriteSkillOptions): string {
  const frontmatter = { name, description: `The ${name} skill`, ...(opts.frontmatter ?? {}) };
  return `---\n${stringifyYaml(frontmatter)}---\n\n${opts.body ?? `Body of ${name}.`}\n`;
}

export function link(target: string, linkPath: string): void {
  mkdirSync(path.dirname(linkPath), { recursive: true });
  symlinkSync(target, linkPath);
}

export interface CapturedWarnings {
  warnings: string[];
  restore(): void;
}

export function captureWarnings(): CapturedWarnings {
  const warnings: string[] = [];
  setWarnSink((message) => warnings.push(message));
  return {
    warnings,
    restore: () => setWarnSink(null),
  };
}

export function makeInfo(overrides: Partial<SkillInfo> = {}): SkillInfo {
  const name = overrides.name ?? "demo";
  const description = overrides.description ?? `The ${name} skill`;
  const metadata = (overrides.metadata ?? { name, description }) as SkillFrontmatter;
  return {
    name,
    description,
    metadata,
    userInvocable: overrides.userInvocable ?? true,
    scope: overrides.scope ?? "user",
    source: overrides.source ?? "clarvis",
    root: overrides.root ?? "/roots/skills",
    dir: overrides.dir ?? `/roots/skills/${name}`,
    path: overrides.path ?? `/roots/skills/${name}/SKILL.md`,
    ...(overrides.allowedTools !== undefined ? { allowedTools: overrides.allowedTools } : {}),
  };
}
