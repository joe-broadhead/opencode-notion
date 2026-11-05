import { describe, expect, test } from "bun:test"
import { DENY_TOOLS, READ_TOOLS } from "../../src/notion-tools.js"
import { defaultRules, evaluate, hasDefaultRules, insertRules, registerDefaultRules, unguardedAgents, type Rule } from "../../src/permissions.js"
import { agentEditor, allow, builtInAgents, transforms, type AgentEditor, type FakeAgent } from "./fake.js"

const ask: Rule = { action: "notion_*", resource: "*", effect: "ask" }
const deny = (action: string): Rule => ({ action, resource: "*", effect: "deny" })
const ACTIONS = ["notion_notion-search", "notion_notion-get-self", "notion_notion-create-comment", "notion_notion-delete-pages", "notion_notion-new_tool", "notion_notion-restore-version"]
const effects = (rules: readonly Rule[]) => ACTIONS.map((action) => evaluate(rules, action))

describe("defaultRules", () => {
  test("ask for every Notion tool, then allow each known read, then deny the denied tools last", () => {
    const rules = defaultRules()
    expect(rules[0]).toEqual(ask)
    expect(rules.slice(1, 1 + READ_TOOLS.length)).toEqual(READ_TOOLS.map((tool) => ({ action: `notion_${tool}`, resource: "*", effect: "allow" })))
    expect(rules.slice(1 + READ_TOOLS.length)).toEqual(DENY_TOOLS.map((tool) => deny(`notion_${tool}`)))
  })

  test("reads allow; deletes and whole-page replacements are denied; every other change asks", () => {
    expect(effects([allow("*"), ...defaultRules()])).toEqual(["allow", "allow", "ask", "deny", "ask", "deny"])
    expect(evaluate([allow("*"), ...defaultRules()], "notion_notion-update-page")).toBe("ask")
    expect(evaluate([allow("*"), ...defaultRules()], "notion_notion-spawn-session")).toBe("deny")
  })

  test("the action is double-prefixed, with the hyphen Notion's own name has kept", () => {
    // A host change that rewrote hyphens would silently unguard every rule: pin the exact string.
    expect(defaultRules()[1]).toEqual({ action: "notion_notion-ai-search", resource: "*", effect: "allow" })
    expect(defaultRules().some((rule) => rule.action === "notion_notion-search")).toBe(true)
    expect(defaultRules().some((rule) => rule.action === "notion_notion-delete-pages" && rule.effect === "deny")).toBe(true)
  })

  test("the documented opt-in turns a denied tool back into an ask, never an allow", () => {
    const optIn = { action: "notion_notion-delete-pages", resource: "*", effect: "ask" as const }
    expect(evaluate([allow("*"), ...defaultRules(), optIn], "notion_notion-delete-pages")).toBe("ask")
  })
})

