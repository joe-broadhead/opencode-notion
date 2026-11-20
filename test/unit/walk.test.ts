// The pages source's walk back through Notion's search (src/source.ts), against a search whose whole-day date filter
// runs in a time zone the plugin is not told: every settled edit is listed once, or falls inside a hole the page that
// passes it names with `gap`, and a hole is only where 50 later edits of the same day hide it.
import { expect, test } from "bun:test"
import { listEvents, type Identity } from "../../src/source.js"

interface P {
  readonly id: string
  readonly t: number
}

const MIN = 60_000
const H = 3_600_000
const DAY = 24 * H
const NOW = Date.parse("2026-11-17T12:00:00Z")
const SIGNED_IN: Identity = { account: "ws-1", owner: { id: "notion:u-1", label: "U" } }
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`
/** The last minute whose edits the source lists at NOW: its minute ended ten minutes ago. */
const SETTLED = Math.floor((NOW - 10 * MIN) / MIN) * MIN - MIN

/** Notion's search: newest first, at most 50, whole local dates `zone` hours from UTC, ties in `ties` order. */
function reader(pages: () => readonly P[], zone: number, ties: "asc" | "desc" | "rand" = "desc", log?: unknown[]) {
  const localDate = (t: number) => new Date(t + zone * H).toISOString().slice(0, 10)
  return async (_tool: string, input: any) => {
    log?.push(input)
    const range = input.filters?.last_edited_date_range ?? {}
    const rows = pages()
      .map((page) => ({ ...page, t: Math.floor(page.t / MIN) * MIN }))
      .filter((page) => (!range.start_date || localDate(page.t) >= range.start_date) && (!range.end_date || localDate(page.t) <= range.end_date))
      .map((page) => ({ page, key: ties === "rand" ? Math.random() : 0 }))
      .sort((a, b) => b.page.t - a.page.t || (ties === "asc" ? (a.page.id < b.page.id ? -1 : 1) : ties === "desc" ? (a.page.id < b.page.id ? 1 : -1) : a.key - b.key))
      .slice(0, 50)
      .map(({ page }) => ({ id: page.id, title: `T ${page.id}`, url: null, type: "page", timestamp: new Date(page.t).toISOString() }))
    return { content: [{ type: "text", text: JSON.stringify({ type: "workspace_search", results: rows }) }] } as never
  }
}

/** Every page of a read, as a collector drains it. */
async function drain(read: ReturnType<typeof reader>, since: string, limit: number) {
  const events: any[] = []
  const gaps: { since: number; first: number | undefined }[] = []
  let cursor: string | undefined
  for (let pageNo = 0; pageNo < 500; pageNo++) {
    const page = await listEvents(read, async () => SIGNED_IN, cursor ? { cursor, limit } : { since, limit }, NOW)
    events.push(...page.events)
    if (page.gap) gaps.push({ since: Date.parse(page.gap.since), first: page.events[0] ? Date.parse(page.events[0].occurred_at) : undefined })
    cursor = page.cursor
    if (!page.more) return { events, gaps }
  }
  throw new Error("the read never ended")
}

/** Each settled edit listed once, or inside a gap: after the gap's since and before the first event of its page. */
function accounted(pages: readonly P[], events: readonly any[], gaps: readonly { since: number; first: number | undefined }[]) {
  const ids = events.map((event) => event.external_id)
  expect(new Set(ids).size).toBe(ids.length)
  const listed = new Set(events.map((event) => event.thread))
  const missing = pages.filter((page) => Math.floor(page.t / MIN) * MIN <= SETTLED && !listed.has(page.id))
  for (const page of missing) {
    const t = Math.floor(page.t / MIN) * MIN
    expect({ id: page.id, inGap: gaps.some((gap) => t >= gap.since && (gap.first === undefined || t <= gap.first)) }).toEqual({ id: page.id, inGap: true })
  }
  // Oldest first across the whole read.
  const times = events.map((event) => Date.parse(event.occurred_at))
  expect(times).toEqual([...times].sort((a, b) => a - b))
  return missing.length
}

/** `perDay` edits a day, evenly spaced, for six days up to an hour ago. */
const steady = (perDay: number) => Array.from({ length: perDay * 6 }, (_, n): P => ({ id: id(n), t: NOW - H - 6 * DAY + (n + 1) * (DAY / perDay) }))

for (const zone of [-12, -5, 0, 5.5, 14]) {
  test(`35 edits a day over six days, date filter at UTC${zone >= 0 ? "+" : ""}${zone}: every edit listed once, no gap`, async () => {
    const pages = steady(35)
    const { events, gaps } = await drain(reader(() => pages, zone), new Date(NOW - 7 * DAY).toISOString(), 20)
    expect(gaps).toEqual([])
    expect(accounted(pages, events, gaps)).toBe(0)
    expect(events).toHaveLength(pages.filter((page) => page.t <= SETTLED).length)
  })

  test(`50 edits a day over six days, date filter at UTC${zone >= 0 ? "+" : ""}${zone}: every edit listed once`, async () => {
    // A local day whose answer is a full 50 may hide a 51st before them, so its start is a gap; none is lost here.
    const pages = steady(50)
    const { events, gaps } = await drain(reader(() => pages, zone), new Date(NOW - 7 * DAY).toISOString(), 20)
    expect(accounted(pages, events, gaps)).toBe(0)
    expect(events).toHaveLength(pages.filter((page) => page.t <= SETTLED).length)
  })

  test(`200 edits a day over six days, date filter at UTC${zone >= 0 ? "+" : ""}${zone}: only what 50 later edits of the same day hide is lost, each loss under a gap`, async () => {
    const pages = steady(200)
    const { events, gaps } = await drain(reader(() => pages, zone), new Date(NOW - 7 * DAY).toISOString(), 100)
    const missing = accounted(pages, events, gaps)
    expect(gaps.length).toBeGreaterThan(0)
    // Each local day's last 50 edits are reachable, so at least about 50 a day are listed, in every zone.
    expect(events.length).toBeGreaterThanOrEqual(6 * 50 - 50)
    expect(missing + events.length).toBe(pages.filter((page) => page.t <= SETTLED).length)
  })
}

test("ties: 45 pages in one minute, limit 7, random tie order: each once", async () => {
  const pages = Array.from({ length: 45 }, (_, n): P => ({ id: id(n), t: Date.parse("2026-11-17T09:00:20Z") }))
  const { events, gaps } = await drain(reader(() => pages, 0, "rand"), "2026-11-17T08:00:00Z", 7)
  expect(gaps).toEqual([])
  expect(new Set(events.map((event) => event.external_id)).size).toBe(45)
})

test("a bulk edit of 60 rows in one minute hides the earlier edits of its own day only, under one gap", async () => {
  const pages: P[] = [
    ...Array.from({ length: 5 }, (_, n): P => ({ id: id(n), t: Date.parse("2026-11-16T08:00:00Z") + n * MIN })),
    ...Array.from({ length: 10 }, (_, n): P => ({ id: id(100 + n), t: Date.parse("2026-11-17T08:00:00Z") + n * MIN })),
    ...Array.from({ length: 60 }, (_, n): P => ({ id: id(200 + n), t: Date.parse("2026-11-17T09:00:00Z") })),
  ]
  const { events, gaps } = await drain(reader(() => pages, 0), "2026-11-16T00:00:00Z", 100)
  accounted(pages, events, gaps)
  // The day before is listed; the ten edits before the bulk on its day, and the ten rows of the bulk search could not
  // show, are under the gap; the fifty rows it showed are listed after it.
  expect(events.map((event) => event.thread).slice(0, 5)).toEqual(Array.from({ length: 5 }, (_, n) => id(n)))
  expect(events.slice(5).every((event) => event.occurred_at === "2026-11-17T09:00:00.000Z")).toBe(true)
  expect(events).toHaveLength(55)
  expect(gaps).toEqual([{ since: Date.parse("2026-11-16T08:04:00Z"), first: Date.parse("2026-11-17T09:00:00Z") }])
})

test("polling a busy workspace every quarter hour: no gap while fewer than 50 edits land between reads", async () => {
  // One edit every 50 seconds, about 18 between reads: each read sees only what was edited by then.
  const pages = Array.from({ length: 200 }, (_, n): P => ({ id: id(n), t: NOW - 3 * H + n * 50_000 }))
  let at = NOW - 2 * H
  const read = reader(() => pages.filter((page) => page.t <= at), 0)
  const since = at - 30 * MIN
  const first = await listEvents(read, async () => SIGNED_IN, { since: new Date(since).toISOString(), limit: 500 }, at)
  expect(first.gap).toBeUndefined()
  const listed = [...first.events]
  let cursor = first.cursor
  for (at += 15 * MIN; at <= NOW; at += 15 * MIN) {
    const page = await listEvents(read, async () => SIGNED_IN, { cursor, limit: 500 }, at)
    expect(page.gap).toBeUndefined()
    listed.push(...page.events)
    cursor = page.cursor
  }
  expect(listed.map((event) => event.thread)).toEqual(pages.filter((page) => page.t >= since && Math.floor(page.t / MIN) * MIN <= SETTLED).map((page) => page.id))
})

test("a truncated read with more answers its gap once, never repeats an edit, and stays within its searches", async () => {
  const pages = Array.from({ length: 120 }, (_, n): P => ({ id: id(n), t: Date.parse("2026-11-17T00:30:00Z") + n * 5 * MIN }))
  const log: unknown[] = []
  const { events, gaps } = await drain(reader(() => pages, 0, "desc", log), new Date(NOW - 3 * DAY).toISOString(), 5)
  accounted(pages, events, gaps)
  expect(gaps).toHaveLength(1)
})
