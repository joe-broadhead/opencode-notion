import type { Plugin } from "@opencode/plugin"
import { redactReason, type StatusAnswer } from "@we-the-rebel-alliance/plugin-contract/accounts"
import { formatStatus } from "./handlers/status.ts"

/** The `/notion` command: the same status answer the RPC method returns, as plain lines. */
export function registerStatusCommand(
  ctx: {
    readonly command: Pick<Plugin.Context["command"], "transform">
    readonly session: Pick<Plugin.Context["session"], "synthetic">
  },
  read: () => Promise<StatusAnswer>,
) {
  return ctx.command.transform((editor) =>
    editor.add({
      name: "notion",
      description: "Show Notion's state, accounts and the next step",
      execute: async ({ sessionID }) => {
        const text = await read().then(formatStatus, (error: unknown) => {
          const reason = redactReason(error instanceof Error ? error.message : String(error)).slice(0, 200)
          return `UNAVAILABLE: Could not read Notion's status (${reason}). Next step: restart OpenCode, then run /notion again.`
        })
        await ctx.session.synthetic({ sessionID, text, description: "Notion status", resume: false })
      },
    }),
  )
}