describe("insertRules", () => {
  test("splices the rules right after the base allow, before the agent's own rules", () => {
    const rules = defaultRules()
    for (const agent of builtInAgents()) {
      const before = agent.permissions.slice()
      expect(insertRules(agent.permissions, rules)).toBe(true)
      expect(agent.permissions).toEqual([before[0]!, ...rules, ...before.slice(1)])
    }
  })

  test("is idempotent, and finds the block after another plugin's", () => {
    const permissions = [allow("*")]
    insertRules(permissions, defaultRules())
    const once = permissions.slice()
    expect(insertRules(permissions, defaultRules())).toBe(false)
    expect(permissions).toEqual(once)
    const later = [allow("*"), allow("github_*"), ...defaultRules(), allow("notion_notion-create-comment")]
    expect(insertRules(later, defaultRules())).toBe(false)
  })

  test("only the whole block counts: the ask rule alone is not the block, so the block is added", () => {
    const own = [allow("*"), { ...ask }, allow("notion_notion-create-comment")]
    expect(hasDefaultRules(own)).toBe(false)
    expect(insertRules(own, defaultRules())).toBe(true)
    expect(own.slice(1, 1 + defaultRules().length)).toEqual(defaultRules())
  })

  test("leaves agents without a base allow untouched and never throws on odd lists", () => {
    for (const permissions of [[], [deny("*")], [allow("read")]] as Rule[][]) {
      const before = permissions.slice()
      expect(insertRules(permissions, defaultRules())).toBe(false)
      expect(permissions).toEqual(before)
    }
  })

  test("stricter agents stay stricter: Explore's own deny still wins", () => {
    const [, plan, explore] = builtInAgents() as [FakeAgent, FakeAgent, FakeAgent]
    insertRules(explore.permissions, defaultRules())
    expect(effects(explore.permissions)).toEqual(["deny", "deny", "deny", "deny", "deny", "deny"])
    insertRules(plan.permissions, defaultRules())
    expect(effects(plan.permissions)).toEqual(["allow", "allow", "ask", "deny", "ask", "deny"])
  })

  test("the user's rules come later and win, both ways", () => {
    const permissions = [allow("*")]
    insertRules(permissions, defaultRules())
    permissions.push(allow("notion_notion-create-comment"), { action: "notion_notion-delete-pages", resource: "*", effect: "ask" }, deny("notion_notion-search*"))
    expect(effects(permissions)).toEqual(["deny", "allow", "allow", "ask", "ask", "deny"])
  })
})

describe("registerDefaultRules", () => {
  test("adds the rules to every agent once per rebuild and reports no problem", async () => {
    const { transform, run } = transforms<AgentEditor>()
    const problems: (string | undefined)[] = []
    await registerDefaultRules({ transform }, defaultRules(), (problem) => problems.push(problem))
    for (let rebuild = 0; rebuild < 2; rebuild++) {
      const agents = builtInAgents()
      run(agentEditor(agents))
      for (const agent of agents) expect(agent.permissions.filter((rule) => rule.action === "notion_*")).toHaveLength(1)
    }
    expect(problems).toEqual([undefined, undefined])
  })

  test("never throws; a failure is reported for status", async () => {
    const { transform, run } = transforms<AgentEditor>()
    const problems: (string | undefined)[] = []
    await registerDefaultRules({ transform }, defaultRules(), (problem) => problems.push(problem))
    const broken = { ...agentEditor([]), list: () => { throw new Error("boom") } }
    expect(() => run(broken)).not.toThrow()
    expect(problems).toEqual([
      "RULES_NOT_ADDED: Notion's default permission rules could not be added (boom), so Notion tools may run without asking. Next step: Restart OpenCode.",
    ])
  })
})

describe("unguardedAgents", () => {
  test("names agents with a base allow, no block, and rules that would let a new Notion tool run", () => {
    const guarded = [allow("*"), ...defaultRules()]
    const agents = [
      { id: "build", permissions: guarded },
      { id: "reviewer", permissions: [allow("*")] },
      { id: "fixed", permissions: [allow("*"), ...defaultRules(), allow("notion_notion-create-comment")] },
      { id: "other-plugin-first", permissions: [allow("*"), allow("github_*"), ...defaultRules()] },
      { id: "block-before-base", permissions: [...defaultRules(), allow("*")] },
      { id: "ask-rule-only", permissions: [allow("*"), { ...ask }] },
      { id: "locked", permissions: [allow("*"), deny("*")] },
      { id: "denies-notion", permissions: [allow("*"), deny("notion_*")] },
      // No base allow: the plugin adds no rules there, and nothing needs fixing.
      { id: "own-allow-no-base", permissions: [allow("notion_*")] },
    ]
    expect(unguardedAgents(agents)).toEqual(["reviewer", "block-before-base"])
    expect(hasDefaultRules(guarded)).toBe(true)
    expect(hasDefaultRules([...defaultRules()])).toBe(false)
  })
})
