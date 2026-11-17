// The pages source (src/source.ts): events_list and probe over the fake Notion of test/support/fake-notion.ts, and the
// conformance report `npm run conformance` writes from the same fixture.
import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { encodeBoundCursor } from "@we-the-rebel-alliance/source-contract/cursor"
import { resultProblems, SourceError, type EventsListResult } from "@we-the-rebel-alliance/source-contract/events"
import { pluginError } from "../../src/host/tools-rpc.js"
import { PLUGIN_METHODS } from "../../src/notion-tools.js"
import { defaultRules, type Access } from "../../src/permissions.js"
import { EVENTS_ACTION, MAX_SEARCHES, PROBE_ACTION, SEARCH_PAGE, SOURCE, SOURCE_ID, URL_HOSTS, eventsMethod, identityOf, notionUrl, probeMethod, readSearch } from "../../src/source.js"
import { conformanceReports, declaredSources } from "../support/conformance.js"
import { FIXTURE, ROOT, call, fakeContext, pagesOf, type FakeOptions, type Fixture } from "../support/fake-notion.js"

const NOW = Date.parse(FIXTURE.now)
const ACCOUNT = FIXTURE.self.workspace.id

interface Harness {
  readonly asserted: string[]
  readonly searches: Record<string, unknown>[]
  list(input: Record<string, unknown>, now?: number): Promise<EventsListResult>
  probe(input: Record<string, unknown>): Promise<unknown>
}

function harness(options: FakeOptions = {}, fixture: Fixture = FIXTURE): Harness {
  const asserted: string[] = []
  const searches: Record<string, unknown>[] = []
  const ctx = fakeContext(fixture, async (input) => void asserted.push(input.action), { ...options, searches })
  return {
    asserted,
    searches,
    list: (input, now = NOW) => eventsMethod(ctx, () => now).run(input, call()) as Promise<EventsListResult>,
    probe: (input) => probeMethod(ctx).run(input, call()),
  }
}

/** The refusal's code and next step, as the tools RPC hands it to a script. */
async function refusal(work: Promise<unknown>) {
  try {
    await work
  } catch (error) {
    expect(error).toBeInstanceOf(SourceError)
    const failure = pluginError(error)!
    expect(failure.next).toMatch(/\.$/)
    return failure
  }
  throw new Error("expected a refusal")
}

/** Every event from `input` on, page by page, as a collector reads them. */
async function readAll(h: Harness, input: Record<string, unknown>) {
  const pages: EventsListResult[] = []
  let page = await h.list(input)
  pages.push(page)
  while (page.more) {
    page = await h.list({ cursor: page.cursor, ...(input["limit"] === undefined ? {} : { limit: input["limit"] }) })
    pages.push(page)
  }
  return pages
}

