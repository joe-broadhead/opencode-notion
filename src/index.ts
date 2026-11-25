import { Plugin } from "@opencode/plugin"
import { unguardedAgents } from "@we-the-rebel-alliance/plugin-contract/access"
import { redactReason } from "@we-the-rebel-alliance/plugin-contract/accounts"
import { assertHost, register } from "@we-the-rebel-alliance/plugin-contract/register"
import { registerNotionAccounts, type ServerSource } from "./accounts.ts"
import { eventsHandler } from "./handlers/events.ts"
import { probeHandler } from "./handlers/probe.ts"
import { createStatus } from "./handlers/status.ts"
import { manifest, version } from "./manifest.ts"
import { identities } from "./provider/identity.ts"
import { createProvider } from "./provider/notion.ts"
import { registerStatusCommand } from "./status.ts"
import { watchAccountStatus } from "./watch.ts"

/** The one next step a conflicting `notion` entry gives. */
function conflictProblem(source: ServerSource): string {
  return `Your mcp.servers.notion points at ${source.url}; point it at the Notion MCP URL or remove it, then restart OpenCode.`
}

export default Plugin.define({
  id: manifest.plugin.name,
  async setup(ctx) {
    assertHost(ctx, manifest)
    const accounts = await registerNotionAccounts(ctx, manifest, ctx.options ?? {})
    const cache = identities()
    const owned = (alias: string) => !(alias === "default" && accounts.source?.type === "conflict")
    const provider = createProvider({ tool: ctx.tool, mcp: ctx.mcp, owned })
    const problems = [...accounts.problems, ...(accounts.source?.type === "conflict" ? [conflictProblem(accounts.source)] : [])]
    const status = createStatus({
      manifest,
      version,
      hostVersion: ctx.app.version,
      aliases: accounts.aliases,
      problems,
      mcp: ctx.mcp,
      identities: cache,
    })
    const handlers = {
      status: status.handler,
      probe: probeHandler(provider, cache),
      events_list: eventsHandler(provider, cache),
    }
    const registration = await register(ctx, manifest, handlers)
    const watched = accounts.aliases.filter(owned)
    const stopWatch = watchAccountStatus(ctx, watched, (event, data) => registration.bus.emit(event, data), (alias) => cache.clear(alias))
    const command = await registerStatusCommand(ctx, async () => {
      try {
        const agents = unguardedAgents((await ctx.agent.list()).data, registration.access.rules)
        return status.read({ ok: true, agents })
      } catch (error) {
        const reason = redactReason(error instanceof Error ? error.message : String(error))
        return status.read({ ok: false, error: `UNAVAILABLE: the agent list could not be read (${reason}). Next step: restart OpenCode and run /notion status again.` })
      }
    })
    return async () => {
      await stopWatch()
      await command.dispose().catch(() => undefined)
      await registration.dispose()
    }
  },
})
