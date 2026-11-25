import type { Plugin } from "@opencode/plugin"
import { accountName } from "@we-the-rebel-alliance/plugin-contract/accounts"
import { toolAction } from "@we-the-rebel-alliance/plugin-contract/access"
import type { Owner } from "@we-the-rebel-alliance/plugin-contract/manifest"

/** The identity read, and the search the listing reads. */
export const SELF_TOOL = "notion-get-self"
export const SEARCH_TOOL = "notion-search"

/** The hosts an event's URL may name; any other URL is left out. The source's `urlHosts`. */
export const URL_HOSTS: readonly string[] = ["app.notion.com", "notion.so", "www.notion.so"]

const ID = /^[\w-]{1,128}$/
const ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:?\d{2})$/
const OWNER_LABEL_MAX = 200

/** The call facts the provider passes to OpenCode's MCP tool executor. */
export interface CallContext {
  readonly sessionID: string
  readonly agent: string
  readonly messageID: string
  readonly id: string
  readonly signal: AbortSignal
  readonly progress: (update?: Readonly<Record<string, unknown>>) => Promise<void>
}

/** One page or database as `notion-search` lists it, with the time it was last edited. */
export interface Edited {
  readonly id: string
  /** Epoch milliseconds, to the minute. */
  readonly t: number
  readonly type: "page" | "database"
  readonly title: string
  readonly url: string | null
}

/** One search: what it listed that can be placed in time, and how many results it held in all. */
export interface Searched {
  readonly items: readonly Edited[]
  readonly count: number
}

/** What `notion-search` is asked for: an empty query, the last-edit sort, a whole-day range and one author filter. */
export interface SearchRequest {
  readonly query: ""
  readonly sort: "last_edited"
  readonly filters: {
    readonly last_edited_date_range: { readonly start_date: string; readonly end_date?: string }
    readonly edited_by_user_ids?: readonly ["me"]
    readonly created_by_user_ids?: readonly ["me"]
  }
  readonly page_size: number
  readonly max_highlight_length: 0
}

/** Who is signed in to one alias: the user, and the workspace when the answer names it. */
export interface Identity {
  readonly owner: Owner
  /** The workspace's id and label, for `owner.orgs`; absent when the answer names no workspace. */
  readonly workspace?: { readonly id: string; readonly label: string }
}

/** One alias's transport, as a handler uses it. Both reads go through the same MCP tool list. */
export interface NotionReader {
  identity(): Promise<Identity>
  search(request: SearchRequest): Promise<Searched>
}

/** The provider a handler is built with. */
export interface NotionProvider {
  reader(alias: string, call: CallContext): NotionReader
}

type HostTool = Awaited<ReturnType<Plugin.Context["tool"]["list"]>>[number]
type HostResult = Awaited<ReturnType<HostTool["execute"]>>

/** The dependencies of the real provider: OpenCode's tools, its MCP server states, and the aliases' names. */
export interface ProviderOptions {
  readonly tool: Pick<Plugin.Context["tool"], "list">
  readonly mcp: Pick<Plugin.Context["mcp"], "list">
  /** False for an alias whose server is not this plugin's, such as the user's own `notion` at another URL. */
  readonly owned: (alias: string) => boolean
}

const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value)
const oneLine = (value: string) => value.replace(/\s+/g, " ").trim()

/** At most `max` characters, ending in `…` when cut, never splitting a surrogate pair. */
function cut(text: string, max: number): string {
  if (text.length <= max) return text
  let end = Math.max(0, max - 1)
  const code = text.charCodeAt(end - 1)
  if (end > 0 && code >= 0xd800 && code <= 0xdbff) end--
  return `${text.slice(0, end)}…`
}

/**
 * A refusal in the contract's form, raised by the provider and passed on by the register: any error carrying `code`,
 * `what` and `next` is read as itself, so the provider needs no contract class.
 */
export class ProviderError extends Error {
  readonly code: string
  readonly what: string
  readonly next: string
  readonly retryAfterSec?: number
  constructor(code: string, what: string, next: string, retryAfterSec?: number) {
    super(`${code}: ${what.replace(/[.\s]+$/, "")}. Next step: ${next}`)
    this.name = "ProviderError"
    this.code = code
    this.what = what
    this.next = next
    if (retryAfterSec !== undefined) this.retryAfterSec = retryAfterSec
  }
}