describe("events_list", () => {
  test("lists each settled edit once, oldest first, as a doc event with no content, no actors and Notion's link", async () => {
    const page = await harness().list({ since: "2026-11-15T00:00:00Z" })
    expect(resultProblems(page, 100, 65_536)).toEqual([])
    expect(page.events.map((event) => event.title)).toEqual(["Q4 planning", "Launch tracker", "Weekly sync", "Hiring plan"])
    expect(page.events[0]).toMatchObject({
      source: SOURCE,
      account: ACCOUNT,
      external_id: "1a2b3c4d-0000-4000-8000-000000000001@2026-11-15T09:12:00.000Z",
      kind: "doc",
      occurred_at: "2026-11-15T09:12:00.000Z",
      thread: "1a2b3c4d-0000-4000-8000-000000000001",
      actors: [],
      text: "",
      url: "https://app.notion.com/p/1a2b3c4d000040008000000000000001",
      labels: ["page"],
    })
    expect(page.events[1]!.labels).toEqual(["database"])
    expect(page.owner).toEqual({ id: "notion:5e1d9a2c-3f4b-4a6d-8c7e-1b2a3c4d5e01", label: "Avery Example" })
    expect(page).toMatchObject({ source: SOURCE, account: ACCOUNT, more: false, trust: "untrusted", plugin: "@joe-broadhead/opencode-notion", asOf: FIXTURE.now })
    // A title that holds a secret is refused for good, and named without its words.
    expect(page.refused).toEqual([{ external_id: "1a2b3c4d-0000-4000-8000-000000000003@2026-11-15T11:40:00.000Z", reason: "secret", detail: "holds a secret (token)" }])
    expect(JSON.stringify(page)).not.toContain("ghp_")
    expect(page.gap).toBeUndefined()
  })

  test("asserts its own action, then notion-get-self and notion-search, and nothing else", async () => {
    const h = harness()
    await h.list({ since: "2026-11-15T00:00:00Z" })
    expect(h.asserted).toEqual([EVENTS_ACTION, "notion_notion-get-self", "notion_notion-search"])
  })

  test("searches every edit since the cursor, sorted by last edit, with no highlight, from the earliest local date", async () => {
    const h = harness()
    await h.list({ since: "2026-11-15T06:00:00Z" })
    // 06:00 UTC is still 14 November at UTC−12.
    expect(h.searches).toEqual([{ query: "", sort: "last_edited", filters: { last_edited_date_range: { start_date: "2026-11-14" } }, page_size: SEARCH_PAGE, max_highlight_length: 0 }])
  })

  test("pages with a limit, and a cursor goes on where the last page stopped, never repeating or skipping an edit", async () => {
    const all = (await readAll(harness(), { since: "2026-11-15T00:00:00Z" })).flatMap((page) => page.events.map((event) => event.external_id))
    const paged = await readAll(harness(), { since: "2026-11-15T00:00:00Z", limit: 1 })
    // The third page holds only the refused page, and its cursor passes it.
    expect(paged.map((page) => page.events.length)).toEqual([1, 1, 0, 1, 1])
    expect(paged.map((page) => page.refused?.length ?? 0)).toEqual([0, 0, 1, 0, 0])
    expect(paged.slice(0, -1).every((page) => page.more)).toBe(true)
    expect(paged.at(-1)!.more).toBe(false)
    expect(paged.flatMap((page) => page.events.map((event) => event.external_id))).toEqual(all)
  })

  test("an empty page still names the owner and carries a cursor that reads on", async () => {
    const h = harness()
    const empty = await h.list({ since: "2026-11-16T09:00:00Z" })
    expect(empty.events).toEqual([])
    expect(empty.owner.id).toStartWith("notion:")
    expect(empty.cursor.length).toBeGreaterThan(0)
    expect((await h.list({ cursor: empty.cursor })).events).toEqual([])
  })

  test("an edit is listed only once its minute ended ten minutes ago, and then once", async () => {
    const h = harness()
    const first = await h.list({ since: "2026-11-16T00:00:00Z" })
    expect(first.events.map((event) => event.title)).toEqual(["Hiring plan"])
    const later = await h.list({ cursor: first.cursor }, Date.parse("2026-11-16T12:10:00Z"))
    expect(later.events.map((event) => event.title)).toEqual(["Draft still being edited"])
    expect((await h.list({ cursor: later.cursor }, Date.parse("2026-11-16T12:30:00Z"))).events).toEqual([])
  })

  test("a page edited again is a new event for the new edit time", async () => {
    const fixture: Fixture = { ...FIXTURE, pages: FIXTURE.pages.map((page) => (page.title === "Q4 planning" ? { ...page, edited: "2026-11-16T09:30:00.000Z" } : page)) }
    const first = await harness().list({ since: "2026-11-15T00:00:00Z" }, Date.parse("2026-11-16T09:00:00Z"))
    expect(first.events.map((event) => event.title)).toContain("Q4 planning")
    const second = await harness({}, fixture).list({ cursor: first.cursor })
    expect(second.events.map((event) => [event.title, event.external_id])).toEqual([["Q4 planning", "1a2b3c4d-0000-4000-8000-000000000001@2026-11-16T09:30:00.000Z"]])
  })

  test("more edits in about a day than one search lists answer gap window-truncated once, and the read goes on", async () => {
    const pages = await readAll(harness(), { since: "2026-11-10T00:00:00Z", limit: 5 })
    expect(pages[0]!.gap).toEqual({ reason: "window-truncated", since: "2026-11-10T00:00:00.000Z" })
    expect(pages[0]!.more).toBe(true)
    for (const page of pages.slice(1)) expect(page.gap).toBeUndefined()
    const titles = pages.flatMap((page) => page.events.map((event) => event.title))
    // The first eleven of the sixty could not be seen past the newer fifty; every later edit is listed once.
    expect(titles.slice(0, 2)).toEqual(["Import batch 12", "Import batch 13"])
    expect(titles.filter((title) => title.startsWith("Import batch"))).toHaveLength(49)
    expect(new Set(titles).size).toBe(titles.length)
    expect(titles.at(-1)).toBe("Hiring plan")
  })

  test("a long backlog the walk cannot finish within its searches is a gap, never a skipped edit it saw", async () => {
    // One edit an hour for 40 days: every search can step back only about a day.
    const start = Date.parse("2026-10-01T00:00:00Z")
    const fixture: Fixture = {
      ...FIXTURE,
      pages: Array.from({ length: 40 * 24 }, (_, index) => ({ id: `3c4d5e6f-0000-4000-8000-${String(index).padStart(12, "0")}`, type: "page" as const, title: `Hourly ${index}`, edited: new Date(start + index * 3_600_000).toISOString() })),
      dense: { ...FIXTURE.dense, count: 0 },
    }
    const h = harness({}, fixture)
    const page = await h.list({ since: "2026-10-01T00:00:00Z", limit: 500 })
    expect(h.searches).toHaveLength(MAX_SEARCHES)
    expect(page.gap).toEqual({ reason: "window-truncated", since: "2026-10-01T00:00:00.000Z" })
    const times = page.events.map((event) => Date.parse(event.occurred_at))
    expect(times).toEqual([...times].sort((a, b) => a - b))
    // Everything after the oldest edit it listed, up to the settled end, is there, hour by hour.
    for (let index = 1; index < times.length; index++) expect(times[index]! - times[index - 1]!).toBe(3_600_000)
  })

  test("a cursor never expires: an old one reads on from where it stopped", async () => {
    const old = encodeBoundCursor({ plugin: "notion", source: SOURCE, account: ACCOUNT }, { a: ACCOUNT, t: Date.parse("2026-11-14T00:00:00Z"), i: "" })
    const page = await harness().list({ cursor: old })
    expect(page.events.map((event) => event.title)).toEqual(["Q4 planning", "Launch tracker", "Weekly sync", "Hiring plan"])
  })

  test("refuses a cursor of another workspace, source or plugin, a malformed one, and one in another form", async () => {
    const t = NOW - 3_600_000
    const cases: [string, string][] = [
      [encodeBoundCursor({ plugin: "notion", source: SOURCE, account: FIXTURE.otherWorkspace }, { a: FIXTURE.otherWorkspace, t, i: "" }), "ACCOUNT_MISMATCH"],
      [encodeBoundCursor({ plugin: "notion", source: "comments", account: ACCOUNT }, { a: ACCOUNT, t, i: "" }), "CURSOR_INVALID"],
      [encodeBoundCursor({ plugin: "granola", source: SOURCE, account: ACCOUNT }, { a: ACCOUNT, t, i: "" }), "CURSOR_INVALID"],
      [encodeBoundCursor({ plugin: "notion", source: SOURCE, account: ACCOUNT }, { a: ACCOUNT, t: "soon", i: "" }), "CURSOR_INVALID"],
      ["not-a-cursor", "CURSOR_INVALID"],
    ]
    for (const [cursor, code] of cases) expect({ cursor: cursor.slice(0, 12), code: (await refusal(harness().list({ cursor }))).code }).toEqual({ cursor: cursor.slice(0, 12), code })
  })

  test("binds its cursor to the plugin, the source and the workspace", async () => {
    const page = await harness().list({ since: "2026-11-15T00:00:00Z", limit: 1 })
    const decoded = JSON.parse(Buffer.from(page.cursor, "base64url").toString("utf8")) as Record<string, unknown>
    expect(decoded).toMatchObject({ v: 2, s: SOURCE, a: ACCOUNT, t: Date.parse("2026-11-15T09:12:00Z"), i: "1a2b3c4d-0000-4000-8000-000000000001" })
  })

  test("refuses another workspace, another source, a scope and an unknown field, before any search", async () => {
    const h = harness()
    expect(await refusal(h.list({ account: FIXTURE.otherWorkspace }))).toMatchObject({ code: "ACCOUNT_MISMATCH", what: `Notion is signed in to another workspace than ${FIXTURE.otherWorkspace}` })
    expect((await refusal(h.list({ source: "comments" }))).code).toBe("SOURCE_UNKNOWN")
    expect((await refusal(h.list({ scope: { teamspaces: ["Design"] } }))).code).toBe("INPUT_INVALID")
    expect((await refusal(h.list({ query: "roadmap" }))).code).toBe("INPUT_INVALID")
    expect((await refusal(h.list({ limit: 501 }))).code).toBe("INPUT_INVALID")
    expect(h.searches).toEqual([])
    // The signed-in workspace by its own id, in any case, is accepted.
    expect((await h.list({ account: ACCOUNT.toUpperCase(), since: "2026-11-16T09:00:00Z" })).account).toBe(ACCOUNT)
  })

  test("a workspace below Business, whose search drops the sort and the date filter, is refused, not listed in another order", async () => {
    const failure = await refusal(harness({ plan: "free" }).list({}))
    expect(failure.code).toBe("UNAVAILABLE")
    expect(failure.what).toContain("Business or Enterprise")
    expect(failure.next).toContain("notion-get-tool-access")
  })

  test("Notion's own failure is UNAVAILABLE with a short reason, and rate_limited is RATE_LIMITED with its wait", async () => {
    const failed = await refusal(harness({ fail: { tool: "notion-search", message: "validation_error: body failed validation token=abc123secretvalue" } }).list({}))
    expect(failed).toEqual({ code: "UNAVAILABLE", what: "Notion's notion-search failed: validation_error: body failed validation token=[redacted]", next: "Call events_list again with the same cursor; if it keeps failing, run /notion-status." })
    const limited = await harness({ fail: { tool: "notion-search", message: 'rate_limited {"retry_after_seconds": 30}' } }).list({}).catch((error: unknown) => error)
    expect(limited).toBeInstanceOf(SourceError)
    expect(limited).toMatchObject({ code: "RATE_LIMITED", retryAfterSec: 30 })
  })

  test("a permission refusal passes through unchanged, for the tools RPC to report", async () => {
    const denied = Object.assign(new Error("Permission denied: notion_notion-search"), { _tag: "Tool.Error", error: new Error("denied") })
    const ctx = fakeContext(FIXTURE, async (input) => {
      if (input.action === "notion_notion-search") throw denied
    })
    expect(await eventsMethod(ctx, () => NOW).run({}, call()).catch((error: unknown) => error)).toBe(denied)
  })

  test("a server that needs a sign-in is NEEDS_SIGN_IN, and one that failed is UNAVAILABLE", async () => {
    expect((await refusal(harness({ status: "needs_auth" }).list({}))).code).toBe("NEEDS_SIGN_IN")
    expect((await refusal(harness({ status: "failed" }).list({}))).code).toBe("UNAVAILABLE")
  })

  test("refuses an answer it cannot read rather than list it: no results, another kind of search, or not newest first", () => {
    expect(() => readSearch("text")).toThrow("UNAVAILABLE")
    expect(() => readSearch({ type: "ai_search", results: [] })).toThrow("not a workspace search")
    const result = (id: string, timestamp: string) => ({ id, type: "page", title: "A", timestamp })
    expect(() => readSearch({ type: "workspace_search", results: [result("a", "2026-11-15T09:00:00.000Z"), result("b", "2026-11-15T10:00:00.000Z")] })).toThrow("newest first")
    // A result it cannot place in time is left out, and still counts.
    expect(readSearch({ type: "workspace_search", results: [result("a", "yesterday"), { id: "b", type: "page" }] })).toEqual({ items: [], count: 2 })
  })

  test("keeps only an https link on Notion's own hosts, without its query", () => {
    expect(notionUrl("https://app.notion.com/p/abc?pvs=204#x")).toBe("https://app.notion.com/p/abc")
    expect(notionUrl("https://www.notion.so/Page-abc")).toBe("https://www.notion.so/Page-abc")
    for (const url of ["http://app.notion.com/p/abc", "https://evil.example/p/abc", "https://app.notion.com.evil.example/p", "javascript:alert(1)", 42]) expect(notionUrl(url)).toBeNull()
    expect(URL_HOSTS).toEqual(declaredSources().items[0]!.urlHosts!)
  })
})

