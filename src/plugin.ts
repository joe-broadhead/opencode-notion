import { Plugin, type Mcp } from "@opencode/plugin"
import { watchAccount } from "./account.js"
import { reasonOf } from "./redact.js"
import { errorText, NAMESPACE_DESCRIPTION, OAUTH_SCOPE, PLUGIN_ID, SERVER_NAME } from "./constants.js"
import { checkHost } from "./host-version.js"
import { registerToolsRpc, METHODS } from "./host/tools-rpc.js"
import { watchIntegration } from "./integration.js"
import { parseOptions } from "./options.js"
import { defaultRules, registerDefaultRules } from "./permissions.js"
import { loadSkills, registerSkills } from "./skills.js"
import { readStatus, registerStatusCommand, registerStatusRpc, type ServerSource } from "./status.js"

/** Internal seam: tests point the server at a loopback fake without OAuth, and at their own skills. */
interface NotionSeam {
  readonly endpoint: string
  readonly oauth?: false
  readonly skillsDir?: string
}

type RemoteConfig = Extract<Mcp.ServerConfig, { type: "remote" }>

/**
 * No protocol, codemode, timeout or headers, and no client_id or redirect_uri: those two would stop OpenCode signing in
 * with its client metadata document. The scope is pinned, because Notion's metadata also advertises
 * `ema_issuer:manage`, and OpenCode falls back to every advertised scope when a challenge names none. Only the tests'
 * seam sets `oauth: false`.
 */
export const serverConfig = (seam: NotionSeam): RemoteConfig => ({
  type: "remote",
  url: seam.endpoint,
  oauth: seam.oauth ?? { scope: OAUTH_SCOPE },
})

/** Origin and path only, so a token in a query string never reaches status. */
export function displayUrl(url: string) {
  try {
    const parsed = new URL(url)
    return `${parsed.origin}${parsed.pathname.replace(/\/+$/, "")}`
  } catch {
    return "an invalid URL"
  }
}

/**
 * A conflicting server's address for status. Another origin shows only its origin, because its path can hold a secret,
 * as some servers' URLs do. Notion's own origin keeps its path, so a wrong path there is visible.
 */
export function conflictUrl(url: string, expected: string) {
  try {
    const parsed = new URL(url)
    if (parsed.origin === new URL(expected).origin) return displayUrl(url)
    return parsed.pathname.replace(/\/+$/, "") === "" ? parsed.origin : `${parsed.origin}/…`
  } catch {
    return "an invalid URL"
  }
}

/**
 * Registers `notion`, or adopts the user's own `mcp.servers.notion` unchanged when it points at Notion's URL:
 * user config is applied first, and a later `set` would replace it. Of the user's entry only its type, its URL and
 * whether `oauth` is false are read, never its headers, which may hold a secret. Any other URL, or a local command,
 * is a conflict, and nothing is added. Synchronous and never throws.
 */
export function registerServer(
  mcp: Pick<Plugin.Context["mcp"], "transform">,
  config: RemoteConfig,
  record: (source: ServerSource | undefined, problem?: string) => void,
) {
  return mcp.transform((editor) => {
    try {
      const existing = editor.get(SERVER_NAME)
      const expected = displayUrl(config.url)
      if (!existing) {
        editor.set(SERVER_NAME, config)
        return record({ type: "plugin", url: expected, signIn: "oauth" })
      }
      if (existing.type !== "remote") return record({ type: "conflict", url: "a local command", expected })
      const url = displayUrl(existing.url)
      const signIn = existing.oauth === false ? "own" : "oauth"
      record(url === expected ? { type: "adopted", url, signIn } : { type: "conflict", url: conflictUrl(existing.url, config.url), expected })
    } catch (error) {
      record(undefined, errorText("SERVER_NOT_REGISTERED", `The ${SERVER_NAME} MCP server could not be registered (${reasonOf(error)}).`, "Restart OpenCode."))
    }
  })
}

export function createNotionPlugin(seam: NotionSeam) {
  return Plugin.define({
    id: PLUGIN_ID,
    async setup(ctx) {
      const options = parseOptions(ctx.options)
      const host = checkHost(ctx.app.version, options.allowUntestedHost)
      const { skills, problems: skillProblems } = await loadSkills(seam.skillsDir)
      // Transforms replay on every rebuild, so each one overwrites its own entry rather than appending.
      const problems = new Map<string, string>(skillProblems.map((problem, index) => [`skill:${index}`, problem]))
      const report = (area: string) => (problem: string | undefined) => void (problem ? problems.set(area, problem) : problems.delete(area))
      let source: ServerSource | undefined

      await registerServer(ctx.mcp, serverConfig(seam), (next, problem) => {
        source = next
        report("server")(problem)
      })
      // The plugin's own server, or the user's adopted one; a server at another URL is not Notion's.
      const owned = () => source?.type === "plugin" || source?.type === "adopted"
      // Code Mode's catalog describes the server's namespace with this text; a server at another URL keeps its own.
      await ctx.tool.transform((editor) => void (source?.type === "conflict" ? undefined : editor.namespace({ name: SERVER_NAME, description: NAMESPACE_DESCRIPTION })))
      await registerDefaultRules(ctx.agent, defaultRules(), report("rules"))
      // The workspace name and connection type come from the model's own notion-get-self calls, never from a call of
      // the plugin's; the watcher also notes when the server last changed status.
      const account = await watchAccount(ctx, () => source?.type === "adopted" && source.signIn === "own", owned)
      const own = skills.map((skill) => ({ id: skill.id, path: skill.path }))
      const read = () => readStatus(ctx, { ...(source ? { source } : {}), host, problems: [...problems.values()], skills: own, account, listing: account })
      await registerSkills(ctx.skill, skills)
      await registerStatusCommand(ctx, read)
      await registerStatusRpc(ctx.rpc, read)
      // Scripts call the known reads with no model, as a session and its agent.
      const stopTools = await registerToolsRpc(ctx, { methods: METHODS, mcp: { server: SERVER_NAME, managed: () => source?.type !== "conflict" } })
      const stopWatch = watchIntegration(ctx, owned)
      return async () => {
        await stopWatch()
        await stopTools()
        await account.stop()
      }
    },
  })
}
