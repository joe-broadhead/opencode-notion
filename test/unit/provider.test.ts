import { describe, expect, test } from "vitest"
import { answerOf, createProvider, notionUrl } from "../../src/provider/notion.ts"
import { methodCall } from "../support/call.ts"
import { WORKSPACES } from "../support/fake-notion.ts"
import { createFakeTools, type FakeWorkspace } from "../support/fake-tools.ts"

const readerFor = (workspaces: Readonly<Record<string, FakeWorkspace>> = WORKSPACES) => {
  const fake = createFakeTools({ workspaces })
  const provider = createProvider({ tool: fake.tool, mcp: fake.mcp, owned: () => true })
  return { fake, reader: provider.reader("work", methodCall("work")) }
}

describe("the provider", () => {
  test("reads the alias's server, not another alias's", async () => {
    const { fake, reader } = readerFor()
    const identity = await reader.identity()
    expect(identity.owner.id).toBe("notion:u-ana")
    expect(identity.workspace).toEqual({ id: "ws-work", label: "Northwind Studio" })
    expect(fake.calls.map((call) => `${call.alias}:${call.tool}`)).toEqual(["work:notion-get-self"])
  })

  test("reads and orders a notion-search answer, with the URL host filter", async () => {
    const { reader } = readerFor()
    const answer = await reader.search({
      query: "",
      sort: "last_edited",
      filters: { last_edited_date_range: { start_date: "2026-11-15" }, edited_by_user_ids: ["me"] },
      page_size: 50,
      max_highlight_length: 0,
    })
    expect(answer.items.map((item) => item.id)).toEqual(["p-work-2", "p-work-4", "p-work-1"])
    expect(answer.items.find((item) => item.id === "p-work-1")?.url).toBe("https://app.notion.com/p/p-work-1")
    expect(answer.items.find((item) => item.id === "p-work-4")?.url).toBeNull()
  })

  test("refuses an alias whose server needs a sign-in", async () => {
    const { reader } = readerFor({ work: { ...WORKSPACES.work, status: "needs_auth" } })
    await expect(reader.identity()).rejects.toMatchObject({ code: "NEEDS_SIGN_IN" })
  })

  test("maps Notion's rate limit with its retry-after", async () => {
    const { reader } = readerFor({ work: { ...WORKSPACES.work, failure: "rate_limited retry_after_seconds 30" } })
    await expect(
      reader.search({
        query: "",
        sort: "last_edited",
        filters: { last_edited_date_range: { start_date: "2026-11-15" }, edited_by_user_ids: ["me"] },
        page_size: 50,
        max_highlight_length: 0,
      }),
    ).rejects.toMatchObject({ code: "RATE_LIMITED", retryAfterSec: 30 })
  })

  test("keeps only an https URL on a declared host, without its query", () => {
    expect(notionUrl("https://app.notion.com/p/one?pvs=4#top")).toBe("https://app.notion.com/p/one")
    expect(notionUrl("https://www.notion.so/two")).toBe("https://www.notion.so/two")
    expect(notionUrl("https://example.com/three")).toBeNull()
    expect(notionUrl("http://notion.so/four")).toBeNull()
    expect(notionUrl(42)).toBeNull()
  })

  test("reads a tool answer from structured output or its text", () => {
    expect(answerOf({ output: { a: 1 } })).toEqual({ a: 1 })
    expect(answerOf({ content: [{ type: "text", text: '{"b":2}' }] })).toEqual({ b: 2 })
    expect(answerOf({ content: "not json" })).toBeUndefined()
  })
})
