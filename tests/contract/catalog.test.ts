import { describe, expect, it } from "vitest";
import { renderSkillCatalog } from "../../src/catalog/index.js";
import { makeInfo } from "../helpers/fixtures.js";

describe("renderSkillCatalog", () => {
  it("renders a sorted markdown section of name + description", () => {
    const text = renderSkillCatalog([
      makeInfo({ name: "pdf", description: "Extract text from PDFs" }),
      makeInfo({ name: "git-commit", description: "Create a commit" }),
    ]);
    expect(text).toBe(
      "# Available skills\n\n" +
        "- **git-commit** — Create a commit\n" +
        "- **pdf** — Extract text from PDFs\n",
    );
  });

  it("returns an empty string when there are no skills", () => {
    expect(renderSkillCatalog([])).toBe("");
  });

  it("honours a custom heading", () => {
    const text = renderSkillCatalog([makeInfo({ name: "a", description: "d" })], {
      heading: "## Skills",
    });
    expect(text.startsWith("## Skills\n")).toBe(true);
  });
});
