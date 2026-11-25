import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { Skill } from "@opencode/plugin"
import { redactReason } from "@we-the-rebel-alliance/plugin-contract/accounts"

/** `skills/` at the package root, next to `dist/` (and next to `src/` in the repository). */
export const SKILLS_DIR = fileURLToPath(new URL("../skills/", import.meta.url))

/** The skills the plugin ships: the main one and the one for changes. */
export const SKILL_NAMES: readonly string[] = ["notion", "notion-write"]

const detail = (problem: string, name: string) => `The "${name}" skill was not loaded: skills/${name}/SKILL.md ${problem}`

const problemOf = (name: string, value: string) => `UNAVAILABLE: ${detail(value, name)}. Next step: Reinstall the plugin.`

/** Parses `---` frontmatter with `name` and `description`; the body after it is the skill's content. */
export function parseSkill(name: string, path: string, text: string): Skill.Info {
  const fail = (problem: string): never => {
    throw new Error(detail(problem, name))
  }
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text.replace(/\r\n/g, "\n"))
  if (!match) fail("has no frontmatter")
  const fields = new Map(
    match![1]!.split("\n").map((line) => {
      const colon = line.indexOf(":")
      return [colon < 0 ? line.trim() : line.slice(0, colon).trim(), colon < 0 ? "" : line.slice(colon + 1).trim().replace(/^(["'])(.*)\1$/, "$2")]
    }),
  )
  if (fields.get("name") !== name) fail(`must be named "${name}" in its frontmatter`)
  const description = fields.get("description")
  if (description === undefined || description.trim() === "") fail("has no description")
  const content = match![2]!.trim()
  if (content === "") fail("has no body")
  return {
    id: Skill.ID.make(name),
    name: Skill.Name.make(name),
    description: description!,
    path: Skill.Info.fields.path.make(path),
    content,
  }
}

/**
 * Reads the skills before the synchronous transform needs them. A missing or broken skill file does not stop the
 * plugin, because the server and the permission rules still work; it is recorded for status instead.
 */
export async function loadSkills(directory = SKILLS_DIR): Promise<{ skills: Skill.Info[]; problems: string[] }> {
  const skills: Skill.Info[] = []
  const problems: string[] = []
  for (const name of SKILL_NAMES) {
    const path = join(directory, name, "SKILL.md")
    try {
      skills.push(parseSkill(name, path, await readFile(path, "utf8")))
    } catch (error) {
      const code = (error as { code?: unknown }).code
      const reason = code === "ENOENT" ? "is missing" : redactReason(error instanceof Error ? error.message : String(error)).slice(0, 160)
      problems.push(problemOf(name, reason))
    }
  }
  return { skills, problems }
}
