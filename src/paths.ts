import { existsSync, realpathSync } from "node:fs";
import path from "node:path";
import { SkillError } from "./errors.js";

export function expandHome(p: string, home: string): string {
  if (p === "~") return home;
  if (p.startsWith("~/")) return path.join(home, p.slice(2));
  return p;
}

export function resolveAgainst(base: string, p: string, home: string): string {
  const expanded = expandHome(p, home);
  return path.isAbsolute(expanded) ? expanded : path.resolve(base, expanded);
}

export function resolveWorkspaceDir(
  workspace: string | undefined,
  cwd: string,
  home: string,
): string {
  if (workspace === undefined) return cwd;
  return resolveAgainst(cwd, workspace, home);
}

export function resolveResourcePath(skillDir: string, rel: string): string {
  if (rel.length === 0) {
    throw new SkillError("invalid_input", "resource path must not be empty");
  }
  if (path.isAbsolute(rel)) {
    throw new SkillError("invalid_input", `resource path must be relative: ${rel}`, { rel });
  }
  const abs = path.resolve(skillDir, rel);
  const dirReal = canonicalize(skillDir);
  const targetReal = canonicalizeAllowingMissing(abs);
  if (targetReal !== dirReal && !targetReal.startsWith(dirReal + path.sep)) {
    throw new SkillError("path_escape", `resource path escapes the skill directory: ${rel}`, {
      rel,
    });
  }
  return abs;
}

function canonicalize(p: string): string {
  try {
    return realpathSync.native(p);
  } catch {
    return path.normalize(p);
  }
}

function canonicalizeAllowingMissing(abs: string): string {
  const tail: string[] = [];
  let cur = abs;
  while (!existsSync(cur)) {
    const parent = path.dirname(cur);
    if (parent === cur) return path.normalize(abs);
    tail.unshift(path.basename(cur));
    cur = parent;
  }
  const real = canonicalize(cur);
  return tail.length > 0 ? path.join(real, ...tail) : real;
}
