// A `notion` server the plugin does not manage is refused at entry, after permission, after tool discovery and before
// execute. The guard clears whatever identity was kept, so a later managed call cannot reuse it.
import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { descriptorHash } from "@we-the-rebel-alliance/source-contract/descriptor"
import { SourceError, type EventsListResult } from "@we-the-rebel-alliance/source-contract/events"
import { eventsMethod, identityOf, probeMethod, SOURCE, type SourceContext } from "../../src/source.js"
import { pluginError } from "../../src/host/tools-rpc.js"
import { FIXTURE, ROOT, call, fakeContext, toolError } from "../support/fake-notion.js"

const PROVIDER_ACTION = "notion_notion-"

type Tool = Awaited<ReturnType<SourceContext["tool"]["list"]>>[number]

/** Wrap one fake executor after its answer or rejection, so a test can flip ownership at the settle boundary. */
function wrapTool(ctx: SourceContext, name: string, behave: (run: () => Promise<unknown>) => Promise<unknown>): SourceContext {
  const list = ctx.tool.list
  return {
    ...ctx,
    tool: {
      list: async () =>
        (await list() as readonly Tool[]).map((entry) => (entry.id === `notion_${name}` ? { ...entry, execute: async (input: never, context: never) => behave(() => entry.execute(input, context)) } : entry)) as never,
    },
  }
}

async function refusal(work: Promise<unknown>) {
  try {
    await work
  } catch (error) {
    expect(error).toBeInstanceOf(SourceError)
    return pluginError(error)!
  }
  throw new Error("the call was not refused")
}

