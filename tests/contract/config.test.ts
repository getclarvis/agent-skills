import { writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_FOLLOW_SYMLINKS,
  DEFAULT_STRICT,
  StartupError,
  resolveConfig,
} from "../../src/config.js";
import { cleanup, makeWorkspace } from "../helpers/fixtures.js";

describe("resolveConfig", () => {
  it("fills defaults and preserves the given roots in order", () => {
    const config = resolveConfig({
      home: "/home/u",
      cwd: "/proj",
      roots: [
        { path: "/a", scope: "user", source: "alpha" },
        { path: "/b", scope: "workspace", source: "beta" },
      ],
    });
    expect(config.strict).toBe(DEFAULT_STRICT);
    expect(config.followSymlinks).toBe(DEFAULT_FOLLOW_SYMLINKS);
    expect(config.roots.map((r) => `${r.scope}:${r.source}`)).toEqual([
      "user:alpha",
      "workspace:beta",
    ]);
  });

  it("normalizes each root path and defaults scope/source", () => {
    const config = resolveConfig({
      home: "/home/u",
      cwd: "/proj",
      roots: [{ path: "~/skills" }, { path: ".local/skills" }, { path: "/abs/skills" }],
    });
    expect(config.roots.map((r) => r.path)).toEqual([
      path.join("/home/u", "skills"),
      path.join("/proj", ".local", "skills"),
      "/abs/skills",
    ]);
    expect(config.roots.map((r) => `${r.scope}:${r.source}`)).toEqual([
      "workspace:",
      "workspace:",
      "workspace:",
    ]);
  });

  it("resolves relative roots against the workspace, not the cwd", () => {
    const ws = makeWorkspace();
    try {
      const config = resolveConfig({
        home: "/home/u",
        cwd: "/cwd",
        workspace: ws,
        roots: [{ path: "skills" }],
      });
      expect(config.roots[0]?.path).toBe(path.join(ws, "skills"));
    } finally {
      cleanup(ws);
    }
  });

  it("defaults the workspace to cwd when none is provided", () => {
    const config = resolveConfig({ home: "/home/u", cwd: "/proj", roots: [{ path: "/x" }] });
    expect(config.workspaceDir).toBe("/proj");
  });

  it("throws StartupError when no roots are given", () => {
    expect(() => resolveConfig({ home: "/home/u", cwd: "/proj", roots: [] })).toThrow(StartupError);
  });

  it("accepts an existing workspace directory", () => {
    const ws = makeWorkspace();
    try {
      expect(resolveConfig({ workspace: ws, roots: [{ path: "/x" }] }).workspaceDir).toBe(ws);
    } finally {
      cleanup(ws);
    }
  });

  it("throws StartupError for a workspace that does not exist", () => {
    expect(() =>
      resolveConfig({ workspace: "/no/such/workspace/xyz", roots: [{ path: "/x" }] }),
    ).toThrow(StartupError);
  });

  it("throws StartupError for a workspace that is a file, not a directory", () => {
    const ws = makeWorkspace();
    try {
      const file = path.join(ws, "afile");
      writeFileSync(file, "x");
      expect(() => resolveConfig({ workspace: file, roots: [{ path: "/x" }] })).toThrow(
        /not a directory/,
      );
    } finally {
      cleanup(ws);
    }
  });
});