/** An https link on one of Notion's hosts, without its query or fragment; null for anything else. */
export function notionUrl(value: unknown): string | null {
  if (typeof value !== "string") return null
  try {
    const url = new URL(value)
    return url.protocol === "https:" && URL_HOSTS.includes(url.hostname) ? `${url.origin}${url.pathname}` : null
  } catch {
    return null
  }
}

const failure = (code: string, what: string, next: string, retryAfterSec?: number) => new ProviderError(code, what, next, retryAfterSec)

/** The user's `notion` entry is another server, so no alias may call it. */
export const serverConflict = () =>
  failure(
    "UNAVAILABLE",
    "The notion MCP server in this project is not Notion's, so this source does not call it",
    "Point mcp.servers.notion at the Notion MCP server URL or remove it, then call the method again.",
  )

const ownerUnknown = () =>
  failure("UNAVAILABLE", "Notion's notion-get-self did not name the signed-in user", "Run /notion status and sign in to Notion again if it shows a problem.")

/** The plan gate: Notion dropped the sort, the date filter or an author filter, so the listing would be other pages. */
export const planMissing = () =>
  failure(
    "UNAVAILABLE",
    "Notion's search did not sort by last edit and filter it by creator or editor: it does that only for workspaces on the Business or Enterprise plan",
    "Use this source with a Business or Enterprise workspace; notion-get-tool-access names what this workspace's plan restricts.",
  )

const unreadable = (what: string) =>
  failure("UNAVAILABLE", `Notion's notion-search ${what}`, "Call events_list again with the same cursor; if it keeps failing, run /notion status.")

/** Notion's own failure, as the contract's code. A permission refusal is a `Tool.Error` that carries a cause. */
function readFailed(tool: string, reason: string): ProviderError {
  const limited = /rate[_ ]limited/i.test(reason)
  const seconds = Number(/retry_after_seconds\D{0,4}(\d{1,5})/i.exec(reason)?.[1])
  if (limited) {
    return failure("RATE_LIMITED", `Notion's ${tool} answered rate_limited`, "Wait, then call it again with the same input; make fewer calls at once.", Number.isSafeInteger(seconds) && seconds > 0 ? seconds : undefined)
  }
  return failure("UNAVAILABLE", `Notion's ${tool} failed: ${cut(oneLine(reason), 200)}`, "Call the method again; if it keeps failing, run /notion status.")
}

/** The server's state when a Notion tool is not listed, as the contract's code and a next step. */
function connectionFailure(status: string | undefined, tool: string, alias: string): ProviderError {
  if (status === "needs_auth" || status === "needs_client_registration") {
    return failure("NEEDS_SIGN_IN", `The ${alias} account is not signed in to Notion`, `Run /connect and choose Notion${alias === "default" ? "" : ` (${alias})`}, then call the method again.`)
  }
  if (status === "connected") return failure("UNAVAILABLE", `The Notion server for ${alias} does not list ${tool}`, "Run /notion status; a workspace connection lists only the tools its admin chose.")
  const state = status === undefined ? "is not registered" : status === "pending" ? "is still connecting" : status === "disabled" ? "is disabled" : "could not connect"
  return failure("UNAVAILABLE", `The Notion server for ${alias} ${state}`, "Run /notion status, follow its next step, then call the method again.")
}

/** A tool's answer: its structured output, or the JSON its text holds. Undefined when it is neither. */
export function answerOf(result: { readonly output?: unknown; readonly content?: unknown }): unknown {
  if (record(result.output)) return result.output
  const text =
    typeof result.output === "string"
      ? result.output
      : typeof result.content === "string"
        ? result.content
        : Array.isArray(result.content)
          ? result.content.flatMap((part) => (record(part) && part.type === "text" && typeof part.text === "string" ? [part.text] : [])).join("\n")
          : ""
  try {
    return JSON.parse(text) as unknown
  } catch {
    return undefined
  }
}

/**
 * The identity in a notion-get-self answer: `user.id` is the owner, `notion:` and the id; `workspace.id` and its name
 * are the organization a consumer can check. Undefined when the user id is missing.
 */
export function identityOf(answer: unknown): Identity | undefined {
  if (!record(answer) || !record(answer["user"])) return undefined
  const user = answer["user"]
  const id = user["id"]
  if (typeof id !== "string" || !ID.test(id)) return undefined
  const named = typeof user["name"] === "string" ? oneLine(user["name"]) : ""
  const workspace = record(answer["workspace"]) ? answer["workspace"] : undefined
  const workspaceId = workspace !== undefined && typeof workspace["id"] === "string" && ID.test(workspace["id"]) ? workspace["id"].toLowerCase() : undefined
  const workspaceName = workspace !== undefined && typeof workspace["name"] === "string" ? oneLine(workspace["name"]) : ""
  return {
    owner: { id: `notion:${id.toLowerCase()}`, label: cut(named || id, OWNER_LABEL_MAX) },
    ...(workspaceId === undefined ? {} : { workspace: { id: workspaceId, label: cut(workspaceName || workspaceId, OWNER_LABEL_MAX) } }),
  }
}

