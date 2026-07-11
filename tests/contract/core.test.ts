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

describe("discoverSkills", () => {
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

  it("builds a registry that lists and loads discovered skills", () => {
    writeSkill(skillsRoot(ws, "clarvis"), "demo", { body: "hi" });
    const registry = discoverSkills(
      resolveConfig({ home, cwd: ws, workspace: ws, roots: clarvisRoots(home, ws) }),
    );
    expect(registry.list().map((s) => s.name)).toEqual(["demo"]);
    expect(registry.get("demo")?.body).toBe("hi");
    expect(registry.get("absent")).toBeUndefined();
  });
});
