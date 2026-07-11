import type { SkillInfo } from "../types.js";

export interface RenderSkillCatalogOptions {
  heading?: string;
}

export function renderSkillCatalog(
  skills: SkillInfo[],
  opts: RenderSkillCatalogOptions = {},
): string {
  if (skills.length === 0) return "";
  const heading = opts.heading ?? "# Available skills";
  const lines = [...skills]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((s) => `- **${s.name}** — ${s.description}`);
  return `${heading}\n\n${lines.join("\n")}\n`;
}