/**
 * A notion-search answer, read. A notice that the plan dropped the sort, the date filter or an author filter, or that
 * no search ran, is the plan refusal; an answer in another shape, or one not ordered by last edit, is UNAVAILABLE. A
 * result with no id or edit time cannot be placed in time, so it is left out, and still counts toward the 50.
 */
export function readSearch(answer: unknown): Searched {
  if (!record(answer)) throw unreadable("answered in a shape this plugin does not read")
  const notices = Array.isArray(answer["notices"]) ? answer["notices"].filter((notice): notice is string => typeof notice === "string") : []
  if (notices.some((notice) => /\bsort\b|last_edited|created_by|edited_by|\bomitted\b|\bignored\b|no search was run/i.test(notice))) throw planMissing()
  if (answer["type"] !== undefined && answer["type"] !== "workspace_search") throw unreadable(`answered a ${String(answer["type"]).slice(0, 40)} search, not a workspace search`)
  if (!Array.isArray(answer["results"])) throw unreadable("answered no results list")
  const items: Edited[] = []
  for (const result of answer["results"]) {
    if (!record(result)) continue
    const { id, timestamp, type, title } = result
    if (typeof id !== "string" || !ID.test(id) || typeof timestamp !== "string" || !ISO_WITH_ZONE.test(timestamp)) continue
    const t = Date.parse(timestamp)
    if (Number.isNaN(t) || (type !== "page" && type !== "database")) continue
    items.push({ id: id.toLowerCase(), t, type, title: typeof title === "string" ? title : "", url: notionUrl(result["url"]) })
  }
  for (let index = 1; index < items.length; index++) {
    if (items[index]!.t > items[index - 1]!.t) throw unreadable("did not list its results by last edit, newest first")
  }
  return { items, count: answer["results"].length }
}

/** A Tool.Error from OpenCode's executor with no cause: Notion's own failure, not a permission refusal. */
const upstream = (error: unknown): error is Error => error instanceof Error && (error as { _tag?: unknown })._tag === "Tool.Error" && (error as { error?: unknown }).error === undefined
/** A Tool.Error with a cause: the host's permission check refused the MCP call. */
const permission = (error: unknown): error is Error => error instanceof Error && (error as { _tag?: unknown })._tag === "Tool.Error" && (error as { error?: unknown }).error !== undefined

/**
 * The real provider: every read goes through OpenCode's executor for the alias's MCP tool, so the session's rules, the
 * account's server and its sign-in all apply. The tool list is read once per handler call and shared by every search.
 */
export function createProvider(options: ProviderOptions): NotionProvider {
  return {
    reader(alias, call) {
      let tools: Promise<readonly HostTool[]> | undefined
      const list = () => (tools ??= options.tool.list())
      const server = accountName("notion", alias)

      const run = async (tool: string, input: Record<string, unknown>): Promise<unknown> => {
        call.signal.throwIfAborted()
        if (!options.owned(alias)) throw serverConflict()
        const entries = await list()
        const name = toolAction(server, tool)
        const entry = entries.find((candidate) => candidate.id === name)
        if (entry === undefined) {
          const state = (await options.mcp.list()).data.find((candidate) => candidate.name === server)?.status
          throw connectionFailure(state?.status, tool, alias)
        }
        try {
          const result: HostResult = await entry.execute(input as never, call as never)
          return answerOf(result)
        } catch (error) {
          if (!options.owned(alias)) throw serverConflict()
          if (permission(error)) throw failure("PERMISSION_DENIED", `The ${alias} account may not read ${tool}`, "Ask the person to allow this account's Notion tool, then call the method again.")
          if (upstream(error)) throw readFailed(tool, error.message)
          throw error
        }
      }

      return {
        async identity() {
          const answer = await run(SELF_TOOL, {})
          const identity = identityOf(answer)
          if (identity === undefined) throw ownerUnknown()
          return identity
        },
        async search(request) {
          return readSearch(await run(SEARCH_TOOL, request as unknown as Record<string, unknown>))
        },
      }
    },
  }
}
