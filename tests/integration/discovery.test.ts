import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveConfig } from "../../src/config.js";
import { discoverSkills } from "../../src/core.js";
import {
  clarvisRoots,
  cleanup,
  makeHome,
  makeWorkspace,
  skillsRoot,
  writeSkill,
} from "../helpers/fixtures.js";

describe("root discovery + last-wins precedence (clarvis preset)", () => {
  let home: string;
  let ws: string;

  beforeEach(() => {
    home = makeHome();
    ws = makeWorkspace();
  });

  afterEach(() => {
    cleanup(home);
    cleanup(ws);
  });

  function discover() {
    return discoverSkills(
      resolveConfig({ home, cwd: ws, workspace: ws, roots: clarvisRoots(home, ws) }),
    );
  }

  it("resolves a skill present in all four roots to the workspace .clarvis copy", () => {
    writeSkill(skillsRoot(home, "agents"), "demo", { body: "A" });
    writeSkill(skillsRoot(home, "clarvis"), "demo", { body: "B" });
    writeSkill(skillsRoot(ws, "agents"), "demo", { body: "C" });
    writeSkill(skillsRoot(ws, "clarvis"), "demo", { body: "D" });

    const skill = discover().get("demo");
    expect(skill?.body).toBe("D");
    expect(skill?.scope).toBe("workspace");
    expect(skill?.source).toBe("clarvis");
  });

  it("lets any .clarvis skill override any .agents skill — even a user-global one over a workspace one", () => {
    writeSkill(skillsRoot(ws, "agents"), "tool", { body: "ws-agents" });
    writeSkill(skillsRoot(home, "clarvis"), "tool", { body: "user-clarvis" });

    const skill = discover().get("tool");
    expect(skill?.body).toBe("user-clarvis");
    expect(skill?.source).toBe("clarvis");
    expect(skill?.scope).toBe("user");
  });

  it("prefers the workspace copy over the user copy within the same source", () => {
    writeSkill(skillsRoot(home, "clarvis"), "shared", { body: "user" });
    writeSkill(skillsRoot(ws, "clarvis"), "shared", { body: "workspace" });

    expect(discover().get("shared")?.body).toBe("workspace");
  });

  it("merges distinct skills across roots and silently skips roots that do not exist", () => {
    writeSkill(skillsRoot(home, "agents"), "a");
    writeSkill(skillsRoot(ws, "clarvis"), "b");

    const registry = discover();
    expect(registry.list().map((s) => s.name)).toEqual(["a", "b"]);
    expect(registry.size).toBe(2);
  });

  it("treats a legitimate cross-root override as override, not a duplicate, even under strict mode", () => {
    writeSkill(skillsRoot(home, "agents"), "demo", { body: "A" });
    writeSkill(skillsRoot(ws, "clarvis"), "demo", { body: "D" });

    const registry = discoverSkills(
      resolveConfig({ home, cwd: ws, workspace: ws, strict: true, roots: clarvisRoots(home, ws) }),
    );
    expect(registry.get("demo")?.body).toBe("D");
    expect(registry.size).toBe(1);
  });

  it("discovers skills from arbitrary caller-supplied roots, last root wins", () => {
    const lower = path.join(ws, "lower-store");
    const upper = path.join(ws, "upper-store");
    writeSkill(lower, "demo", { body: "lower" });
    writeSkill(lower, "only-lower", { body: "x" });
    writeSkill(upper, "demo", { body: "upper" });

    const registry = discoverSkills(
      resolveConfig({
        home,
        cwd: ws,
        workspace: ws,
        roots: [
          { path: lower, source: "lower" },
          { path: upper, source: "upper" },
        ],
      }),
    );

    expect(
      registry
        .list()
        .map((s) => s.name)
        .sort(),
    ).toEqual(["demo", "only-lower"]);
    const winner = registry.get("demo");
    expect(winner?.body).toBe("upper");
    expect(winner?.source).toBe("upper");
    expect(winner?.scope).toBe("workspace");
  });
});