describe("probe", () => {
  test("names the workspace and the signed-in user from one notion-get-self read, and nothing else", async () => {
    const h = harness()
    expect(await h.probe({ source: SOURCE, account: ACCOUNT })).toEqual({
      source: SOURCE,
      account: ACCOUNT,
      owner: { id: "notion:5e1d9a2c-3f4b-4a6d-8c7e-1b2a3c4d5e01", label: "Avery Example" },
      trust: "untrusted",
    })
    expect(h.asserted).toEqual([PROBE_ACTION, "notion_notion-get-self"])
    expect(h.searches).toEqual([])
  })

  test("refuses another workspace with ACCOUNT_MISMATCH, and another source", async () => {
    expect(await refusal(harness().probe({ account: FIXTURE.otherWorkspace }))).toEqual({
      code: "ACCOUNT_MISMATCH",
      what: `Notion is signed in to another workspace than ${FIXTURE.otherWorkspace}`,
      next: "Sign in to that workspace (/connect, Notion), or read the workspace probe names.",
    })
    expect((await refusal(harness().probe({ source: "comments" }))).code).toBe("SOURCE_UNKNOWN")
    expect((await refusal(harness().probe({ account: ACCOUNT, extra: true }))).code).toBe("INPUT_INVALID")
  })

  test("labels the owner with the name, then the email, then the id, and refuses an answer with no ids", async () => {
    const user = FIXTURE.self.user
    expect(identityOf({ workspace: { id: "W1" }, user: { ...user, name: " " } })!.owner.label).toBe("avery@example.com")
    expect(identityOf({ workspace: { id: "W1" }, user: { type: "bot", id: "B1", name: "" } })).toEqual({ account: "w1", owner: { id: "notion:b1", label: "B1" } })
    expect(identityOf({ workspace: {}, user })).toBeUndefined()
    expect((await refusal(harness({ self: { workspace: { name: "Northwind" } } }).probe({}))).code).toBe("UNAVAILABLE")
    expect((await refusal(harness({ status: "needs_auth" }).probe({}))).code).toBe("NEEDS_SIGN_IN")
  })
})

