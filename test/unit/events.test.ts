import { describe, expect, test } from "vitest"
import { refusalOf } from "@we-the-rebel-alliance/plugin-contract/register"
import { eventsHandler, listEvents, SOURCE } from "../../src/handlers/events.ts"
import { identities } from "../../src/provider/identity.ts"
import { createProvider, type Edited, type Searched, type SearchRequest } from "../../src/provider/notion.ts"
import { methodCall } from "../support/call.ts"
import { NOW, WORKSPACES } from "../support/fake-notion.ts"
import { createFakeTools, type FakeWorkspace } from "../support/fake-tools.ts"

function eventsFor(workspaces: Readonly<Record<string, FakeWorkspace>> = WORKSPACES) {
  const fake = createFakeTools({ workspaces })
  const provider = createProvider({ tool: fake.tool, mcp: fake.mcp, owned: () => true })
  const cache = identities()
  return { fake, cache, handler: eventsHandler(provider, cache, () => NOW) }
}

const codeOf = (error: unknown) => refusalOf(error)?.code

describe("events_list", () => {
  test("lists the union of both author filters once per page, oldest first", async () => {
    const { handler } = eventsFor()
    const page = (await handler.run({ source: "pages", since: "2026-11-15" }, methodCall("work"))) as {
      source: string
      account: string
      events: { external_id: string; kind: string; text: string; actors: unknown[]; labels: string[]; url: string | null; occurred_at: string }[]
      owner: { id: string }
      trust: string
      more: boolean
    }
    expect(page.source).toBe(SOURCE)
    expect(page.account).toBe("work")
    expect(page.owner.id).toBe("notion:u-ana")
    expect(page.trust).toBe("untrusted")
    expect(page.more).toBe(false)
    expect(page.events.map((event) => event.external_id)).toEqual([
      "p-work-1@2026-11-18T10:15:00.000Z",
      "p-work-4@2026-11-18T11:00:00.000Z",
      "p-work-2@2026-11-19T08:40:00.000Z",
    ])
    expect(page.events[0]).toMatchObject({ kind: "doc", text: "", actors: [], labels: ["page"] })
    expect(page.events[1]?.url).toBeNull()
  })

  test("lists another alias's own pages", async () => {
    const { handler } = eventsFor()
    const page = (await handler.run({ source: "pages", since: "2026-11-15" }, methodCall("personal"))) as { events: { external_id: string }[] }
    expect(page.events.map((event) => event.external_id)).toEqual([
      "p-personal-2@2026-11-16T20:00:00.000Z",
      "p-personal-1@2026-11-17T19:05:00.000Z",
    ])
  })

  test("refuses one alias's cursor under another", async () => {
    const { handler } = eventsFor()
    const work = (await handler.run({ source: "pages", since: "2026-11-15" }, methodCall("work"))) as { cursor: string }
    await expect(handler.run({ source: "pages", cursor: work.cursor }, methodCall("personal"))).rejects.toSatisfy((error: unknown) => codeOf(error) === "CURSOR_INVALID")
  })

  test("answers an empty page for a window with no edits, and its cursor does not duplicate", async () => {
    const { handler } = eventsFor()
    const empty = (await handler.run({ source: "pages", since: "2026-11-20T00:00:00Z" }, methodCall("work"))) as { events: unknown[]; cursor: string; more: boolean }
    expect(empty.events).toEqual([])
    expect(empty.more).toBe(false)
    const again = (await handler.run({ source: "pages", cursor: empty.cursor }, methodCall("work"))) as { events: unknown[] }
    expect(again.events).toEqual([])
  })

  test("refuses an unknown source and an invalid input", async () => {
    const { handler } = eventsFor()
    await expect(handler.run({ source: "other" }, methodCall("work"))).rejects.toSatisfy((error: unknown) => codeOf(error) === "SOURCE_UNKNOWN")
    await expect(handler.run({ limit: 0 }, methodCall("work"))).rejects.toSatisfy((error: unknown) => codeOf(error) === "INPUT_INVALID")
  })

  test("refuses a search whose plan dropped the sort or the author filter", async () => {
    const { handler } = eventsFor({ work: { ...WORKSPACES.work, plan: "free" } })
    await expect(handler.run({ source: "pages", since: "2026-11-15" }, methodCall("work"))).rejects.toSatisfy((error: unknown) => {
      const refusal = refusalOf(error)
      return refusal?.code === "UNAVAILABLE" && /Business or Enterprise/.test(refusal.what)
    })
  })

  test("does not list an edit younger than the ten-minute settle", async () => {
    const at = new Date(NOW - 5 * 60_000).toISOString()
    const page = await listEvents(
      { search: async () => ({ items: [{ id: "p-recent", t: Date.parse(at), type: "page", title: "Just now", url: null }], count: 1 }) },
      "work",
      { owner: { id: "notion:u-ana", label: "Ana Silva" } },
      { since: NOW - 24 * 3_600_000, limit: 100 },
      NOW,
    )
    expect(page.events).toEqual([])
  })

  test("resumes after the (timestamp, page id) pair, so two edits at one time split without a skip or duplicate", async () => {
    const tie = "2026-11-18T10:15:00.000Z"
    const pages = [
      { id: "p-tie-a", type: "page" as const, title: "Tie A", edited_at: tie, edited_by: "u-ana", created_by: "u-ana" },
      { id: "p-tie-b", type: "page" as const, title: "Tie B", edited_at: tie, edited_by: "u-ana", created_by: "u-ana" },
    ]
    const { handler } = eventsFor({ work: { ...WORKSPACES.work, pages } })

    const first = (await handler.run({ source: "pages", since: "2026-11-15", limit: 1 }, methodCall("work"))) as { events: { external_id: string }[]; cursor: string; more: boolean }
    expect(first.events.map((event) => event.external_id)).toEqual([`p-tie-a@${tie}`])
    expect(first.more).toBe(true)
    if (first.events[0] === undefined) throw new Error("the first page must list one event")

    const second = (await handler.run({ source: "pages", cursor: first.cursor, limit: 1 }, methodCall("work"))) as { events: { external_id: string }[]; cursor: string; more: boolean }
    expect(second.events.map((event) => event.external_id)).toEqual([`p-tie-b@${tie}`])
    expect(second.more).toBe(false)
    if (second.events[0] === undefined) throw new Error("the second page must list one event")

    const third = (await handler.run({ source: "pages", cursor: second.cursor, limit: 1 }, methodCall("work"))) as { events: unknown[] }
    expect(third.events).toEqual([])
  })

  test("answers a hole as one gap on the page that passes it, and lists the edits after it", async () => {
    const above = Date.parse("2026-01-10T12:00:00.000Z")
    const older: Edited = { id: "p-old", t: Date.parse("2026-01-09T12:00:00.000Z"), type: "page", title: "Old", url: null }
    const filled: Edited[] = Array.from({ length: 50 }, (_, index) => ({ id: `p-${index}`, t: above, type: "page", title: `Page ${index}`, url: null }))
    const read = {
      async search(request: SearchRequest): Promise<Searched> {
        const end = request.filters.last_edited_date_range.end_date
        if (end === "2026-01-09") return { items: [older], count: 1 }
        if (end === "2026-01-10" || end === undefined) return { items: filled, count: 50 }
        return { items: [], count: 0 }
      },
    }
    const identity = { owner: { id: "notion:u-ana", label: "Ana Silva" } }
    const first = await listEvents(read, "work", identity, { since: Date.parse("2026-01-01"), limit: 100 }, Date.parse("2026-01-11T12:00:00Z"))
    expect(first.gap).toBeUndefined()
    expect(first.events.map((event) => event.external_id)).toEqual(["p-old@2026-01-09T12:00:00.000Z"])
    expect(first.more).toBe(true)

    const second = await listEvents(read, "work", identity, { cursor: first.cursor, limit: 100 }, Date.parse("2026-01-11T12:00:00Z"))
    expect(second.gap?.reason).toBe("window-truncated")
    expect(second.events).toHaveLength(50)
  })
})
