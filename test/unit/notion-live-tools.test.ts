// The committed fixture stands in for a live tools/list until the owner signs in. Every name in it must have exactly one
// rule, and the nine denies must be hidden; replacing it with the signed-in list is the whole reconcile step.
import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { classify, DENY_TOOLS, READ_TOOLS, WRITE_TOOLS } from "../../src/notion-tools.js"
import { defaultRules, evaluate, type Rule } from "../../src/permissions.js"

const FIXTURE = JSON.parse(readFileSync(new URL("./notion-live-tools.json", import.meta.url), "utf8")) as {
  provisional?: boolean
  tools: { name: string; class?: string }[]
}
const BASE: Rule = { action: "*", resource: "*", effect: "allow" }
const rules = [BASE, ...defaultRules()]
const ACTION = (name: string) => `notion_${name}`
const effectOf = (kind: string) => (kind === "read" ? "allow" : kind === "write" ? "ask" : "deny")

/** The last rule that matches the action on every resource: what OpenCode decides, and what a deny hides. */
const lastRule = (action: string) => rules.findLast((rule) => rule.action === action || rule.action === "notion_*")

describe("the live-tools fixture", () => {
  test("names every known tool once, and nothing else", () => {
    const names = FIXTURE.tools.map((tool) => tool.name)
    expect(new Set(names).size).toBe(names.length)
    expect([...names].sort()).toEqual([...READ_TOOLS, ...WRITE_TOOLS, ...DENY_TOOLS].sort())
  })

  test("gives every tool exactly one rule: reads allow, writes ask, the nine denies deny", () => {
    for (const { name, class: listed } of FIXTURE.tools) {
      const kind = classify(name)
      expect({ name, rule: evaluate(rules, ACTION(name)) }).toEqual({ name, rule: effectOf(kind) })
      if (listed !== undefined) expect({ name, listed }).toEqual({ name, listed: kind === "denied" ? "deny" : kind === "write" ? "ask" : "allow" })
    }
  })

  test("hides every deny from the model, and only ask or allow reaches a write", () => {
    for (const name of DENY_TOOLS) {
      const last = lastRule(ACTION(name))
      expect({ name, hidden: last?.resource === "*" && last.effect === "deny" }).toEqual({ name, hidden: true })
    }
    for (const name of WRITE_TOOLS) expect({ name, effect: evaluate(rules, ACTION(name)) }).toEqual({ name, effect: "ask" })
    for (const name of READ_TOOLS) expect({ name, hidden: lastRule(ACTION(name))?.effect === "deny" }).toEqual({ name, hidden: false })
  })

  test("is the provisional table until a signed-in list replaces it", () => {
    expect(FIXTURE.provisional).toBe(true)
    expect(FIXTURE.tools).toHaveLength(71)
  })
})
