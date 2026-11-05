import { afterAll, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { loadSkills, parseSkill, registerSkills, SKILL_NAMES, SKILLS_DIR } from "../../src/skills.js"

const root = mkdtempSync(join(tmpdir(), "notion-skill-loading-"))
afterAll(() => rmSync(root, { recursive: true, force: true }))

function skills(files: Record<string, string>) {
  const directory = mkdtempSync(join(root, "skills-"))
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(join(directory, name))
    writeFileSync(join(directory, name, "SKILL.md"), text)
  }
  return directory
}

const ok = (name: string) => `---\nname: ${name}\ndescription: ${name} skill\n---\nBody\n`

describe("skill loading", () => {
  test("the main skill and the one for changes", () => {
    expect([...SKILL_NAMES]).toEqual(["notion", "notion-write"])
    expect(SKILLS_DIR.replaceAll("\\", "/").endsWith("/skills/")).toBe(true)
  })

  test("parses LF and CRLF frontmatter into a skill", () => {
    for (const newline of ["\n", "\r\n"]) {
      const text = ["---", "name: notion", 'description: "Use Notion: find and read pages and databases."', "---", "", "# Notion", "Body."].join(newline)
      expect(parseSkill("notion", "/pkg/skills/notion/SKILL.md", text)).toEqual({
        id: "notion",
        name: "notion",
        description: "Use Notion: find and read pages and databases.",
        path: "/pkg/skills/notion/SKILL.md",
        content: "# Notion\nBody.",
      } as never)
    }
  })

  test.each([
    ["no frontmatter", "# Notion", "skills/notion/SKILL.md has no frontmatter"],
    ["the wrong name", "---\nname: other\ndescription: d\n---\n", 'skills/notion/SKILL.md must be named "notion" in its frontmatter'],
    ["no description", "---\nname: notion\n---\n", "skills/notion/SKILL.md has no description"],
  ])("rejects a skill with %s", (_, text, message) => {
    expect(() => parseSkill("notion", "/x", text)).toThrow(message)
  })

  test("loads every skill", async () => {
    const directory = skills(Object.fromEntries(SKILL_NAMES.map((name) => [name, ok(name)])))
    const loaded = await loadSkills(directory)
    expect(loaded.skills.map((skill): string => skill.id)).toEqual([...SKILL_NAMES])
    expect(loaded.problems).toEqual([])
  })

  test("a missing or broken skill becomes a problem for status, not a setup failure", async () => {
    const broken = skills({ notion: "---\nname: notion\n---\n", "notion-write": ok("notion-write") })
    const loaded = await loadSkills(broken)
    expect(loaded.skills.map((skill): string => skill.id)).toEqual(["notion-write"])
    expect(loaded.problems).toEqual(['SKILLS_INVALID: The "notion" skill was not loaded: skills/notion/SKILL.md has no description. Next step: Reinstall the plugin.'])
    const missing = await loadSkills(skills({ notion: ok("notion") }))
    expect(missing.problems).toEqual(['SKILLS_INVALID: The "notion-write" skill was not loaded: skills/notion-write/SKILL.md is missing. Next step: Reinstall the plugin.'])
  })

  test("an unreadable skill file is reported as unreadable, not missing", async () => {
    const directory = skills({ "notion-write": ok("notion-write") })
    mkdirSync(join(directory, "notion", "SKILL.md"), { recursive: true })
    expect((await loadSkills(directory)).problems).toEqual([
      'SKILLS_INVALID: The "notion" skill was not loaded: skills/notion/SKILL.md cannot be read (EISDIR). Next step: Reinstall the plugin.',
    ])
  })

  test("registers every loaded skill", async () => {
    const added: string[] = []
    await registerSkills(
      { transform: async (callback) => (callback({ add: (skill: { id: string }) => void added.push(skill.id) } as never), { dispose: async () => {} }) },
      [parseSkill("notion", "/x", "---\nname: notion\ndescription: d\n---\n")],
    )
    expect(added).toEqual(["notion"])
  })
})
