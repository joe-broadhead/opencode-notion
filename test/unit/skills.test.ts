import { describe, expect, test } from "vitest"
import { parseSkill } from "../../src/skills.ts"

const path = "/skills/notion/SKILL.md"

describe("skill frontmatter", () => {
  test("reads a one-line description", () => {
    const skill = parseSkill("notion", path, "---\nname: notion\ndescription: A one-line description.\n---\nBody.\n")
    expect(skill.description).toBe("A one-line description.")
  })

  test("folds a block scalar with >", () => {
    const skill = parseSkill("notion", path, "---\nname: notion\ndescription: >\n  A folded\n  description.\n---\nBody.\n")
    expect(skill.description).toBe("A folded description.")
  })

  test("folds a block scalar with >- and no trailing newline", () => {
    const skill = parseSkill("notion", path, "---\nname: notion\ndescription: >-\n  A folded\n  description.\n---\nBody.\n")
    expect(skill.description).toBe("A folded description.")
  })

  test("preserves a literal block scalar with |", () => {
    const skill = parseSkill("notion", path, "---\nname: notion\ndescription: |\n  First line.\n  Second line.\n---\nBody.\n")
    expect(skill.description).toBe("First line.\nSecond line.")
  })

  test("refuses an empty block scalar", () => {
    expect(() => parseSkill("notion", path, "---\nname: notion\ndescription: >\n---\nBody.\n")).toThrow(/has no description/)
  })
})
