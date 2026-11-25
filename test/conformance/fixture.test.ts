import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { accountsOf, resolveAccount } from "@we-the-rebel-alliance/plugin-contract/accounts"
import { refusalOf } from "@we-the-rebel-alliance/plugin-contract/register"
import { manifest, PACKAGE } from "../../src/manifest.ts"
import { createStatus } from "../../src/handlers/status.ts"
import { eventsHandler } from "../../src/handlers/events.ts"
import { probeHandler } from "../../src/handlers/probe.ts"
import { identities } from "../../src/provider/identity.ts"
import { createProvider } from "../../src/provider/notion.ts"
import { watchAccountStatus } from "../../src/watch.ts"
import { methodCall } from "../support/call.ts"
import { NOW, WORKSPACES } from "../support/fake-notion.ts"
import { createFakeTools } from "../support/fake-tools.ts"

const root = join(import.meta.dirname, "..", "..")
const fixturePath = join(root, "fixtures", "conformance.json")
const aliases = ["work", "personal"] as const

async function recorded() {
  const fake = createFakeTools({ workspaces: WORKSPACES })
  const provider = createProvider({ tool: fake.tool, mcp: fake.mcp, owned: () => true })
  const cache = identities()
  const status = createStatus({ manifest, version: "0.0.0", hostVersion: "2.4.1", aliases, problems: [], mcp: fake.mcp, identities: cache })
  const handlers = {
    status: status.handler,
    probe: probeHandler(provider, cache),
    events_list: eventsHandler(provider, cache, () => NOW),
  }

  const probeWork = await handlers.probe.run({ source: "pages" }, methodCall("work"))
  const probePersonal = await handlers.probe.run({ source: "pages" }, methodCall("personal"))
  const workPage = await handlers.events_list.run({ source: "pages", since: "2026-11-15" }, methodCall("work"))
  const personalPage = await handlers.events_list.run({ source: "pages", since: "2026-11-15" }, methodCall("personal"))
  const emptyPage = await handlers.events_list.run({ source: "pages", since: "2026-11-20T00:00:00Z" }, methodCall("work"))

  const cursor = (workPage as { cursor: string }).cursor
  let crossed: string | undefined
  try {
    await handlers.events_list.run({ source: "pages", cursor }, methodCall("personal"))
  } catch (error) {
    crossed = refusalOf(error)?.code
  }

  const plan = accountsOf(manifest, { accounts: { work: {}, personal: {} } })
  if (!plan.ok) throw new Error("the two synthetic aliases must validate")
  const required = resolveAccount(plan.value.accounts, {})
  const unknown = resolveAccount(plan.value.accounts, { account: "nobodyhere" })
  if (required.ok || unknown.ok) throw new Error("two aliases must refuse a missing and an unknown account")

  const statusAnswer = await status.read([], [])

  const emitted: string[] = []
  let first: () => void = () => {}
  const one = new Promise<void>((resolve) => {
    first = resolve
  })
  const stop = watchAccountStatus(
    {
      mcp: { list: async () => ({ data: [{ name: "notion-work", status: { status: "connected" } }] }) },
      event: {
        subscribe: () =>
          (async function* () {
            yield { type: "mcp.status.changed", data: { server: "notion-work" } }
          })(),
      },
    } as never,
    aliases,
    async (event) => {
      emitted.push(event)
      first()
    },
  )
  await one
  await stop()

  const fixture = {
    $comment:
      "Recorded from the plugin's own handlers over a fake OpenCode MCP boundary: two synthetic aliases, invented workspaces, pages and people, and no secret. RECORD=1 writes it.",
    plugin: PACKAGE,
    accounts: {
      real: true,
      aliases: [...aliases],
      required: { method: "events_list", code: "ACCOUNT_REQUIRED" },
      unknown: { method: "events_list", account: "nobodyhere", code: "ACCOUNT_UNKNOWN" },
      cursors: [{ method: "events_list", account: "work", other: "personal", code: "CURSOR_INVALID" }],
    },
    sources: {
      "notion.pages": {
        cases: [
          { name: "the work account", input: { source: "pages", since: "2026-11-15" }, expect: "page", answer: workPage },
          { name: "the personal account", input: { source: "pages", since: "2026-11-15" }, expect: "page", answer: personalPage },
          { name: "an empty window", input: { source: "pages", since: "2026-11-20T00:00:00Z" }, expect: "empty", answer: emptyPage },
        ],
        probe: { answer: probeWork },
      },
    },
    events: { emitted, status: statusAnswer },
    namespace: manifest.plugin.summary,
  }

  return {
    fixture,
    checked: {
      crossAccountCursor: crossed,
      personalProbe: probePersonal,
      required: required.code,
      unknown: unknown.code,
      emitted,
    },
  }
}

describe("the conformance fixture", () => {
  test("is what the handlers answer for the two synthetic aliases", async () => {
    const { fixture, checked } = await recorded()
    expect(checked.required).toBe("ACCOUNT_REQUIRED")
    expect(checked.unknown).toBe("ACCOUNT_UNKNOWN")
    expect(checked.crossAccountCursor).toBe("CURSOR_INVALID")
    expect(checked.emitted).toEqual(["account"])
    expect((checked.personalProbe as { account: string }).account).toBe("personal")

    if (process.env["RECORD"] === "1") {
      writeFileSync(fixturePath, `${JSON.stringify(fixture, null, 2)}\n`)
      return
    }
    const committed = JSON.parse(readFileSync(fixturePath, "utf8"))
    expect(fixture).toEqual(committed)
  })
})
