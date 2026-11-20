// A fake of the two Notion tools the pages source reads, notion-get-self and notion-search, as OpenCode's executors run
// them: each asserts `notion_<tool>` in the caller's permission first, as the host's executor does, then answers from
// test/fixtures/conformance.json in Notion's documented shapes. Every workspace, person and page in it is invented.
//
// The search keeps to what Notion documents and what a live call showed: `sort: "last_edited"` lists newest first,
// `filters.last_edited_date_range` takes whole dates (start and end inclusive, each optional) in a time zone Notion does
// not state, UTC unless a test names another, at most `page_size`
// results (50 at most) and no next page, and each result has an id, title, URL, type and `timestamp`, its last edit to
// the minute. `filters.created_by_user_ids` and `filters.edited_by_user_ids` keep the pages whose creator or editor is
// one of the ids, `"me"` being the signed-in user, as the tool's schema describes them. On a plan without the Business
// options, Notion drops the sort and the filters, runs no search for an empty query, and says so in `notices`.
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { signIns, type SignIns } from "../../src/source.js"

export const ROOT = join(import.meta.dir, "..", "..")

export interface FakePage {
  readonly id: string
  readonly type: "page" | "database"
  readonly title: string
  readonly edited: string
  /** The user who created it; the signed-in user when left out. */
  readonly createdBy?: string
  /** The user who last edited it; the signed-in user when left out. */
  readonly editedBy?: string
}

export interface Fixture {
  readonly now: string
  readonly self: { readonly workspace: { readonly id: string; readonly name: string }; readonly user: Record<string, string> }
  readonly otherWorkspace: string
  readonly pages: readonly FakePage[]
  /** A run of edits one minute apart, more than one search lists: `count` pages from `start`. */
  readonly dense: { readonly start: string; readonly count: number; readonly title: string }
}

export const FIXTURE = JSON.parse(readFileSync(join(ROOT, "test", "fixtures", "conformance.json"), "utf8")) as Fixture

/** The fixture's pages, the dense run included, each once. */
export function pagesOf(fixture: Fixture): FakePage[] {
  const start = Date.parse(fixture.dense.start)
  const dense = Array.from({ length: fixture.dense.count }, (_, index): FakePage => ({
    id: `2b3c4d5e-0000-4000-8000-${String(index).padStart(12, "0")}`,
    type: "page",
    title: `${fixture.dense.title} ${index + 1}`,
    edited: new Date(start + index * 60_000).toISOString(),
  }))
  return [...fixture.pages, ...dense]
}

/** How the fake answers. */
export interface FakeOptions {
  /** `free`: the plan drops the sort and the date filter, as Notion does below Business. */
  readonly plan?: "business" | "free"
  /** The server's state; a tool is listed only while it is connected. */
  readonly status?: "connected" | "needs_auth" | "failed"
  /** A Notion failure for this tool, as OpenCode's executor raises it. */
  readonly fail?: { readonly tool: string; readonly message: string }
  /** `dropped`: the search leaves the created-by and edited-by filters out and says so in `notices`, as it does for an option the plan lacks. */
  readonly authors?: "applied" | "dropped"
  /** Another notion-get-self answer. */
  readonly self?: unknown
  /** Every search's input, in order. */
  readonly searches?: Record<string, unknown>[]
  /** The hours Notion's date filter is from UTC, such as −5 or 5.5; 0 by default. */
  readonly zone?: number
  /** What probe recorded per sign-in; a new, empty record by default. */
  readonly signIns?: SignIns
  /** The pages, instead of the fixture's; read at each search, so a test can change them between calls. */
  readonly pages?: () => readonly FakePage[]
}

/** The date of a time in a zone `zone` hours from UTC. */
const dateIn = (iso: string, zone: number) => new Date(Date.parse(iso) + zone * 3_600_000).toISOString().slice(0, 10)

