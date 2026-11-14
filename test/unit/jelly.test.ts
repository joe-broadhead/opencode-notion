import { describe, expect, test } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { DISPLAY_NAME, SERVER_NAME } from "../../src/constants.js"
import { DESTRUCTIVE_TOOLS, READ_TOOLS, WRITE_TOOLS } from "../../src/notion-tools.js"
import { ACCESS, defaultRules, evaluate } from "../../src/permissions.js"
import { declarationProblems, docProblems } from "../support/jelly-kit.js"
import { SKILL_NAMES } from "../../src/skills.js"
import { parseOptions } from "../../src/options.js"
import { ACCESS_CHOICES, type PluginSetting, settingChoices, settingsProblems, settingValueIssue } from "../support/jelly-settings.js"

/**
 * The `jelly` section of package.json, which Jelly reads without loading the plugin. Jelly's agents have no base allow
 * rule, so this plugin's own rules never reach them: Jelly writes each declared "ask" or "deny" as that tool's default.
 */

type Tool = { name: string; permission: string; effect: "allow" | "ask" | "deny"; readOnly: boolean; note?: string }
const ROOT = new URL("../../", import.meta.url)
/** The two reads Notion lists only on some plans or connections, from test/fixtures/tool-registry.json. */
const PLAN_GATED = new Set(
  Object.entries((JSON.parse(readFileSync(new URL("../fixtures/tool-registry.json", import.meta.url), "utf8")) as { tools: Record<string, { availability?: string }> }).tools)
    .filter(([, entry]) => entry.availability === "plan")
    .map(([name]) => name),
)
const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
  files: string[]
  jelly: {
    title: string
    summary: string
    icon: string
    tools: Tool[]
    skills: string[]
    rpc: unknown[]
    views: unknown[]
    signIns: unknown[]
    contributes: unknown
  }
}
const { jelly } = pkg
const byPermission = new Map(jelly.tools.map((tool) => [tool.permission, tool]))

describe("the jelly declaration", () => {
  test("follows the plugin authors' standard, with the effects the plugin's own default rules give", () => {
    const rules = [{ action: "*", resource: "*", effect: "allow" as const }, ...defaultRules()]
    const registered = [...READ_TOOLS, ...WRITE_TOOLS, ...DESTRUCTIVE_TOOLS].map((tool) => `${SERVER_NAME}_${tool}`)
    expect(declarationProblems(ROOT, { effectOf: (permission) => evaluate(rules, permission), registered })).toEqual([])
  })

  test("declares every known tool once, every one allowed, and marks the reads read-only", () => {
    for (const tool of READ_TOOLS) expect(byPermission.get(`notion_${tool}`)).toMatchObject({ effect: "allow", readOnly: true })
    for (const tool of [...WRITE_TOOLS, ...DESTRUCTIVE_TOOLS]) expect(byPermission.get(`notion_${tool}`)).toMatchObject({ effect: "allow", readOnly: false })
    expect(jelly.tools).toHaveLength(READ_TOOLS.length + WRITE_TOOLS.length + DESTRUCTIVE_TOOLS.length)
    expect([...byPermission.keys()].sort()).toEqual([...READ_TOOLS, ...WRITE_TOOLS, ...DESTRUCTIVE_TOOLS].map((tool) => `notion_${tool}`).sort())
  })

  test("each declared effect is what the plugin's own default rules decide for that tool", () => {
    const rules = [{ action: "*", resource: "*", effect: "allow" as const }, ...defaultRules()]
    for (const tool of jelly.tools) expect([tool.permission, evaluate(rules, tool.permission)]).toEqual([tool.permission, tool.effect])
  })

  test("each tool's name is its Code Mode path, and its permission the host's action", () => {
    for (const tool of jelly.tools) {
      expect(tool.name).toStartWith(`${SERVER_NAME}.`)
      expect(tool.name.replaceAll(".", "_")).toBe(tool.permission)
      // A tool Notion lists only on some plans or connections carries a note that says so; no other tool has one.
      const gated = PLAN_GATED.has(tool.permission.slice(SERVER_NAME.length + 1))
      expect(Object.keys(tool).sort()).toEqual(gated ? ["effect", "name", "note", "permission", "readOnly"] : ["effect", "name", "permission", "readOnly"])
      if (gated) expect(tool.note).toMatch(/^Listed only on /)
    }
  })

  test("uses only the keys Jelly reads: its contracts strip any other", () => {
    expect(Object.keys(jelly).sort()).toEqual(["contributes", "icon", "rpc", "signIns", "skills", "summary", "title", "tools", "views"])
  })

  test("names every skill the package ships, the one sign-in, and no views, RPC, feeds or widgets", () => {
    expect(jelly.title).toBe(DISPLAY_NAME)
    expect([...jelly.skills].sort()).toEqual(readdirSync(new URL("../../skills", import.meta.url)).sort())
    expect(jelly.skills).toEqual([...SKILL_NAMES])
    expect(jelly.signIns).toEqual([{ id: SERVER_NAME, label: DISPLAY_NAME, server: SERVER_NAME, relay: {} }])
    expect(jelly.rpc).toEqual([])
    expect(jelly.views).toEqual([])
    // The one setting is the access option, allowed by default, worded as in the family's other plugins.
    expect(jelly.contributes).toEqual({
      homeFeeds: [],
      homeWidgets: [],
      workKinds: [],
      settings: [{ key: "access", label: "Access", type: "string", default: "all", choices: [...ACCESS_CHOICES], description: "What Notion's tools may do without asking. Generates default rules for agents with a base allow rule." }],
    })
  })

  test("the summary is one line of 1 to 120 characters", () => {
    expect(jelly.summary.trim().length).toBeGreaterThan(0)
    expect(jelly.summary.length).toBeLessThanOrEqual(120)
    expect(jelly.summary).not.toContain("\n")
  })
})

describe("the jelly settings declare their choices", () => {
  const settings = (pkg.jelly as unknown as { contributes: { settings: PluginSetting[] } }).contributes.settings
  const access = settings.find((setting) => setting.key === "access")!
  const accepts = (options: Record<string, unknown>) => {
    try {
      parseOptions(options)
      return true
    } catch {
      return false
    }
  }

  test("Jelly's setting schema reads them", () => {
    expect(settingsProblems(settings)).toEqual([])
  })

  test("access offers Jelly's three choices, word for word, and the options parser takes exactly those", () => {
    expect(access.choices).toEqual([...ACCESS_CHOICES])
    expect(settingChoices(access)?.map((choice) => choice.value)).toEqual([...ACCESS])
    for (const { value } of ACCESS_CHOICES) expect(accepts({ access: value })).toBe(true)
    for (const value of ["read", "write", "none", "ALL"]) {
      expect(settingValueIssue(access, value)).not.toBeNull()
      expect(accepts({ access: value })).toBe(false)
    }
  })
})

describe("docs/jelly.md", () => {
  test("follows the plugin authors' standard", () => {
    expect(docProblems(ROOT)).toEqual([])
  })
})
