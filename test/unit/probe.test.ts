import { describe, expect, test } from "vitest"
import { refusalOf } from "@we-the-rebel-alliance/plugin-contract/register"
import { probeHandler } from "../../src/handlers/probe.ts"
import { identities } from "../../src/provider/identity.ts"
import { createProvider } from "../../src/provider/notion.ts"
import { methodCall } from "../support/call.ts"
import { WORKSPACES } from "../support/fake-notion.ts"
import { createFakeTools } from "../support/fake-tools.ts"

function probeFor() {
  const fake = createFakeTools({ workspaces: WORKSPACES })
  const provider = createProvider({ tool: fake.tool, mcp: fake.mcp, owned: () => true })
  const cache = identities()
  return { fake, cache, handler: probeHandler(provider, cache) }
}

const codeOf = (error: unknown) => refusalOf(error)?.code

describe("probe", () => {
  test("answers the alias, its owner and the workspace as an organization, and no content", async () => {
    const { handler } = probeFor()
    const answer = (await handler.run({ source: "pages" }, methodCall("work"))) as {
      source: string
      account: string
      owner: { id: string; label: string; orgs: { id: string; label: string }[] }
      trust: string
    }
    expect(answer).toEqual({
      source: "pages",
      account: "work",
      owner: {
        id: "notion:u-ana",
        label: "Ana Silva",
        orgs: [{ id: "notion-workspace:ws-work", label: "Northwind Studio" }],
      },
      trust: "untrusted",
    })
    expect(Object.keys(answer).sort()).toEqual(["account", "owner", "source", "trust"])
  })

  test("reads one identity per alias and reuses it", async () => {
    const { fake, handler } = probeFor()
    await handler.run({}, methodCall("work"))
    await handler.run({}, methodCall("work"))
    await handler.run({}, methodCall("personal"))
    expect(fake.calls.map((call) => `${call.alias}:${call.tool}`)).toEqual(["work:notion-get-self", "personal:notion-get-self"])
  })

  test("refuses another source and an unknown input field", async () => {
    const { handler } = probeFor()
    await expect(handler.run({ source: "other" }, methodCall("work"))).rejects.toSatisfy((error: unknown) => codeOf(error) === "SOURCE_UNKNOWN")
    await expect(handler.run({ limit: 1 }, methodCall("work"))).rejects.toSatisfy((error: unknown) => codeOf(error) === "INPUT_INVALID")
  })
})
