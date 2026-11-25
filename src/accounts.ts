import type { Mcp, Plugin } from "@opencode/plugin"
import { accountsOf, registerAccounts } from "@we-the-rebel-alliance/plugin-contract/accounts"
import type { Manifest } from "@we-the-rebel-alliance/plugin-contract/manifest"
import { displayUrl, NOTION_MCP_URL, serverConfig } from "./provider/server.ts"

/** Who owns the `notion` server: this plugin, the user's own entry at Notion's URL, or a server at another URL. */
export interface ServerSource {
  readonly type: "plugin" | "adopted" | "conflict"
  /** The address status may show: origin and path only, never a query or a header. */
  readonly url: string
  readonly expected: string
  /** `own` is an adopted entry with `oauth: false`, which signs in with an MCP token its headers carry. */
  readonly signIn?: "oauth" | "own"
}

/** What account registration did, and what it could not. */
export interface AccountsSetup {
  /** Every alias the options declare, in their order. */
  readonly aliases: readonly string[]
  /** The aliases whose MCP server this plugin registered. */
  readonly registered: readonly string[]
  readonly problems: readonly string[]
  /** The state of the `notion` server name: registered, adopted, or in conflict with the user's own entry. */
  readonly source?: ServerSource
}

/** The safe address of a user's conflicting server: another origin hides its path, which can hold a secret. */
function conflictUrl(url: string): string {
  try {
    const parsed = new URL(url)
    return parsed.origin === new URL(NOTION_MCP_URL).origin ? displayUrl(url) : `${parsed.origin}/…`
  } catch {
    return "an invalid URL"
  }
}

/**
 * Registers one vendor MCP server per alias through `registerAccounts`. The `default` alias uses the name `notion`,
 * every other alias `notion-<alias>`.
 *
 * The user's own `mcp.servers.notion` is read for its type, URL and whether `oauth` is `false`; its headers are never
 * read. An entry at Notion's URL is adopted unchanged, so its token or OAuth settings keep working; an entry at another
 * URL, or a local command, is a conflict: the plugin registers no `notion` server and status reports it, rather than
 * replacing what the person configured.
 */
export async function registerNotionAccounts(
  ctx: Pick<Plugin.Context, "mcp" | "integration">,
  manifest: Manifest,
  options: Readonly<Record<string, unknown>>,
): Promise<AccountsSetup> {
  const plan = accountsOf(manifest, options)
  if (!plan.ok) return { aliases: [], registered: [], problems: plan.problems }
  const aliases = plan.value.accounts.map((account) => account.alias)
  const expected = displayUrl(NOTION_MCP_URL)
  const problems: string[] = []

  let existing: Mcp.ServerConfig | undefined
  let readFailed = false
  try {
    await ctx.mcp.transform((editor) => {
      existing = editor.get("notion")
    })
  } catch (error) {
    readFailed = true
    const reason = error instanceof Error ? error.message : String(error)
    problems.push(`UNAVAILABLE: The user's notion MCP entry could not be read (${reason}). Next step: Fix or remove mcp.servers.notion, then restart OpenCode.`)
  }
  // Fail closed: without knowing whether the person's `notion` entry is theirs, registering over it could replace it.
  if (readFailed) return { aliases, registered: [], problems }

  let source: ServerSource | undefined
  if (existing !== undefined) {
    if (existing.type !== "remote") {
      source = { type: "conflict", url: "a local command", expected }
    } else {
      const url = displayUrl(existing.url)
      source =
        url === expected
          ? { type: "adopted", url, expected, signIn: existing.oauth === false ? "own" : "oauth" }
          : { type: "conflict", url: conflictUrl(existing.url), expected }
    }
  }

  // An adopted or conflicting `notion` entry is the user's: do not replace it. The other aliases have their own names.
  const skipDefault = source?.type === "adopted" || source?.type === "conflict"
  const toRegister = aliases.filter((alias) => !(skipDefault && alias === "default"))
  let registered: readonly string[] = []
  if (toRegister.length > 0) {
    const declared = options["accounts"]
    const narrowed =
      skipDefault && declared !== undefined && typeof declared === "object" && declared !== null
        ? {
            ...options,
            accounts: Object.fromEntries(toRegister.map((alias) => [alias, (declared as Record<string, unknown>)[alias] ?? {}])),
          }
        : options
    const result = await registerAccounts(ctx, {
      manifest,
      options: narrowed,
      server: (_account, name) => serverConfig(name),
    })
    registered = result.accounts.map((account) => account.alias)
    problems.push(...result.problems)
  }

  return { aliases, registered, problems, ...(source === undefined ? {} : { source }) }
}

