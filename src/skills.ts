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

const unquote = (value: string): string => value.trim().replace(/^(["'])(.*)\1$/, "$2")

/** A YAML block scalar indicator: `>`, `|`, and either with `-` or `+` chomping. */
const BLOCK_SCALAR = /^([>|])([+-])?\s*$/

/** The lines of a block scalar: every following line that is blank or indented, with the common indentation removed. */
function blockLines(lines: readonly string[], start: number): { lines: string[]; next: number } {
  const body: string[] = []
  let index = start
  for (; index < lines.length; index++) {
    const line = lines[index]!
    if (line.trim() === "") {
      body.push("")
      continue
    }
    if (!/^\s/.test(line)) break
    body.push(line)
  }
  const indents = body.filter((line) => line.trim() !== "").map((line) => /^\s*/.exec(line)?.[0].length ?? 0)
  const common = indents.length === 0 ? 0 : Math.min(...indents)
  return { lines: body.map((line) => (line.trim() === "" ? "" : line.slice(common))), next: index }
}

/** A folded block: single newlines become spaces, a blank line becomes a newline. */
function folded(lines: readonly string[]): string {
  let out = ""
  let blank = false
  for (const line of lines) {
    if (line.trim() === "") {
      blank = true
      continue
    }
    if (out === "") out = line
    else out += blank ? `\n${line}` : ` ${line}`
    blank = false
  }
  return out
}

/** The fields of the frontmatter, with block scalars read from the lines that follow their key. */
function frontmatterFields(frontmatter: string): Map<string, string> {
  const fields = new Map<string, string>()
  const lines = frontmatter.split("\n")
  for (let index = 0; index < lines.length; ) {
    const line = lines[index]!
    if (line.trim() === "" || /^\s/.test(line)) {
      index += 1
      continue
    }
    const colon = line.indexOf(":")
    if (colon < 0) {
      index += 1
      continue
    }
    const key = line.slice(0, colon).trim()
    const inline = line.slice(colon + 1).trim()
    const block = BLOCK_SCALAR.exec(inline)
    if (block === null) {
      fields.set(key, unquote(inline))
      index += 1
      continue
    }
    const body = blockLines(lines, index + 1)
    const value = block[1] === "|" ? body.lines.join("\n") : folded(body.lines)
    fields.set(key, block[2] === "+" ? value : value.replace(/\n+$/, ""))
    index = body.next
  }
  return fields
}

/** Parses `---` frontmatter with `name` and `description`; the body after it is the skill's content. */
export function parseSkill(name: string, path: string, text: string): Skill.Info {
  const fail = (problem: string): never => {
    throw new Error(detail(problem, name))
  }
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text.replace(/\r\n/g, "\n"))
  if (!match) fail("has no frontmatter")
  const fields = frontmatterFields(match![1]!)
  if (fields.get("name") !== name) fail(`must be named "${name}" in its frontmatter`)
  const description = fields.get("description")
  if (description === undefined || description.trim() === "" || description === ">" || description === "|") fail("has no description")
  const content = match![2]!.trim()
  if (content === "") fail("has no body")
  return {
    id: Skill.ID.make(name),
    name: Skill.Name.make(name),
    description: description!.trim(),
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
