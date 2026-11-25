import { describe, expect, test } from "vitest"
import { registerNotionAccounts } from "../../src/accounts.ts"
import { manifest } from "../../src/manifest.ts"

function fakeContext(existing: Record<string, unknown> = {}) {
  const servers = new Map<string, unknown>(Object.entries(existing))
  const sets: [string, unknown][] = []
  const ctx = {
    mcp: {
      transform: async (callback: (editor: unknown) => void) => {
        await callback({
          get: (name: string) => servers.get(name),
          set: (name: string, config: unknown) => {
            servers.set(name, config)
            sets.push([name, config])
          },
        })
        return { dispose: async () => {} }
      },
    },
    integration: {
      transform: async (callback: (editor: unknown) => void) => {
        await callback({ update: () => {}, method: { update: () => {} } })
        return { dispose: async () => {} }
      },
    },
  }
  return { ctx: ctx as never, sets, servers }
}

const remote = (url: string, oauth: unknown = { scope: "default" }) => ({ type: "remote", url, oauth })

describe("account registration and the user's own notion entry", () => {
  test("registers notion for the default alias when the person has no entry", async () => {
    const fake = fakeContext()
    const result = await registerNotionAccounts(fake.ctx, manifest, {})
    expect(result.aliases).toEqual(["default"])
    expect(result.registered).toEqual(["default"])
    expect(result.source).toBeUndefined()
    expect(fake.sets.map(([name]) => name)).toEqual(["notion"])
    expect(fake.sets[0]?.[1]).toMatchObject({ type: "remote", url: "https://mcp.notion.com/mcp", oauth: { scope: "default" } })
  })

  test("adopts the person's own entry at Notion's URL and registers nothing for it", async () => {
    const fake = fakeContext({ notion: remote("https://mcp.notion.com/mcp", false) })
    const result = await registerNotionAccounts(fake.ctx, manifest, {})
    expect(result.source).toMatchObject({ type: "adopted", signIn: "own" })
    expect(result.registered).toEqual([])
    expect(fake.sets).toEqual([])
  })

  test("reports another URL as a conflict, hides its path, and leaves it alone", async () => {
    const fake = fakeContext({ notion: remote("https://another.example.com/mcp?token=secret") })
    const result = await registerNotionAccounts(fake.ctx, manifest, {})
    expect(result.source).toMatchObject({ type: "conflict", url: "https://another.example.com/…" })
    expect(result.registered).toEqual([])
    expect(fake.sets).toEqual([])
    expect(JSON.stringify(result)).not.toContain("token=secret")
  })

  test("reports a local command as a conflict", async () => {
    const fake = fakeContext({ notion: { type: "local", command: ["a-server"] } })
    const result = await registerNotionAccounts(fake.ctx, manifest, {})
    expect(result.source).toMatchObject({ type: "conflict", url: "a local command" })
    expect(fake.sets).toEqual([])
  })

  test("registers one server per alias, and only the non-default aliases when notion is adopted", async () => {
    const fake = fakeContext()
    const options = { accounts: { work: {}, personal: {} } }
    const result = await registerNotionAccounts(fake.ctx, manifest, options)
    expect(result.registered).toEqual(["work", "personal"])
    expect(fake.sets.map(([name]) => name)).toEqual(["notion-work", "notion-personal"])

    const adopted = fakeContext({ notion: remote("https://mcp.notion.com/mcp") })
    const mixed = await registerNotionAccounts(adopted.ctx, manifest, options)
    expect(mixed.source).toMatchObject({ type: "adopted" })
    expect(mixed.registered).toEqual(["work", "personal"])
    expect(adopted.sets.map(([name]) => name)).toEqual(["notion-work", "notion-personal"])
  })
})
