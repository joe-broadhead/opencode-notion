import type { Plugin } from "@opencode/plugin"
import { accountName } from "@we-the-rebel-alliance/plugin-contract/accounts"
import type { AccountData } from "@we-the-rebel-alliance/plugin-contract/bus"

/** The part of the plugin context the watcher reads: the MCP server list and the event stream. */
export interface WatchContext {
  readonly mcp: Pick<Plugin.Context["mcp"], "list">
  readonly event: Pick<Plugin.Context["event"], "subscribe">
}

/** Emits one `account` nudge; the setup passes `registration.bus.emit`. */
export type EmitAccount = (event: "account", data: AccountData) => Promise<unknown>

const RESUBSCRIBE_MS = 5_000

/** The state an MCP server's status gives an alias. */
function stateOf(status: string | undefined): AccountData["state"] {
  if (status === "connected") return "ready"
  if (status === "needs_auth" || status === undefined) return "needs_sign_in"
  return "error"
}

/**
 * Watches `mcp.status.changed` for the alias servers this plugin owns and emits one `account` nudge per change. The
 * watcher is injectable: a test passes a fake context and a fake emit. It never emits `changed`, because the plugin
 * makes no write of its own, and it never carries content.
 */
export function watchAccountStatus(ctx: WatchContext, aliases: readonly string[], emit: EmitAccount, forget: (alias: string) => void = () => {}): () => Promise<void> {
  const byServer = new Map(aliases.map((alias) => [accountName("notion", alias), alias]))
  const stopped = new AbortController()

  const changed = async (server: string): Promise<void> => {
    const alias = byServer.get(server)
    if (alias === undefined) return
    const entry = (await ctx.mcp.list()).data.find((candidate) => candidate.name === server)
    const state = stateOf(entry?.status.status)
    // An alias that needs a sign-in again, or whose server failed, may come back as another person or workspace.
    if (state !== "ready") forget(alias)
    await emit("account", { account: alias, state })
  }

  const watching = (async () => {
    while (!stopped.signal.aborted) {
      try {
        const events = ctx.event.subscribe({ types: ["mcp.status.changed"], signal: stopped.signal })
        for await (const event of events) {
          await changed(event.data.server).catch(() => undefined)
        }
      } catch {
        // The stream failed; subscribe again below.
      }
      await delay(RESUBSCRIBE_MS, stopped.signal)
    }
  })()

  return async () => {
    stopped.abort()
    await watching
  }
}

const delay = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal.aborted) return resolve()
    const done = () => {
      clearTimeout(timer)
      signal.removeEventListener("abort", done)
      resolve()
    }
    const timer = setTimeout(done, ms)
    signal.addEventListener("abort", done, { once: true })
  })
