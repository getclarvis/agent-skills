import { describe, expect, it } from "vitest";
import { skillFrontmatterSchema } from "../../src/schema.js";

describe("skillFrontmatterSchema", () => {
  it("accepts the minimal name + description frontmatter", () => {
    const parsed = skillFrontmatterSchema.safeParse({ name: "x", description: "y" });
    expect(parsed.success).toBe(true);
  });

  it("requires name", () => {
    const parsed = skillFrontmatterSchema.safeParse({ description: "y" });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues[0]?.path).toEqual(["name"]);
  });

  it("requires a non-empty description", () => {
    expect(skillFrontmatterSchema.safeParse({ name: "x", description: "  " }).success).toBe(false);
  });

  it("rejects a name with a path separator or whitespace", () => {
    expect(skillFrontmatterSchema.safeParse({ name: "a/b", description: "y" }).success).toBe(false);
    expect(skillFrontmatterSchema.safeParse({ name: "a b", description: "y" }).success).toBe(false);
  });

  it("accepts the documented optional fields", () => {
    const parsed = skillFrontmatterSchema.safeParse({
      name: "x",
      description: "y",
      version: "1.0.0",
      "allowed-tools": ["Read", "Grep"],
      "user-invocable": true,
      "argument-hint": "<arg>",
      license: "MIT",
      tools: "Read, Bash",
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts allowed-tools as either an array or a string", () => {
    expect(
      skillFrontmatterSchema.safeParse({
        name: "x",
        description: "y",
        "allowed-tools": "Read,Grep",
      }).success,
    ).toBe(true);
  });

  it("keeps unknown keys via passthrough", () => {
    const parsed = skillFrontmatterSchema.safeParse({ name: "x", description: "y", extra: "kept" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect((parsed.data as Record<string, unknown>).extra).toBe("kept");
  });
});
