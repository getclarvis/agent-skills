import { parse as parseYaml } from "yaml";
import { SkillError } from "./errors.js";
import { skillFrontmatterSchema, type SkillFrontmatter } from "./schema.js";

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

export interface ParsedSkill {
  frontmatter: SkillFrontmatter;
  body: string;
}

interface RawFrontmatter {
  data: unknown;
  body: string;
}

export function splitFrontmatter(raw: string): RawFrontmatter {
  const text = raw.replace(/^\uFEFF/, "").trimStart();
  const m = FRONTMATTER_RE.exec(text);
  if (m === null) {
    if (text.startsWith("---")) {
      throw new SkillError(
        "invalid_skill",
        "malformed YAML frontmatter (missing or misaligned closing '---' fence)",
      );
    }
    return { data: {}, body: raw };
  }
  const yamlText = m[1] ?? "";
  const body = m[2] ?? "";
  let data: unknown;
  try {
    data = yamlText.trim().length === 0 ? {} : parseYaml(yamlText);
  } catch (err) {
    throw new SkillError(
      "invalid_skill",
      `invalid YAML frontmatter: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  return { data: data ?? {}, body };
}

export function parseSkill(raw: string): ParsedSkill {
  const { data, body } = splitFrontmatter(raw);
  const parsed = skillFrontmatterSchema.safeParse(data);
  if (!parsed.success) {
    const issue = parsed.error.issues[0]!;
    throw new SkillError("invalid_skill", issue.message, { at: issue.path.join(".") });
  }
  return { frontmatter: parsed.data, body: body.trim() };
}

export function normalizeTools(tools: string[] | string | undefined): string[] {
  if (tools === undefined) return [];
  const parts = Array.isArray(tools) ? tools : tools.split(",");
  return parts.map((t) => t.trim()).filter((t) => t.length > 0);
}
