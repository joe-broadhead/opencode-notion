import { describe, expect, test } from "vitest"
import { watchAccountStatus } from "../../src/watch.ts"

const context = (servers: { name: string; status: { status: string } }[], events: { type: string; data: { server: string } }[]) =>
  ({
    mcp: { list: async () => ({ data: servers }) },
    event: {
      subscribe: () =>
        (async function* () {
          for (const event of events) yield event
        })(),
    },
  }) as never

describe("the account watcher", () => {
  test("emits one account nudge for an alias whose server status changed", async () => {
    const emitted: { event: string; data: unknown }[] = []
    const forgotten: string[] = []
    let first: () => void = () => {}
    const one = new Promise<void>((resolve) => {
      first = resolve
    })
    const stop = watchAccountStatus(
      context([{ name: "notion-work", status: { status: "needs_auth" } }], [{ type: "mcp.status.changed", data: { server: "notion-work" } }]),
      ["work", "personal"],
      async (event, data) => {
        emitted.push({ event, data })
        first()
      },
      (alias) => forgotten.push(alias),
    )
    await one
    await stop()
    expect(emitted).toEqual([{ event: "account", data: { account: "work", state: "needs_sign_in" } }])
    expect(forgotten).toEqual(["work"])
  })

  test("ignores another server's status change", async () => {
    const emitted: unknown[] = []
    const stop = watchAccountStatus(context([{ name: "another-server", status: { status: "connected" } }], [{ type: "mcp.status.changed", data: { server: "another-server" } }]), ["work"], async (_event, data) => {
      emitted.push(data)
    })
    await stop()
    expect(emitted).toEqual([])
  })

  test("maps connected, needs_auth and any other state", async () => {
    const states: string[] = []
    const forgotten: string[] = []
    for (const status of ["connected", "needs_auth", "failed"]) {
      let first: () => void = () => {}
      const one = new Promise<void>((resolve) => {
        first = resolve
      })
      const stop = watchAccountStatus(
        context([{ name: "notion-work", status: { status } }], [{ type: "mcp.status.changed", data: { server: "notion-work" } }]),
        ["work"],
        async (_event, data) => {
          states.push(data.state)
          first()
        },
        (alias) => forgotten.push(alias),
      )
      await one
      await stop()
    }
    expect(states).toEqual(["ready", "needs_sign_in", "error"])
    expect(forgotten).toEqual(["work", "work"])
  })
})
