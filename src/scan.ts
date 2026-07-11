import { readdirSync, realpathSync, statSync, type Dirent } from "node:fs";
import path from "node:path";
import { warn } from "./lib/log.js";
import type { SkillResource } from "./types.js";

const SKILL_FILE = "skill.md";

export interface SkillDirEntry {
  dir: string;
  file: string;
}

export function listSkillDirs(root: string, followSymlinks: boolean): SkillDirEntry[] {
  const out: SkillDirEntry[] = [];
  for (const entry of safeReaddir(root)) {
    const dir = path.join(root, entry.name);
    if (!isDirEntry(entry, dir, followSymlinks)) continue;
    const file = findSkillFile(dir, followSymlinks);
    if (file !== undefined) out.push({ dir, file });
  }
  return out.sort((a, b) => a.dir.localeCompare(b.dir));
}

export function findSkillFile(dir: string, followSymlinks: boolean): string | undefined {
  for (const entry of safeReaddir(dir)) {
    if (entry.name.toLowerCase() !== SKILL_FILE) continue;
    const full = path.join(dir, entry.name);
    if (isFileEntry(entry, full, followSymlinks)) return full;
  }
  return undefined;
}

export function enumerateResources(dir: string, followSymlinks: boolean): SkillResource[] {
  const out: SkillResource[] = [];
  walk(dir, dir, out, new Set<string>(), followSymlinks, safeRealpath(dir));
  return out.sort((a, b) => a.rel.localeCompare(b.rel));
}

function walk(
  current: string,
  skillDir: string,
  out: SkillResource[],
  visited: Set<string>,
  followSymlinks: boolean,
  rootReal: string,
): void {
  const real = safeRealpath(current);
  if (visited.has(real)) return;
  visited.add(real);

  for (const entry of safeReaddir(current)) {
    const full = path.join(current, entry.name);
    if (entry.isSymbolicLink() && followSymlinks && escapesRoot(rootReal, full)) {
      warn(`clarvis-agent-skills: skipping resource symlink escaping skill dir ${full}\n`);
      continue;
    }
    if (isFileEntry(entry, full, followSymlinks)) {
      if (current === skillDir && entry.name.toLowerCase() === SKILL_FILE) continue;
      out.push({ kind: classify(skillDir, full), rel: toPosixRel(skillDir, full), path: full });
    } else if (isDirEntry(entry, full, followSymlinks)) {
      walk(full, skillDir, out, visited, followSymlinks, rootReal);
    }
  }
}

function escapesRoot(rootReal: string, full: string): boolean {
  const real = safeRealpath(full);
  return real !== rootReal && !real.startsWith(rootReal + path.sep);
}

function classify(skillDir: string, full: string): SkillResource["kind"] {
  const top = path.relative(skillDir, full).split(path.sep)[0] ?? "";
  if (top === "scripts" || top === "references" || top === "assets" || top === "examples") {
    return top;
  }
  return "other";
}

function toPosixRel(skillDir: string, full: string): string {
  return path.relative(skillDir, full).split(path.sep).join("/");
}

function safeReaddir(dir: string): Dirent[] {
  try {
    return readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

function safeRealpath(p: string): string {
  try {
    return realpathSync.native(p);
  } catch {
    return p;
  }
}

function isFileEntry(entry: Dirent, full: string, followSymlinks: boolean): boolean {
  if (entry.isFile()) return true;
  if (entry.isSymbolicLink() && followSymlinks) return safeStatIsFile(full);
  return false;
}

function isDirEntry(entry: Dirent, full: string, followSymlinks: boolean): boolean {
  if (entry.isDirectory()) return true;
  if (entry.isSymbolicLink() && followSymlinks) return safeStatIsDir(full);
  return false;
}

function safeStatIsFile(full: string): boolean {
  try {
    return statSync(full).isFile();
  } catch {
    warn(`clarvis-agent-skills: skipping dangling symlink ${full}\n`);
    return false;
  }
}

function safeStatIsDir(full: string): boolean {
  try {
    return statSync(full).isDirectory();
  } catch {
    warn(`clarvis-agent-skills: skipping dangling symlink ${full}\n`);
    return false;
  }
}
