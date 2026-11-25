import { describe, expect, test } from "vitest"
import { createStatus, formatStatus } from "../../src/handlers/status.ts"
import { identities } from "../../src/provider/identity.ts"
import { manifest } from "../../src/manifest.ts"
import { methodCall } from "../support/call.ts"

const statusFor = (servers: { name: string; status: { status: string; error?: string } }[]) => {
  const cache = identities()
  cache.set("work", { owner: { id: "notion:u-ana", label: "Ana Silva" }, workspace: { id: "ws-work", label: "Northwind Studio" } })
  const status = createStatus({
    manifest,
    version: "0.0.0",
    hostVersion: "2.4.1",
    aliases: ["work", "personal"],
    problems: [],
    mcp: { list: async () => ({ data: servers }) } as never,
    identities: cache,
  })
  return status
}

describe("status", () => {
  test("maps each alias's server state and adds the owner the probe cache knows", async () => {
    const status = statusFor([
      { name: "notion-work", status: { status: "connected" } },
      { name: "notion-personal", status: { status: "needs_auth" } },
    ])
    const answer = await status.read({ ok: true, agents: ["plan"] })
    expect(answer.name).toBe("notion")
    expect(answer.version).toBe("0.0.0")
    expect(answer.host).toEqual({ version: "2.4.1", range: ">=2.4.1 <2.5.0", tested: ["2.4.1"] })
    expect(answer.state).toBe("needs_sign_in")
    expect(answer.accounts.map((account) => [account.alias, account.state])).toEqual([
      ["work", "ready"],
      ["personal", "needs_sign_in"],
    ])
    expect(answer.accounts[0]?.owner?.orgs?.[0]).toEqual({ id: "notion-workspace:ws-work", label: "Northwind Studio" })
    expect(answer.unguardedAgents).toEqual(["plan"])
    expect(answer.nextStep).toMatch(/Sign in/)
  })

  test("a failed server is an error for its alias; a server that never registered asks for a sign-in", async () => {
    const status = statusFor([
      { name: "notion-work", status: { status: "failed", error: "the token was refused" } },
      { name: "notion-personal", status: { status: "connected" } },
    ])
    const answer = await status.read({ ok: true, agents: [] })
    expect(answer.accounts.find((account) => account.alias === "work")?.state).toBe("error")
    expect(answer.accounts.find((account) => account.alias === "work")?.reason).toContain("the token was refused")
    const missing = statusFor([{ name: "notion-work", status: { status: "connected" } }])
    expect((await missing.read({ ok: true, agents: [] })).accounts.find((account) => account.alias === "personal")?.state).toBe("needs_sign_in")
  })

  test("a setup problem makes the state an error and becomes the next step", async () => {
    const cache = identities()
    const status = createStatus({
      manifest,
      version: "0.0.0",
      hostVersion: "2.4.1",
      aliases: ["work"],
      problems: ["Your mcp.servers.notion points at another server."],
      mcp: { list: async () => ({ data: [{ name: "notion-work", status: { status: "connected" } }] }) } as never,
      identities: cache,
    })
    const answer = await status.read({ ok: true, agents: [] })
    expect(answer.state).toBe("error")
    expect(answer.nextStep).toContain("mcp.servers.notion")
  })

  test("passes the call's unguarded-agents result straight through, including a failure", async () => {
    const status = statusFor([{ name: "notion-work", status: { status: "connected" } }])
    const call = methodCall("work", { unguardedAgents: async () => ({ ok: true, agents: ["build"] }) })
    const answer = (await status.handler.run({}, call)) as { unguardedAgents: string[] }
    expect(answer.unguardedAgents).toEqual(["build"])

    const failed = await status.read({ ok: false, error: "the host refused the agent list" })
    expect(failed.state).toBe("error")
    expect(failed.unguardedAgents).toEqual([])
    expect(failed.nextStep).toContain("the host refused the agent list")
  })

  test("formats the command view without content", () => {
    const text = formatStatus({
      name: "notion",
      version: "0.0.0",
      host: { version: "2.4.1", range: ">=2.4.1 <2.5.0", tested: ["2.4.1"] },
      state: "ready",
      accounts: [{ alias: "work", state: "ready", owner: { id: "notion:u-ana", label: "Ana Silva" } }],
      unguardedAgents: [],
      nextStep: null,
    })
    expect(text).toContain("Accounts: work: ready (Ana Silva)")
    expect(text).toContain("Next step: Nothing to do.")
  })
})
