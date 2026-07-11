import { statSync } from "node:fs";
import { homedir } from "node:os";
import { resolveAgainst, resolveWorkspaceDir } from "./paths.js";
import type { SkillRoot, SkillRootInput } from "./types.js";

export const DEFAULT_STRICT = false;
export const DEFAULT_FOLLOW_SYMLINKS = true;

export class StartupError extends Error {}

export interface SkillConfig {
  home: string;
  workspaceDir: string;
  roots: SkillRoot[];
  strict: boolean;
  followSymlinks: boolean;
}

export interface AgentSkillsOptions {
  roots: SkillRootInput[];
  workspace?: string;
  cwd?: string;
  home?: string;
  strict?: boolean;
  followSymlinks?: boolean;
}

export function resolveConfig(options: AgentSkillsOptions): SkillConfig {
  const home = options.home ?? homedir();
  const cwd = options.cwd ?? process.cwd();
  const workspaceDir = resolveWorkspaceDir(options.workspace, cwd, home);

  if (options.workspace !== undefined) {
    validateDir(workspaceDir);
  }

  if (options.roots.length === 0) {
    throw new StartupError("createAgentSkills requires at least one root in options.roots");
  }

  return {
    home,
    workspaceDir,
    roots: options.roots.map((root) => normalizeRoot(root, workspaceDir, home)),
    strict: options.strict ?? DEFAULT_STRICT,
    followSymlinks: options.followSymlinks ?? DEFAULT_FOLLOW_SYMLINKS,
  };
}

function normalizeRoot(input: SkillRootInput, workspaceDir: string, home: string): SkillRoot {
  return {
    path: resolveAgainst(workspaceDir, input.path, home),
    scope: input.scope ?? "workspace",
    source: input.source ?? "",
  };
}

function validateDir(dir: string): void {
  let stat;
  try {
    stat = statSync(dir);
  } catch {
    throw new StartupError(`Workspace does not exist: ${dir}`);
  }
  if (!stat.isDirectory()) {
    throw new StartupError(`Workspace is not a directory: ${dir}`);
  }
}
