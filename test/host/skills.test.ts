import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { afterAll, describe, expect, test } from "vitest"
import { parse as parseYaml } from "yaml"

const root = join(import.meta.dirname, "..", "..")
const base = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "notion-skills-")))
const home = join(base, "home")
const config = join(base, "config")
const location = { directory: join(base, "work") }
for (const dir of [home, config, location.directory, join(base, "tmp")]) mkdirSync(dir, { recursive: true })
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
    list(input: { location: typeof location }): Promise<{ data: readonly { id?: string; state?: { status?: string; error?: string } }[] }>
  }
  skill: { list(input: { location: typeof location }): Promise<{ data: readonly { id: string; name?: string; description?: string }[] }> }
  command: { list(input: { location: typeof location }): Promise<{ data: readonly { name: string }[] }> }
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

describe("the installed skills and command on the real OpenCode 2.4.1 host", () => {
  test("loads both skills and the /notion command", async () => {
    const entry = join(root, "dist", "index.js")
    expect(existsSync(entry), "run npm run bundle before the host test").toBe(true)
    const expected = new Map<string, string>()
    for (const entry of readdirSync(join(root, "skills"), { withFileTypes: true })) {
      if (!entry.isDirectory() || !existsSync(join(root, "skills", entry.name, "SKILL.md"))) continue
      const text = readFileSync(join(root, "skills", entry.name, "SKILL.md"), "utf8")
      const front = /^---\n([\s\S]*?)\n---/.exec(text)
      if (!front) throw new Error(`${entry.name} has no frontmatter`)
      const data = parseYaml(front[1]!) as { name?: unknown; description?: unknown }
      if (data.name !== entry.name) throw new Error(`${entry.name} must name itself in its frontmatter`)
      if (typeof data.description !== "string" || data.description.trim() === "" || data.description === ">" || data.description === "|") {
        throw new Error(`${entry.name} has no usable description`)
      }
      expected.set(entry.name, data.description)
    }
    expect(expected.size).toBeGreaterThan(0)

    const { OpenCode } = (await import(pathToFileURL(join(root, "node_modules", "@opencode", "sdk", "dist", "index.js")).href)) as typeof import("@opencode/sdk")
    const plugin = (await import(pathToFileURL(entry).href)) as { default: { id: string; setup: (ctx: unknown) => unknown } }
    const client = (await OpenCode.create({
      plugins: [plugin.default as never],
      app: { version: "2.4.1" },
      config: { content: JSON.stringify({}), directory: config, project: false, claude: false } as never,
      database: { path: join(base, "opencode.db") },
      models: { fetch: false },
      fs: { filewatcher: false },
      log: { level: "error" },
    } as never)) as unknown as HostClient

    try {
      await until("the plugin is active", async () => {
        const { data } = await client.plugin.list({ location })
        const state = data.find((item) => item.id === "notion")?.state
        if (state?.status === "failed") throw new Error(`the notion plugin failed: ${state.error ?? "no reason"}`)
        return state?.status === "active"
      })
      const { data: skills } = await client.skill.list({ location })
      // The host also ships its own built-in skills in a fresh home (`browser`, `opencode`, `report`); the plugin's
      // namespace must be exactly the package's skill directories, with the description its YAML frontmatter names.
      const pluginSkills = skills.filter((skill) => skill.id === "notion" || skill.id.startsWith("notion-"))
      expect(pluginSkills.map((skill) => skill.id).sort()).toEqual([...expected.keys()].sort())
      for (const skill of pluginSkills) {
        expect(skill.description).toBe(expected.get(skill.id))
      }
      const { data: commands } = await client.command.list({ location })
      expect(commands.map((command) => command.name)).toContain("notion")
    } finally {
      await client.close()
    }
  }, 120_000)
})
