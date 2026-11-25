import { describe, expect, test } from "vitest"
import type { MethodCall } from "@we-the-rebel-alliance/plugin-contract/register"
import { createStatus, formatStatus, unguardedAgentsOf } from "../../src/handlers/status.ts"
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
    const answer = await status.read(["plan"])
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
    const answer = await status.read([])
    expect(answer.accounts.find((account) => account.alias === "work")?.state).toBe("error")
    expect(answer.accounts.find((account) => account.alias === "work")?.reason).toContain("the token was refused")
    const missing = statusFor([{ name: "notion-work", status: { status: "connected" } }])
    expect((await missing.read([])).accounts.find((account) => account.alias === "personal")?.state).toBe("needs_sign_in")
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
    const answer = await status.read([])
    expect(answer.state).toBe("error")
    expect(answer.nextStep).toContain("mcp.servers.notion")
  })

  test("asks the register's call for the unguarded agents, and reports an unreadable list as a problem", async () => {
    expect(await unguardedAgentsOf(methodCall("work", { unguardedAgents: async () => ["build"] }))).toEqual({ agents: ["build"] })
    const frozen = methodCall("work", { unguardedAgents: (async () => ({ ok: false, error: "the host refused" })) as unknown as MethodCall["unguardedAgents"] })
    const failed = await unguardedAgentsOf(frozen)
    expect(failed.agents).toEqual([])
    expect(failed.problem).toContain("UNAVAILABLE")
    expect(failed.problem).toContain("Next step:")
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
