import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { accountsOf, resolveAccount } from "@we-the-rebel-alliance/plugin-contract/accounts"
import { checkManifest, hostInRange } from "@we-the-rebel-alliance/plugin-contract/manifest"
import { MAX_BYTES } from "../../src/handlers/events.ts"
import { URL_HOSTS } from "../../src/provider/notion.ts"
import { manifest } from "../../src/manifest.ts"

const root = join(import.meta.dirname, "..", "..")
const classCount = (name: string) => Object.values(manifest.methods).filter((method) => method.class === name).length

describe("the capabilities manifest", () => {
  test("validates, with the settled summary and host range", () => {
    expect(checkManifest(manifest)).toMatchObject({ ok: true })
    expect(manifest.plugin.summary.length).toBeLessThanOrEqual(400)
    expect(manifest.plugin.summary).not.toContain("\n")
    expect(manifest.plugin.host).toEqual({ opencode: ">=2.4.1 <2.5.0", tested: ["2.4.1"] })
    expect(hostInRange("2.4.1")).toBe(true)
    expect(hostInRange("2.5.0")).toBe(false)
    expect(manifest.accounts).toEqual({ via: "mcp", owner: "notion" })
  })

  test("classifies the 79 pass-through tools and the three own methods", () => {
    expect(Object.keys(manifest.methods)).toHaveLength(82)
    expect(Object.keys(manifest.methods).filter((method) => method.startsWith("mcp:"))).toHaveLength(79)
    expect(classCount("read")).toBe(41)
    expect(classCount("write")).toBe(19)
    expect(classCount("send")).toBe(7)
    expect(classCount("share")).toBe(1)
    expect(classCount("delete")).toBe(5)
    expect(classCount("export")).toBe(3)
    expect(classCount("admin")).toBe(6)
    expect(manifest.methods["mcp:notion-move-pages"]).toMatchObject({ class: "share", accounts: "none" })
    expect(manifest.methods["mcp:notion-restore-version"]).toMatchObject({ class: "delete" })
    expect(manifest.methods["mcp:notion-calendar-cancel-events"]).toMatchObject({ class: "delete" })
    expect(manifest.methods["mcp:notion-connector-search"]).toMatchObject({ class: "read", effect: "ask" })
    expect(manifest.methods["mcp:notion-ai-search"]).toMatchObject({ class: "read" })
    expect(manifest.methods["mcp:notion-ai-search"]?.effect).toBeUndefined()
    expect(Object.entries(manifest.methods).filter(([, method]) => method.accounts === "optional").map(([name]) => name)).toEqual(["probe", "events_list"])
    expect(Object.entries(manifest.methods).filter(([, method]) => method.effect === "ask").map(([name]) => name).sort()).toEqual([
      "mcp:notion-calendar-list-contacts",
      "mcp:notion-calendar-list-coworkers-events",
      "mcp:notion-connector-search",
      "mcp:notion-get-users",
      "mcp:notion-list-private-pages",
      "mcp:notion-list-session-events",
      "mcp:notion-memory-search",
      "mcp:notion-query-sessions",
      "mcp:notion-read-session-event",
      "mcp:notion-search-sessions",
    ])
  })

  test("declares the one events source and the account event", () => {
    expect(manifest.sources).toEqual([
      {
        id: "notion.pages",
        kind: "events",
        reads: "doc",
        method: "events_list",
        input: { source: "pages" },
        service: { id: "notion.pages", label: "Notion pages" },
        operations: ["notion-get-self", "notion-search"],
        cadence: { suggestMinutes: 10 },
        private: true,
        cost: { class: "free" },
        maxBytes: 65536,
        urlHosts: ["app.notion.com", "notion.so", "www.notion.so"],
      },
    ])
    expect(manifest.sources[0]?.urlHosts).toEqual([...URL_HOSTS])
    expect(manifest.sources[0]?.maxBytes).toBe(MAX_BYTES)
    expect(manifest.actions).toEqual([])
    expect(manifest.events).toEqual({ account: {} })
  })

  test("takes two empty profiles and refuses a missing or unknown alias", () => {
    const plan = accountsOf(manifest, { accounts: { work: {}, personal: {} } })
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.value.accounts.map((account) => account.alias)).toEqual(["work", "personal"])
    expect(resolveAccount(plan.value.accounts, {})).toMatchObject({ ok: false, code: "ACCOUNT_REQUIRED" })
    expect(resolveAccount(plan.value.accounts, { account: "nobodyhere" })).toMatchObject({ ok: false, code: "ACCOUNT_UNKNOWN" })
    expect(resolveAccount(plan.value.accounts, { account: "work" })).toEqual({ ok: true, alias: "work" })
  })

  test("has skill descriptions within the fixed-context budget", () => {
    for (const name of ["notion", "notion-write"]) {
      const text = readFileSync(join(root, "skills", name, "SKILL.md"), "utf8")
      const description = /^description:\s*(.+)$/m.exec(text)?.[1] ?? ""
      expect(description.length).toBeGreaterThan(0)
      expect(description.length).toBeLessThanOrEqual(300)
      expect(text).not.toMatch(/\bnotion(?:-[a-z0-9]+)?_[a-z]/)
    }
  })
})
