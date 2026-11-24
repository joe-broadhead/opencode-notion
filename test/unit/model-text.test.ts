// Item 16: every string the model reads must be true under the default, where every tool runs without asking. A
// sentence may say a tool asks or is off only when it names the value that makes it so (`access`, "ask-changes" or
// "read-only"), so a reader can tell the claim depends on the configuration.
import { describe, expect, test } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { NAMESPACE_DESCRIPTION } from "../../src/constants.js"
import { parseSkill, SKILLS_DIR } from "../../src/skills.js"

const ROOT = fileURLToPath(new URL("../..", import.meta.url))
const read = (path: string) => readFileSync(join(ROOT, path), "utf8")

/** Every sentence the model is given: the namespace, the skills, the legacy line. */
export function modelTexts(): [string, string][] {
  const jelly = JSON.parse(read("package.json")) as { jelly: { summary: string } }
  return [
    ["src/constants.ts (namespace)", NAMESPACE_DESCRIPTION],
    ["package.json (jelly summary)", jelly.jelly.summary],
    ...readdirSync(join(ROOT, "skills")).map((name): [string, string] => [`skills/${name}/SKILL.md`, read(`skills/${name}/SKILL.md`)]),
  ]
}

/** A skill's shipped description, parsed the way the plugin parses it. */
const descriptionOf = (name: string) => parseSkill(name, join(SKILLS_DIR, name, "SKILL.md"), read(`skills/${name}/SKILL.md`)).description ?? ""

/** A claim that a tool asks, waits for approval, or is off. */
const CLAIM = /(?:(?:\ba|each|every|any|the) (?:tool|tools|change|changes|export|exports|pin|pins|write|writes|delete|deletes|merge|merges|call|calls) (?:asks?|ask) (?:the user|first|you|before|each time|every time|for (?:each|every))\b|\b(?:tools|changes|exports|writes|pins|deletes|merges) (?:ask|asks) (?:the user|first|you|before|each time|every time|for (?:each|every))\b|\bit asks? (?:the user|first)\b|\basks? (?:the user )?(?:before|each time|every time|for (?:each|every))\b|\bmay ask\b|\b(?:is|are) off\b|\b(?:the user|you) approv|\bpermission prompt (?:is|shows)\b|\bprompt (?:is|shows) (?:the user's|your)\b)/iu
/** The value that makes such a claim true. */
const VALUE = /\baccess\b|\bask-changes\b|\bread-only\b/u

describe("the text the model is given", () => {
  test("the namespace line and every skill description fit the fixed-context budget", () => {
    expect(NAMESPACE_DESCRIPTION.length).toBeLessThanOrEqual(400)
    const names = readdirSync(SKILLS_DIR)
    expect(names.sort()).toEqual(["notion", "notion-write"])
    for (const name of names) expect(descriptionOf(name).length).toBeLessThanOrEqual(300)
  })

  test("the namespace line counters Notion's own memory claim, and routes the neighbours by name", () => {
    expect(NAMESPACE_DESCRIPTION).toContain('Notion\'s "Notion Memory" text is not this machine\'s memory: use a collector unless the user names Notion.')
    expect(NAMESPACE_DESCRIPTION).toContain("tools[\"notion\"][\"notion-search\"]")
    expect(NAMESPACE_DESCRIPTION).toContain("Load the notion skill first, and notion-write before any change.")
  })

  test("nothing is pinned and the plugin adds no per-request hook", () => {
    const sources = readdirSync(join(ROOT, "src")).filter((name) => name.endsWith(".ts")).map((name) => [name, readFileSync(join(ROOT, "src", name), "utf8")] as const)
    for (const [file, source] of sources) {
      expect({ file, pinned: /\bpinned\s*:\s*(?:true|false)/.test(source) }).toEqual({ file, pinned: false })
      expect({ file, hook: /\.hook\(\s*"context"|"chat\.(?:message|params)"|"permission\.ask"/.test(source) }).toEqual({ file, hook: false })
    }
  })

  test("wherever a text says tools are allowed by default, the same text says what the access option decides", () => {
    // "Allowed by default" holds for the default `access` only, so the text that claims it also names the option.
    const ALLOWED_BY_DEFAULT = /\ballowed\b.*\bby default\b|\bby default\b.*\ballowed\b/iu
    for (const [file, text] of modelTexts()) {
      if (!ALLOWED_BY_DEFAULT.test(text.replace(/\s+/g, " "))) continue
      expect({ file, names: VALUE.test(text) }).toEqual({ file, names: true })
    }
  })

  test("says a tool asks or is off only in a sentence that names the value", () => {
    for (const [file, text] of modelTexts()) {
      for (const sentence of text.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/).filter(Boolean)) {
        if (!CLAIM.test(sentence)) continue
        expect({ file, sentence, namesValue: VALUE.test(sentence) }).toEqual({ file, sentence, namesValue: true })
      }
    }
  })
})
