import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { afterAll, describe, expect, test } from "vitest"

const root = join(import.meta.dirname, "..", "..")
const base = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "notion-registration-")))
const home = join(base, "home")
for (const dir of [home, join(base, "tmp")]) mkdirSync(dir, { recursive: true })
process.env["HOME"] = home
process.env["OPENCODE_TEST_HOME"] = home
process.env["XDG_CONFIG_HOME"] = join(home, ".config")
process.env["XDG_DATA_HOME"] = join(home, ".local", "share")
process.env["XDG_CACHE_HOME"] = join(home, ".cache")
process.env["XDG_STATE_HOME"] = join(home, ".local", "state")
process.env["TMPDIR"] = join(base, "tmp")
process.env["OPENCODE_DISABLE_MODELS_FETCH"] = "true"
process.env["OPENCODE_DISABLE_AUTOUPDATE"] = "true"
process.chdir(home)

afterAll(() => rmSync(base, { recursive: true, force: true }))

interface HostClient {
  plugin: {
    list(input: { location: { directory: string } }): Promise<{ data: readonly { id?: string; state?: { status?: string; error?: string } }[] }>
  }
  mcp: { list(input: { location: { directory: string } }): Promise<{ data: readonly { name: string }[] }> }
  close(): Promise<void>
}

const until = async <T>(what: string, check: () => Promise<T | false | undefined>, timeoutMs = 90_000): Promise<T> => {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const value = await check()
    if (value) return value
    if (Date.now() > deadline) throw new Error(`timed out waiting until ${what}`)
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}

const entry = join(root, "dist", "index.js")

async function serversFor(options: Record<string, unknown>, name: string): Promise<readonly string[]> {
  expect(existsSync(entry), "run npm run bundle before the host test").toBe(true)
  const { OpenCode } = (await import(pathToFileURL(join(root, "node_modules", "@opencode", "sdk", "dist", "index.js")).href)) as typeof import("@opencode/sdk")
  const plugin = (await import(pathToFileURL(entry).href)) as { default: { id: string; setup: (ctx: unknown) => unknown } }
  const withOptions = {
    id: plugin.default.id,
    setup: (ctx: Record<string, unknown>) => plugin.default.setup({ ...ctx, options }),
  }
  const caseRoot = join(base, name)
  const config = join(caseRoot, "config")
  const work = join(caseRoot, "work")
  for (const dir of [config, work]) mkdirSync(dir, { recursive: true })
  const client = (await OpenCode.create({
    plugins: [withOptions as never],
    app: { version: "2.4.1" },
    config: { content: JSON.stringify({}), directory: config, project: false, claude: false } as never,
    database: { path: join(caseRoot, "opencode.db") },
    models: { fetch: false },
    fs: { filewatcher: false },
    log: { level: "error" },
  } as never)) as unknown as HostClient
  try {
    await until("the plugin is active", async () => {
      const { data } = await client.plugin.list({ location: { directory: work } })
      const state = data.find((item) => item.id === "notion")?.state
      if (state?.status === "failed") throw new Error(`the notion plugin failed: ${state.error ?? "no reason"}`)
      return state?.status === "active"
    })
    const { data } = await client.mcp.list({ location: { directory: work } })
    return data.map((server) => server.name).sort()
  } finally {
    await client.close()
  }
}

describe("the MCP servers setup registers on the real OpenCode 2.4.1 host", () => {
  test("registers notion for the default account", async () => {
    expect(await serversFor({}, "default")).toEqual(["notion"])
  }, 120_000)

  test("registers one server per alias", async () => {
    expect(await serversFor({ accounts: { work: {}, personal: {} } }, "aliases")).toEqual(["notion-personal", "notion-work"])
  }, 120_000)
})