describe("the pages source's declaration", () => {
  test("names this source, its tools RPC, its probe and the exact reads it asserts", () => {
    const sources = declaredSources()
    expect(sources.rpc).toBe("notion.workspace.tools")
    expect(sources.probe).toEqual({ action: PROBE_ACTION })
    const [item] = sources.items
    expect(item).toMatchObject({
      id: SOURCE_ID,
      kind: "events",
      reads: "doc",
      tool: "events_list",
      input: { source: SOURCE },
      accounts: { named: false },
      permission: { events: EVENTS_ACTION, operations: ["notion-get-self", "notion-search"], identity: ["notion-get-self"], readsIdentity: true },
      private: true,
      cost: { class: "free" },
      maxBytes: 65_536,
    })
    expect(sources.items).toHaveLength(1)
  })

  test("the default rules allow both of the plugin's own reads under every access", () => {
    for (const access of ["all", "ask-changes", "read-only"] as Access[]) {
      for (const method of PLUGIN_METHODS) expect({ access, method, effect: defaultRules(access).findLast((rule) => rule.action === `notion_${method}`)?.effect }).toEqual({ access, method, effect: "allow" })
    }
  })

  test("the conformance kit passes it, with every check that applies run", async () => {
    const [report] = await conformanceReports()
    expect(report!.problems).toEqual([])
    expect(report!.incomplete).toBe(false)
    expect(report!.ok).toBe(true)
    const ran = report!.checks.filter((check) => check.ran).map((check) => check.name)
    for (const name of ["declaration", "page-result", "gap-once-per-read", "refused-is-final", "probe", "identity-grants", "rpc-id", "unused-grants"]) expect(ran).toContain(name)
    const reasons = Object.fromEntries(report!.checks.filter((check) => check.reason !== undefined).map((check) => [check.name, check.reason]))
    expect(Object.keys(reasons).sort()).toEqual(["failed-holds-cursor", "gap-and-cursor-expired"])
  })

  test("the fixture is invented: no page of it has content, and its people are example people", () => {
    const text = readFileSync(join(ROOT, "test", "fixtures", "conformance.json"), "utf8")
    expect(text).toContain("example.com")
    expect(pagesOf(FIXTURE).length).toBe(FIXTURE.pages.length + FIXTURE.dense.count)
  })
})
