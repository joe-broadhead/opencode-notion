import type { ProviderOptions } from "../../src/provider/notion.ts"

/** The fixed clock every recorded answer uses. */
export const NOW = Date.parse("2026-11-20T12:00:00.000Z")

export interface FakePage {
  readonly id: string
  readonly type: "page" | "database"
  readonly title: string
  readonly edited_at: string
  readonly edited_by: string
  readonly created_by: string
  readonly url?: string
}

export interface FakeWorkspace {
  readonly id: string
  readonly name?: string
  readonly user: { readonly id: string; readonly name?: string; readonly email?: string; readonly type?: "person" | "bot" }
  readonly plan?: "business" | "free"
  readonly pages: readonly FakePage[]
  readonly status?: "connected" | "needs_auth" | "needs_client_registration" | "pending" | "failed" | "disabled"
  /** A message for `notion-search`; the fake answers it as Notion's own failure. */
  readonly failure?: string
}

export interface FakeOptions {
  readonly workspaces: Readonly<Record<string, FakeWorkspace>>
}

export interface ToolCall {
  readonly alias: string
  readonly tool: string
  readonly input: unknown
}

export interface FakeTools {
  readonly tool: ProviderOptions["tool"]
  readonly mcp: ProviderOptions["mcp"]
  readonly calls: ToolCall[]
}

const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value)

/** The server name of one alias, exactly as `accounts.accountName` derives it. */
const serverOf = (alias: string) => (alias === "default" ? "notion" : `notion-${alias}`)

/** A whole UTC day of a timestamp, as the fake search's date filter compares it. */
const dayOf = (timestamp: string) => timestamp.slice(0, 10)

/**
 * A fake of OpenCode's MCP boundary: one tool entry per alias's server, with `notion-get-self` and `notion-search`
 * answering the invented workspace deterministically. The provider under test is the real one.
 */
export function createFakeTools(options: FakeOptions): FakeTools {
  const calls: ToolCall[] = []
  const entries: { id: string; name: string; execute: (input: unknown) => Promise<unknown> }[] = []

  for (const [alias, workspace] of Object.entries(options.workspaces)) {
    const server = serverOf(alias)
    const status = workspace.status ?? "connected"
    if (status !== "connected") continue
    const fail = (tool: string) => {
      const error = new Error(workspace.failure ?? `${tool} failed`) as Error & { _tag: string }
      error._tag = "Tool.Error"
      return error
    }
    entries.push({
      id: `${server}_notion-get-self`,
      name: "notion-get-self",
      execute: async (input) => {
        calls.push({ alias, tool: "notion-get-self", input })
        return {
          output: {
            object: "user",
            workspace: { id: workspace.id, ...(workspace.name === undefined ? {} : { name: workspace.name }) },
            user: {
              object: "user",
              id: workspace.user.id,
              type: workspace.user.type ?? "person",
              ...(workspace.user.name === undefined ? {} : { name: workspace.user.name }),
              ...(workspace.user.email === undefined ? {} : { email: workspace.user.email }),
            },
          },
        }
      },
    })
    entries.push({
      id: `${server}_notion-search`,
      name: "notion-search",
      execute: async (input) => {
        calls.push({ alias, tool: "notion-search", input })
        if (workspace.failure !== undefined) throw fail("notion-search")
        if (!record(input) || !record(input["filters"])) return { output: { type: "workspace_search", results: [] } }
        const filters = input["filters"]
        const range = record(filters["last_edited_date_range"]) ? filters["last_edited_date_range"] : {}
        const start = typeof range["start_date"] === "string" ? range["start_date"] : ""
        const end = typeof range["end_date"] === "string" ? range["end_date"] : undefined
        const edited = Array.isArray(filters["edited_by_user_ids"]) && filters["edited_by_user_ids"].includes("me")
        const created = Array.isArray(filters["created_by_user_ids"]) && filters["created_by_user_ids"].includes("me")
        const author = edited ? "edited_by" : created ? "created_by" : undefined
        const listed = workspace.pages
          .filter((page) => (author === undefined ? false : page[author] === workspace.user.id))
          .filter((page) => dayOf(page.edited_at) >= start && (end === undefined || dayOf(page.edited_at) <= end))
          .sort((left, right) => right.edited_at.localeCompare(left.edited_at))
          .slice(0, 50)
          .map((page) => ({
            object: page.type,
            id: page.id,
            type: page.type,
            title: page.title,
            url: page.url ?? null,
            timestamp: page.edited_at,
          }))
        if (workspace.plan === "free") {
          return { output: { type: "workspace_search", notices: ["The sort option was omitted on this plan."], results: listed } }
        }
        return { output: { type: "workspace_search", results: listed } }
      },
    })
  }

  const tool = {
    list: async () => entries as never,
  } as unknown as ProviderOptions["tool"]

  const mcp = {
    list: async () => ({
      data: Object.entries(options.workspaces).map(([alias, workspace]) => ({
        name: serverOf(alias),
        status: { status: workspace.status ?? "connected" },
      })),
    }),
  } as unknown as ProviderOptions["mcp"]

  return { tool, mcp, calls }
}