/** notion-search's answer for an input, over `pages`. */
export function searchAnswer(
  pages: readonly FakePage[],
  input: Record<string, unknown>,
  plan: "business" | "free" = "business",
  zone = 0,
  me = "",
  authors: "applied" | "dropped" = "applied",
): Record<string, unknown> {
  if (plan === "free") {
    return {
      results: [],
      type: "workspace_search",
      notices: [
        "These Business-plan options were omitted: sort, filters.last_edited_date_range. Results may be broader and use relevance sorting. These search options require a Business or Enterprise plan.",
        "No search was run because no supported constraints remain. Retry with a non-empty query or a supported filter.",
      ],
    }
  }
  const filters = (input["filters"] ?? {}) as { last_edited_date_range?: { start_date?: string; end_date?: string }; created_by_user_ids?: string[]; edited_by_user_ids?: string[] }
  const range = filters.last_edited_date_range ?? {}
  const size = Math.min(50, Math.max(1, Number(input["page_size"] ?? 10)))
  const ids = (list: string[] | undefined) => list?.map((id) => (id === "me" ? me : id))
  const [creators, editors] = authors === "applied" ? [ids(filters.created_by_user_ids), ids(filters.edited_by_user_ids)] : [undefined, undefined]
  const results = pages
    .filter((page) => creators === undefined || creators.includes(page.createdBy ?? me))
    .filter((page) => editors === undefined || editors.includes(page.editedBy ?? me))
    .filter((page) => (range.start_date === undefined || dateIn(page.edited, zone) >= range.start_date) && (range.end_date === undefined || dateIn(page.edited, zone) <= range.end_date))
    .sort((a, b) => Date.parse(b.edited) - Date.parse(a.edited))
    .slice(0, size)
    .map((page) => ({
      id: page.id,
      title: page.title,
      url: `https://app.notion.com/p/${page.id.replaceAll("-", "")}?pvs=204`,
      type: page.type,
      highlight: "",
      timestamp: new Date(Math.floor(Date.parse(page.edited) / 60_000) * 60_000).toISOString(),
    }))
  return {
    results,
    type: "workspace_search",
    ...(authors === "dropped" ? { notices: ["These options were omitted: filters.created_by_user_ids, filters.edited_by_user_ids. Results may be broader than requested."] } : {}),
  }
}

/** A Tool.Error without a cause, as OpenCode's executor raises Notion's own failure. */
export const toolError = (message: string) => Object.assign(new Error(message), { _tag: "Tool.Error" })

type Assert = (input: { readonly action: string; readonly resources: readonly string[] }) => Promise<void>

/** The plugin context the source reads through: Notion's two tools, the server's state, and the caller's permission. */
export function fakeContext(fixture: Fixture, assert: Assert, options: FakeOptions = {}) {
  const pages = options.pages ?? (() => pagesOf(fixture))
  const answers: Record<string, (input: Record<string, unknown>) => unknown> = {
    "notion-get-self": () => options.self ?? fixture.self,
    "notion-search": (input) => {
      options.searches?.push(input)
      return searchAnswer(pages(), input, options.plan, options.zone, fixture.self.user["id"] ?? "", options.authors)
    },
  }
  const status = options.status ?? "connected"
  const tools = Object.entries(answers).map(([name, answer]) => ({
    id: `notion_${name}`,
    execute: async (input: Record<string, unknown>) => {
      // OpenCode's executor asserts the tool's own action before it calls Notion.
      await assert({ action: `notion_${name}`, resources: ["*"] })
      if (options.fail?.tool === name) throw toolError(options.fail.message)
      return { content: [{ type: "text", text: JSON.stringify(answer(input)) }] }
    },
  }))
  return {
    tool: { list: async () => (status === "connected" ? tools : []) as never },
    mcp: { list: async () => ({ data: [{ name: "notion", status: { status } }] }) as never },
    permission: { assert: async (input: { action: string; resources: readonly string[] }) => assert({ action: input.action, resources: [...input.resources] }) },
    signIn: async () => "crd_conformance",
    signIns: options.signIns ?? signIns(),
  }
}

/** A tools RPC call's context. */
export const call = () => ({ sessionID: "ses_conformance", agent: "build", messageID: "msg_conformance", id: "call_conformance", signal: new AbortController().signal, progress: async () => {} })
