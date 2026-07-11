import { homedir } from "node:os";
import path from "node:path";
import { resolveWorkspaceDir } from "./paths.js";
import type { SkillRootInput } from "./types.js";

export interface ClarvisSkillRootsOptions {
  workspace?: string;
  cwd?: string;
  home?: string;
}

export function clarvisSkillRoots(opts: ClarvisSkillRootsOptions = {}): SkillRootInput[] {
  const home = opts.home ?? homedir();
  const cwd = opts.cwd ?? process.cwd();
  const workspaceDir = resolveWorkspaceDir(opts.workspace, cwd, home);

  return [
    { path: path.join(home, ".agents", "skills"), scope: "user", source: "agents" },
    { path: path.join(workspaceDir, ".agents", "skills"), scope: "workspace", source: "agents" },
    { path: path.join(home, ".clarvis", "skills"), scope: "user", source: "clarvis" },
    { path: path.join(workspaceDir, ".clarvis", "skills"), scope: "workspace", source: "clarvis" },
  ];
}
