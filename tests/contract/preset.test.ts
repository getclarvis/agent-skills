import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { clarvisSkillRoots } from "../../src/preset.js";

describe("clarvisSkillRoots", () => {
  it("builds the four clarvis roots in ascending precedence with scope/source labels", () => {
    const roots = clarvisSkillRoots({ home: "/home/u", cwd: "/tmp", workspace: "/work" });
    expect(roots).toEqual([
      { path: path.join("/home/u", ".agents", "skills"), scope: "user", source: "agents" },
      { path: path.join("/work", ".agents", "skills"), scope: "workspace", source: "agents" },
      { path: path.join("/home/u", ".clarvis", "skills"), scope: "user", source: "clarvis" },
      { path: path.join("/work", ".clarvis", "skills"), scope: "workspace", source: "clarvis" },
    ]);
  });

  it("defaults the workspace to cwd when none is given", () => {
    const roots = clarvisSkillRoots({ home: "/home/u", cwd: "/project" });
    expect(roots[1]?.path).toBe(path.join("/project", ".agents", "skills"));
    expect(roots[3]?.path).toBe(path.join("/project", ".clarvis", "skills"));
  });

  it("falls back to the real home and cwd when no options are given", () => {
    const roots = clarvisSkillRoots();
    expect(roots[0]?.path).toBe(path.join(os.homedir(), ".agents", "skills"));
    expect(roots[3]?.path).toBe(path.join(process.cwd(), ".clarvis", "skills"));
  });
});
