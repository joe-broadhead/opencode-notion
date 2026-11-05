// The workspace name and connection type status shows. They come only from a notion-get-self result the model or a
// script asked for: the plugin never calls Notion itself.
import { describe, expect, test } from "bun:test"
import { accountOf, watchAccount } from "../../src/account.js"

const SELF = {
  object: "user",
  workspace: { id: "1111", name: "Acme Robotics" },
  user: { object: "user", type: "person", id: "2222", name: "Jane Doe", person: { email: "jane@example.com" } },
}

describe("accountOf", () => {
  test("reads only the workspace name and the user type", () => {
    const account = accountOf({ output: SELF })
    expect(account).toEqual({ workspace: "Acme Robotics", connection: "person" })
    // Nothing that identifies a person, or the workspace's ID, survives.
    expect(JSON.stringify(account)).not.toMatch(/Jane|jane@example|1111|2222/)
  })

  test("reads the same fields from a JSON text part, one level down", () => {
    expect(accountOf({ content: [{ type: "text", text: JSON.stringify({ result: SELF }) }] })).toEqual({ workspace: "Acme Robotics", connection: "person" })
    expect(accountOf({ content: JSON.stringify(SELF) })).toEqual({ workspace: "Acme Robotics", connection: "person" })
  })

  test("a workspace connection is a bot", () => {
    expect(accountOf({ output: { ...SELF, user: { type: "bot" } } })).toEqual({ workspace: "Acme Robotics", connection: "bot" })
  })

  test("another shape leaves the rows unread rather than wrong", () => {
    for (const result of [{}, { output: "not json" }, { content: [{ type: "text", text: "[1,2]" }] }]) expect(accountOf(result)).toBeUndefined()
    // A name that is not text is not shown; the user type alone is still a fact.
    expect(accountOf({ output: { workspace: { name: 42 }, user: { type: "person" } } })).toEqual({ connection: "person" })
  })

  test("a workspace name is one line, with controls and bidi marks removed, cut to 80 characters", () => {
    const account = accountOf({ output: { workspace: { name: `Acme\u202e Robotics\n${"y".repeat(200)}` }, user: { type: "person" } } })
    expect(account?.workspace).toMatch(/^Acme Robotics y+…$/)
    expect(Array.from(account!.workspace!)).toHaveLength(80)
  })
})

/** A context with the members the watcher uses, feeding one hook call and one event by hand. */
function fake() {
  const handlers = new Map<string, (event: unknown) => Promise<void>>()
  const disposed: string[] = []
  let push: (() => void) | undefined
  const ctx = {
    tool: {
      hook: async (name: string, handler: (event: unknown) => Promise<void>) => {
        handlers.set(name, handler)
        return { dispose: async () => void disposed.push(name) }
      },
    },
    mcp: { list: async () => ({ data: [{ name: "notion", status: { status: "needs_auth" } }] }) },
    event: {
      subscribe: ({ signal }: { signal: AbortSignal }) => ({
        async *[Symbol.asyncIterator]() {
          while (!signal.aborted) {
            await new Promise<void>((resolve) => {
              push = resolve
              signal.addEventListener("abort", () => resolve(), { once: true })
            })
            if (!signal.aborted) yield { type: "mcp.status.changed", data: { server: "notion" } }
          }
        },
      }),
    },
  }
  return { ctx, handlers, disposed, emit: () => push?.(), settle: () => new Promise((resolve) => setTimeout(resolve, 20)) }
}

describe("watchAccount", () => {
  test("captures a completed notion-get-self from the model path, and nothing else", async () => {
    const view = fake()
    const account = await watchAccount(view.ctx as never)
    const hook = view.handlers.get("execute.after")!
    await hook({ tool: "notion_notion-get-self", status: "completed", result: { output: SELF } })
    expect(account.current()).toEqual({ workspace: "Acme Robotics", connection: "person" })
    await hook({ tool: "notion_notion-search", status: "completed", result: { output: SELF } })
    await hook({ tool: "notion_notion-get-self", status: "error", result: { output: SELF } })
    expect(account.current()).toEqual({ workspace: "Acme Robotics", connection: "person" })
    await account.stop()
    expect(view.disposed).toEqual(["execute.after"])
  })

  test("notes when the server changed status, for the still-listing row", async () => {
    const view = fake()
    const before = Date.now()
    const account = await watchAccount(view.ctx as never)
    const started = account.changedAt()
    expect(started).toBeGreaterThanOrEqual(before)
    await Bun.sleep(5)
    view.emit()
    await view.settle()
    expect(account.changedAt()).toBeGreaterThan(started)
    await account.stop()
  })
})
