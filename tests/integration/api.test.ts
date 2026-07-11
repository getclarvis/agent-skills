import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAgentSkills } from "../../src/index.js";
import { SkillError } from "../../src/errors.js";
import {
  clarvisRoots,
  cleanup,
  makeHome,
  makeWorkspace,
  skillsRoot,
  writeSkill,
} from "../helpers/fixtures.js";

function skillError(fn: () => unknown): SkillError {
  try {
    fn();
  } catch (e) {
    if (e instanceof SkillError) return e;
    throw e;
  }
  throw new Error("expected resourcePath to throw a SkillError");
}

describe("createAgentSkills (end to end)", () => {
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

  function agent() {
    return createAgentSkills({ home, cwd: ws, workspace: ws, roots: clarvisRoots(home, ws) });
  }

  it("lists a discovered skill's catalog projection", () => {
    writeSkill(skillsRoot(ws, "clarvis"), "git-commit", {
      frontmatter: { description: "Create a commit", "allowed-tools": ["Bash"] },
      body: "Steps...",
    });

    const skills = agent().listSkills();
    expect(skills).toHaveLength(1);
    expect(skills[0]).toMatchObject({
      name: "git-commit",
      description: "Create a commit",
      allowedTools: ["Bash"],
      userInvocable: true,
      source: "clarvis",
      scope: "workspace",
    });
  });

  it("normalizes user-invocable: false", () => {
    writeSkill(skillsRoot(ws, "clarvis"), "internal", {
      frontmatter: { "user-invocable": false },
    });
    expect(agent().listSkills()[0]?.userInvocable).toBe(false);
  });

  it("loads the body and enumerates resources on demand", () => {
    writeSkill(skillsRoot(ws, "clarvis"), "pdf", {
      body: "How to PDF",
      resources: { "scripts/extract.py": "print(1)", "references/spec.md": "spec" },
    });

    const content = agent().loadSkill("pdf");
    expect(content?.body).toBe("How to PDF");
    expect(content?.resources.map((r) => r.rel).sort()).toEqual([
      "references/spec.md",
      "scripts/extract.py",
    ]);
  });

  it("returns undefined for an unknown skill", () => {
    expect(agent().loadSkill("nope")).toBeUndefined();
  });

  it("returns a confined resource path and rejects an escape", () => {
    writeSkill(skillsRoot(ws, "clarvis"), "demo", { resources: { "assets/logo.svg": "<svg/>" } });
    const a = agent();
    expect(a.resourcePath("demo", "assets/logo.svg")).toMatch(/assets\/logo\.svg$/);
    const err = skillError(() => a.resourcePath("demo", "../../etc/passwd"));
    expect(err.code).toBe("path_escape");
  });

  it("throws not_found for a resource of an unknown skill", () => {
    const err = skillError(() => agent().resourcePath("ghost", "x"));
    expect(err.code).toBe("not_found");
  });

  it("throws not_found for a missing resource of a known skill", () => {
    writeSkill(skillsRoot(ws, "clarvis"), "demo");
    const err = skillError(() => agent().resourcePath("demo", "assets/missing.png"));
    expect(err.code).toBe("not_found");
  });

  it("throws not_a_file when the resource path resolves to a directory", () => {
    writeSkill(skillsRoot(ws, "clarvis"), "demo", { resources: { "scripts/extract.py": "x" } });
    const err = skillError(() => agent().resourcePath("demo", "scripts"));
    expect(err.code).toBe("not_a_file");
  });

  it("derives allowedTools from `tools` when `allowed-tools` is absent", () => {
    writeSkill(skillsRoot(ws, "clarvis"), "t", { frontmatter: { tools: "Read, Write" } });
    expect(agent().listSkills()[0]?.allowedTools).toEqual(["Read", "Write"]);
  });

  it("prefers `allowed-tools` over `tools` when both are present", () => {
    writeSkill(skillsRoot(ws, "clarvis"), "t", {
      frontmatter: { "allowed-tools": ["Bash"], tools: ["Read"] },
    });
    expect(agent().listSkills()[0]?.allowedTools).toEqual(["Bash"]);
  });

  it("re-scans on refresh to observe a newly added skill", () => {
    const a = agent();
    expect(a.listSkills()).toHaveLength(0);
    writeSkill(skillsRoot(ws, "clarvis"), "new-one");
    a.refresh();
    expect(a.listSkills().map((s) => s.name)).toEqual(["new-one"]);
  });

  it("reflects a modified body and drops a removed skill on refresh", () => {
    const dir = writeSkill(skillsRoot(ws, "clarvis"), "temp", { body: "v1" });
    const a = agent();
    expect(a.loadSkill("temp")?.body).toBe("v1");

    writeSkill(skillsRoot(ws, "clarvis"), "temp", { body: "v2" });
    a.refresh();
    expect(a.loadSkill("temp")?.body).toBe("v2");

    cleanup(dir);
    a.refresh();
    expect(a.loadSkill("temp")).toBeUndefined();
    expect(a.listSkills()).toHaveLength(0);
  });

  it("exposes the resolved config with the clarvis preset's four roots", () => {
    expect(agent().config.roots).toHaveLength(4);
  });

  it("discovers skills from caller-supplied roots outside the clarvis convention", () => {
    const store = path.join(ws, "my-skills");
    writeSkill(store, "hello", { body: "hi from a custom root" });

    const custom = createAgentSkills({
      home,
      workspace: ws,
      roots: [{ path: store, source: "myapp" }],
    });

    expect(custom.config.roots).toHaveLength(1);
    const skills = custom.listSkills();
    expect(skills).toHaveLength(1);
    expect(skills[0]).toMatchObject({ name: "hello", source: "myapp", scope: "workspace" });
    expect(custom.loadSkill("hello")?.body).toBe("hi from a custom root");
  });
});