describe("a conflicting notion server", () => {
  test("is refused at entry, and a later managed call reads identity again", async () => {
    const known = fakeContext(FIXTURE, async () => {}).signIns
    known.set("crd_conformance", { account: "w1", owner: { id: "notion:u1", label: "U" } })
    const asserted: string[] = []
    const searches: Record<string, unknown>[] = []
    let owned = false
    const ctx = fakeContext(FIXTURE, async (input) => void asserted.push(input.action), { owned: () => owned, signIns: known, searches }) as SourceContext
    for (const pending of [
      eventsMethod(ctx).run({ since: "2026-11-15T00:00:00Z" }, call()),
      probeMethod(ctx).run({ source: SOURCE }, call()),
    ]) {
      expect((await refusal(pending)).code).toBe("UNAVAILABLE")
    }
    expect(asserted).toEqual([])
    expect(searches).toEqual([])
    expect(known.size).toBe(0)
    owned = true
    await eventsMethod(ctx).run({ since: "2026-11-15T00:00:00Z" }, call())
    expect(asserted.filter((action) => action.startsWith(PROVIDER_ACTION))).toContain("notion_notion-get-self")
  })

  test("a flip during permission refuses before tool discovery, with no provider dispatch and no reusable identity", async () => {
    const known = fakeContext(FIXTURE, async () => {}).signIns
    known.set("crd_conformance", { account: "w1", owner: { id: "notion:u1", label: "U" } })
    const asserted: string[] = []
    const searches: Record<string, unknown>[] = []
    let owned = true
    let release = () => {}
    const until = new Promise<void>((resolve) => (release = resolve))
    const ctx = fakeContext(FIXTURE, async (input) => {
      asserted.push(input.action)
      if (input.action === "notion_events_list") await until
    }, { owned: () => owned, signIns: known, searches }) as SourceContext
    const pending = eventsMethod(ctx).run({ since: "2026-11-15T00:00:00Z" }, call())
    await Bun.sleep(10)
    owned = false
    release()
    expect((await refusal(pending)).code).toBe("UNAVAILABLE")
    expect(asserted).toEqual(["notion_events_list"])
    expect(searches).toEqual([])
    expect(known.size).toBe(0)
  })

  test("a flip during tool discovery refuses before execute, with no provider dispatch and no reusable identity", async () => {
    const known = fakeContext(FIXTURE, async () => {}).signIns
    known.set("crd_conformance", { account: "w1", owner: { id: "notion:u1", label: "U" } })
    const asserted: string[] = []
    const searches: Record<string, unknown>[] = []
    let owned = true
    let release = () => {}
    const until = new Promise<void>((resolve) => (release = resolve))
    const base = fakeContext(FIXTURE, async (input) => void asserted.push(input.action), { owned: () => owned, signIns: known, searches })
    const ctx = { ...base, tool: { list: async () => { await until; return base.tool.list() } } } as SourceContext
    const pending = eventsMethod(ctx).run({ since: "2026-11-15T00:00:00Z" }, call())
    await Bun.sleep(10)
    owned = false
    release()
    expect((await refusal(pending)).code).toBe("UNAVAILABLE")
    expect(asserted).toEqual(["notion_events_list"])
    expect(searches).toEqual([])
    expect(known.size).toBe(0)
  })

  test("a conflict observed when an identity executor settles refuses before the mismatched identity is cached", async () => {
    const known = fakeContext(FIXTURE, async () => {}).signIns
    const self = { workspace: { id: "other-workspace", name: "Other" }, user: { id: "other-user", name: "Other" } }
    let owned = true
    let identities = 0
    let conflictOnce = true
    const base = fakeContext(FIXTURE, async () => {}, { owned: () => owned, signIns: known, self })
    const ctx = wrapTool(base as SourceContext, "notion-get-self", async (run) => {
      const result = await run()
      identities += 1
      if (conflictOnce) {
        conflictOnce = false
        owned = false
      }
      return result
    })
    expect((await refusal(eventsMethod(ctx).run({ since: "2026-11-15T00:00:00Z" }, call()))).code).toBe("UNAVAILABLE")
    expect(identities).toBe(1)
    expect(known.size).toBe(0)
    // A managed call after the conflict must read a fresh identity, not reuse the refused one.
    Object.assign(self, FIXTURE.self)
    owned = true
    const page = (await eventsMethod(ctx).run({ since: "2026-11-15T00:00:00Z" }, call())) as EventsListResult
    expect(page.account).toBe(FIXTURE.self.workspace.id)
    expect(identities).toBe(2)
    expect(known.get("crd_conformance")).toEqual(identityOf(FIXTURE.self))
  })

  test("a conflict observed when an executor rejects clears the warm cache and refuses, then a managed call reads identity again", async () => {
    const known = fakeContext(FIXTURE, async () => {}).signIns
    known.set("crd_conformance", identityOf(FIXTURE.self)!)
    const searches: Record<string, unknown>[] = []
    let owned = true
    let identities = 0
    let fail = true
    let base = fakeContext(FIXTURE, async () => {}, { owned: () => owned, signIns: known, searches }) as SourceContext
    base = wrapTool(base, "notion-get-self", async (run) => {
      identities += 1
      return run()
    })
    const ctx = wrapTool(base, "notion-search", async (run) => {
      if (fail) {
        fail = false
        owned = false
        throw toolError("search failed")
      }
      return run()
    })
    expect((await refusal(eventsMethod(ctx).run({ since: "2026-11-15T00:00:00Z" }, call()))).code).toBe("UNAVAILABLE")
    expect(known.size).toBe(0)
    expect(searches).toEqual([])
    owned = true
    const page = (await eventsMethod(ctx).run({ since: "2026-11-15T00:00:00Z" }, call())) as EventsListResult
    expect(page.account).toBe(FIXTURE.self.workspace.id)
    expect(identities).toBe(1)
    expect(searches.length).toBeGreaterThan(0)
    expect(known.get("crd_conformance")).toEqual(identityOf(FIXTURE.self))
  })

  test("a managed executor rejection keeps its ordinary error", async () => {
    const base = fakeContext(FIXTURE, async () => {}, { owned: () => true }) as SourceContext
    const ctx = wrapTool(base, "notion-search", async () => {
      throw toolError("search failed")
    })
    expect((await refusal(eventsMethod(ctx).run({ since: "2026-11-15T00:00:00Z" }, call()))).what).toContain("search failed")
  })

  test("the descriptor bytes and permissions are unchanged", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { sources: unknown }
    expect(descriptorHash(pkg.sources)).toBe("sha256:84999c23293513c479d0874feb55788548a87e2a2249608c792762f3916949d9")
    expect(JSON.stringify(pkg.sources)).not.toContain("readsIdentity")
  })
})
