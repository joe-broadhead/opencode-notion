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
  let next: { type: string; data: Record<string, unknown> } = { type: "mcp.status.changed", data: { server: "notion" } }
  /** The event types the watcher asked for: a real host delivers only those. */
  const subscribed: string[] = []
  const ctx = {
    tool: {
      hook: async (name: string, handler: (event: unknown) => Promise<void>) => {
        handlers.set(name, handler)
        return { dispose: async () => void disposed.push(name) }
      },
    },
    mcp: { list: async () => ({ data: [{ name: "notion", status: { status: "needs_auth" } }] }) },
    event: {
      subscribe: ({ signal, types }: { signal: AbortSignal; types: readonly string[] }) => {
        subscribed.push(...types)
        return {
        async *[Symbol.asyncIterator]() {
          while (!signal.aborted) {
            await new Promise<void>((resolve) => {
              push = resolve
              signal.addEventListener("abort", () => resolve(), { once: true })
            })
            if (!signal.aborted) yield next
          }
        },
        }
      },
    },
  }
  return {
    ctx,
    handlers,
    disposed,
    subscribed,
    /** Emits the event `next` was set to. */
    emit: (event?: { type: string; data: Record<string, unknown> }) => {
      if (event) next = event
      push?.()
    },
    settle: () => new Promise((resolve) => setTimeout(resolve, 20)),
  }
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

  // The account is cleared on the needs_auth event before a status read, so the fact that one was read must outlive it.
  test("remembers that an account was read after the challenge clears it, and forgets that on a credential switch", async () => {
    const view = fake()
    const account = await watchAccount(view.ctx as never)
    expect(account.signedIn()).toBe(false)
    await view.handlers.get("execute.after")!({ tool: "notion_notion-get-self", status: "completed", result: { output: SELF } })
    expect(account.signedIn()).toBe(true)
    view.emit()
    await view.settle()
    expect(account.current()).toBeUndefined()
    expect(account.signedIn()).toBe(true)
    // Another account: nothing read here describes it.
    view.emit({ type: "credential.switched", data: {} })
    await view.settle()
    expect(account.signedIn()).toBe(false)
    await account.stop()
  })

  // A new sign-in may keep its credential id and be another person or workspace, so an update forgets what was read too.
  test("forgets what was read on a credential update as on a switch, and asks the host for both events", async () => {
    const view = fake()
    let forgotten = 0
    const account = await watchAccount(view.ctx as never, () => true, () => true, () => void forgotten++)
    await view.handlers.get("execute.after")!({ tool: "notion_notion-get-self", status: "completed", result: { output: SELF } })
    expect(account.current()).toEqual({ workspace: "Acme Robotics", connection: "person" })
    expect(view.subscribed).toContain("credential.updated")
    view.emit({ type: "credential.updated", data: {} })
    await view.settle()
    expect(forgotten).toBe(1)
    expect(account.current()).toBeUndefined()
    expect(account.signedIn()).toBe(false)
    view.emit({ type: "credential.switched", data: {} })
    await view.settle()
    expect(forgotten).toBe(2)
    // Nothing else forgets it.
    view.emit({ type: "integration.updated", data: {} })
    await view.settle()
    expect(forgotten).toBe(2)
    await account.stop()
  })
})
