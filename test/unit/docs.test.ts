// The docs and skills must match the code: tool names, the deny rules, error codes, the uninstall order and the Jelly
// guide. Every tool count they state is checked against src/notion-tools.ts, so a change there cannot leave a stale
// number behind.
import { describe, expect, test } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { DENY_TOOLS, READ_TOOLS, WRITE_TOOLS } from "../../src/notion-tools.js"

const ROOT = fileURLToPath(new URL("../..", import.meta.url))
// Everything a user or the model reads about the current release.
const FILES = [
  "README.md",
  "SECURITY.md",
  "CONTRIBUTING.md",
  "CHANGELOG.md",
  "AGENTS.md",
  ...readdirSync(join(ROOT, "docs")).map((name) => `docs/${name}`),
  ...readdirSync(join(ROOT, "skills")).map((name) => `skills/${name}/SKILL.md`),
]
const KNOWN = [...READ_TOOLS, ...WRITE_TOOLS, ...DENY_TOOLS]
const text = (file: string) => readFileSync(join(ROOT, file), "utf8").replace(/\s+/g, " ")
const rule = (name: string, effect: string) => `{ "action": "notion_${name}", "resource": "*", "effect": "${effect}" }`

describe("docs", () => {
  test.each(FILES)("%s states no count of read, write or declared tools that could go stale", (file) => {
    const counts = [...text(file).matchAll(/\b\d+ (?:known )?(?:read|write)(?:s\b| tools\b)|\b\d+ tools are declared/g)].map((match) => match[0])
    const stale = counts.filter((count) => !count.startsWith(`${READ_TOOLS.length} read`) && !count.startsWith(`${WRITE_TOOLS.length} write`) && count !== `${KNOWN.length} tools are declared`)
    expect(stale).toEqual([])
  })

  test.each(FILES)("%s names only Notion tools the plugin knows", (file) => {
    const named = [...text(file).matchAll(/\bnotion_(notion-[a-z0-9-]+)(?![\w*-])/g)].map((match) => match[1]!)
    expect(named.filter((tool) => !KNOWN.includes(tool))).toEqual([])
    const spans = [...text(file).matchAll(/`notion-([a-z0-9-]+)`/g)].map((match) => `notion-${match[1]!}`)
    expect(spans.filter((tool) => !KNOWN.includes(tool) && tool !== "notion-write").length).toBeLessThan(1)
  })

  test.each(["README.md", "docs/configuration.md", "docs/scripting.md", "docs/jelly.md", "SECURITY.md"])("%s says nothing provisional or pending", (file) => {
    expect(text(file)).not.toMatch(/provisional|not yet (?:checked|published|signed)|private package|TODO/i)
  })

  // D1: the guard is text, not a rule, and the README says why where a stranger reads the permissions.
  test("the README says a rule cannot see an argument, and gives the deny that removes the whole-page path", () => {
    const readme = text("README.md")
    expect(readme).toContain("A permission rule matches a tool's name, not its arguments")
    expect(readme).toContain("`notion-update-page` is the commonest change and stays at `ask`")
    expect(readme).toContain("Read the input shown in the permission prompt before you answer yes")
    expect(readme).toContain('{ "permissions": [{ "action": "notion_notion-update-page", "resource": "*", "effect": "deny" }] }')
    expect(readme).toContain("The permission prompt is the only guard for a whole-page replacement")
  })

  test("the README's sign-in says the account is marked only while it is still listed", () => {
    expect(text("README.md")).toContain("OpenCode asks for a new sign-in, and `/connect` marks the account while it is still listed")
  })

  test("the README names no version of the plugin, not even in an example", () => {
    expect(text("README.md")).not.toMatch(/opencode-notion@\d|\b0\.\d+\.\d+\b|\bv\d+\.\d+\.\d+\b/)
  })

  test("the README and the configuration guide give each denied tool its deny rule, and the guide the ask rule that turns it on", () => {
    for (const name of DENY_TOOLS) {
      for (const file of ["README.md", "docs/configuration.md"]) expect(text(file)).toContain(rule(name, "deny"))
      expect(text("docs/configuration.md")).toContain(rule(name, "ask"))
      // The opt-in is a per-call ask, never an allow.
      for (const file of FILES) expect(text(file)).not.toContain(rule(name, "allow"))
    }
    expect(text("skills/notion-write/SKILL.md")).toContain(rule("notion-delete-pages", "ask"))
  })

  test.each(FILES)("%s puts no ask or allow recipe for a Notion tool at the top level, where it would reach Explore", (file) => {
    const raw = readFileSync(join(ROOT, file), "utf8")
    // Every JSON example that is a config: its top-level permissions only tighten.
    for (const [, body] of raw.matchAll(/```json\n([^]*?)```/g)) {
      let config: unknown
      try {
        config = JSON.parse(body!)
      } catch {
        continue
      }
      const top = !Array.isArray(config) && typeof config === "object" && config !== null ? ((config as { permissions?: { action: string; effect: string }[] }).permissions ?? []) : []
      expect(top.filter((item) => item.action.startsWith("notion_") && item.effect !== "deny")).toEqual([])
    }
    // Every ask or allow rule for one tool sits in an agent's own rules, said in its paragraph or code block. The
    // plugin's own block, which the plugin inserts itself, is the one exception.
    const blocks = raw.split(/\n\s*\n/)
    blocks.forEach((block, index) => {
      if (!/\{ "action": "notion_notion-[a-z0-9-]+", "resource": "\*", "effect": "(?:ask|allow)" \}/.test(block)) return
      const context = `${blocks[index - 1] ?? ""}\n${block}`
      if (/The plugin adds these\s+rules/.test(context)) return
      // "in your permissions or an agent's own" offers the top level too: it fails.
      const agentLevel = /agent's own|"agents"/.test(context) && !/\b(?:in|to) (?:your|the same) `permissions`|here or in an agent's own/.test(context.replace(/\s+/g, " "))
      expect({ file, block: block.slice(0, 120), agentLevel }).toEqual({ file, block: block.slice(0, 120), agentLevel: true })
    })
  })

  test("the strict-agent recipe repeats every deny after its notion_* ask, so no denied tool reopens", () => {
    const recipe = text("docs/configuration.md").split("A strict agent where every Notion tool asks")[1]?.split("```")[1] ?? ""
    const ask = recipe.indexOf(rule("*", "ask"))
    expect(ask).toBeGreaterThanOrEqual(0)
    for (const name of DENY_TOOLS) expect(recipe.indexOf(rule(name, "deny"))).toBeGreaterThan(ask)
  })

  test("the docs sign in only with OAuth, or with a workspace owner's MCP token held in an env var, never a pasted key", () => {
    expect(text("README.md")).toContain("No integration token or API key is needed or used.")
    expect(text("docs/configuration.md")).toContain("Notion's server signs in with OAuth")
    expect(text("docs/configuration.md")).toContain('"Authorization": "Bearer {env:NOTION_MCP_TOKEN}"')
    for (const file of FILES) expect(text(file)).not.toMatch(/Bearer (?!\{env:)[A-Za-z0-9_-]{8,}|NOTION_API_KEY/)
  })

  // BUILD-LESSONS, "The scope request": the pin, the fallback it prevents, and the reason it is safe with CIMD.
  test("the docs pin the one scope, name the wider fallback, and still sign in with the client metadata document", () => {
    const configuration = text("docs/configuration.md")
    expect(configuration).toContain('"oauth": { "scope": "default" }')
    expect(configuration).toContain("ema_issuer:manage")
    expect(configuration).toContain("falls back to every advertised scope")
    expect(configuration).toContain("client metadata document")
    expect(text("README.md")).toContain("asks Notion for its one scope, `default`")
    expect(text("docs/architecture.md")).toContain("else **every** scope in the protected-resource metadata")
  })

  // Once the plugin is removed and OpenCode reloads, `mcp logout notion` finds no server: sign out first.
  test("the README's Uninstall signs out before it removes the plugin", () => {
    const uninstall = /## Uninstall(.*?)## Links/.exec(text("README.md"))?.[1] ?? ""
    const logout = uninstall.indexOf("opencode mcp logout notion")
    const list = uninstall.indexOf("opencode auth list")
    const remove = uninstall.indexOf("opencode plugin remove @joe-broadhead/opencode-notion")
    expect(logout).toBeGreaterThanOrEqual(0)
    expect(list).toBeGreaterThan(logout)
    expect(remove).toBeGreaterThan(list)
  })

  // Every code the plugin's own code raises (the tools RPC's are in docs/scripting.md) has no service prefix and a row
  // in the configuration guide's Errors table.
  test("the configuration guide documents every error code the plugin raises, none with a service prefix", () => {
    const sources = readdirSync(join(ROOT, "src")).filter((name) => name.endsWith(".ts"))
    const codes = new Set(sources.flatMap((name) => [...readFileSync(join(ROOT, "src", name), "utf8").matchAll(/(?:notionError|errorText)\(\s*"([A-Z][A-Z_]+)"/g)].map((match) => match[1]!)))
    expect(codes.size).toBeGreaterThan(3)
    const errors = /## Errors(.*?)## /.exec(text("docs/configuration.md"))?.[1] ?? ""
    const troubleshooting = /## Troubleshooting(.*?)## /.exec(text("README.md"))?.[1] ?? ""
    for (const code of codes) {
      expect(code).not.toStartWith("NOTION_")
      expect(errors).toContain(`| \`${code}\` |`)
      // Every code the plugin raises has a README troubleshooting row too.
      expect({ code, inReadme: troubleshooting.includes(`| \`${code}\` |`) }).toEqual({ code, inReadme: true })
    }
  })

  test("the configuration guide's Errors table lists only codes the plugin raises", () => {
    const sources = readdirSync(join(ROOT, "src")).filter((name) => name.endsWith(".ts") && name !== "tools-rpc.ts")
    const raised = sources.map((name) => readFileSync(join(ROOT, "src", name), "utf8")).join("\n")
    const errors = /## Errors(.*?)## /.exec(text("docs/configuration.md"))?.[1] ?? ""
    const documented = [...errors.matchAll(/\| `([A-Z][A-Z_]+)` \|/g)].map((match) => match[1]!)
    expect(documented.length).toBeGreaterThan(5)
    expect(documented.filter((code) => !raised.includes(`"${code}"`) && !raised.includes(`${code}:`))).toEqual([])
  })

  test("the Jelly guide describes the declaration as Jelly reads it, with no placeholder or version", () => {
    const guide = text("docs/jelly.md")
    expect(guide).not.toMatch(/`latest` is|None yet/)
    expect(guide).toContain("the one line in `jelly.summary`, and beside it the mark in `jelly.icon`")
    // Jelly's contracts drop an unknown top-level key; they do not refuse the declaration for it.
    expect(guide).toContain("drop a top-level key they don't know")
    expect(guide).not.toMatch(/refuses this declaration|accepts no unknown keys/)
    // A tool Notion adds later is undeclared, and Jelly runs it unasked: the guide says so plainly, a write included.
    expect(guide).toContain("A tool Notion adds later, a write included, is not declared, so in Jelly it is not asked about")
    expect(guide).toContain("it runs without asking, even if it changes something")
    const off = guide.split("- Off:")[1]?.split("- Everything else")[0] ?? ""
    for (const name of DENY_TOOLS) expect(off).toContain(`\`notion_${name}\``)
    const skills = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).jelly.skills as string[]
    expect(guide).toContain(`Declared: ${skills.map((name) => `\`${name}\``).join(", ")}.`)
  })

  test("the scripting guide points at the known reads, and gives Notion's rate limits with one call at a time", () => {
    const guide = text("docs/scripting.md")
    expect(guide).toContain("(`READ_TOOLS` in `src/notion-tools.ts`)")
    expect(guide).toContain("180 requests a minute")
    expect(guide).toContain("600 requests a minute")
    expect(guide).toContain("one at a time")
    expect(guide).toContain("never retry a write")
  })

  test("the README's limits name the plans each tool group needs, and the two limits of a shared sign-in", () => {
    const readme = text("README.md")
    expect(readme).toContain("separate OpenCode processes on one credential")
    expect(readme).toContain("refreshes its own token")
    expect(readme).toContain("approved list")
    expect(readme).toContain("Notion stores workspace data in the United States")
    expect(readme).toContain("has not been reconciled with a live tool list")
  })
})
