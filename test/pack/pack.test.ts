import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, relative, sep } from "node:path"
import { afterAll, describe, expect, test } from "vitest"
import { createHost } from "@we-the-rebel-alliance/plugin-contract/kit"

const root = join(import.meta.dirname, "..", "..")
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  name: string
  files: string[]
  exports: Record<string, string>
}
const work = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), "notion-pack-")))

afterAll(() => rmSync(work, { recursive: true, force: true }))

const run = (command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = process.env) => {
  const result = spawnSync(command, args, { cwd, env, encoding: "utf8" })
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed: ${result.stderr || result.stdout}`)
  return result.stdout
}

/** Every file under `dir`, relative to the repository root, with `/` separators. */
function filesOf(dir: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) found.push(...filesOf(path))
    else found.push(relative(root, path).split(sep).join("/"))
  }
  return found.sort()
}

/** The files the `files` whitelist expands to, as the repository holds them now. */
function expectedFiles(): string[] {
  const found = ["package.json"]
  for (const entry of pkg.files) {
    const path = join(root, entry)
    if (statSync(path).isDirectory()) found.push(...filesOf(path))
    else found.push(entry)
  }
  return found.sort()
}

describe("the packed plugin", () => {
  test("holds exactly the whitelist, imports only the host, and loads from the installed package", async () => {
    const packed = JSON.parse(run("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", work], root)) as { filename: string; files: { path: string }[] }[]
    const tarball = join(work, packed[0]!.filename)
    const paths = packed[0]!.files.map((file) => file.path).sort()
    expect(paths).toEqual(expectedFiles())
    expect(paths).toContain(pkg.exports["./server"]?.replace(/^\.\//, ""))

    const source = readFileSync(join(root, "dist", "index.js"), "utf8")
    const imports = [...source.matchAll(/(?:from|import)\s*\(?\s*"([^"]+)"/g)].map((match) => match[1]!)
    expect([...new Set(imports)].filter((name) => !name.startsWith("node:") && name !== "@opencode/plugin")).toEqual([])

    const project = join(work, "consumer")
    mkdirSync(project)
    writeFileSync(join(project, "package.json"), JSON.stringify({ name: "notion-pack-consumer", private: true, type: "module" }))
    run("npm", ["install", tarball, "--ignore-scripts", "--no-audit", "--no-fund", "--offline"], project)
    const installed = join(project, "node_modules", ...pkg.name.split("/"))

    const home = join(work, "home")
    mkdirSync(home)
    const added = spawnSync("opencode", ["plugin", "add", tarball], {
      cwd: project,
      env: { ...process.env, HOME: home, XDG_CONFIG_HOME: join(home, ".config"), XDG_DATA_HOME: join(home, ".local", "share"), XDG_CACHE_HOME: join(home, ".cache") },
      encoding: "utf8",
    })
    if (added.status === 0) {
      const listed = run("opencode", ["plugin", "list"], project, { ...process.env, HOME: home, XDG_CONFIG_HOME: join(home, ".config") })
      expect(listed).toContain(pkg.name)
    } else {
      // `opencode plugin add` installs into the global config, which may be offline here; the same packed entry must
      // still load through the kit's host resolver from the installed package. OpenCode provides @opencode/plugin at
      // runtime, so the consumer gets the repository's copy for the load.
      mkdirSync(join(project, "node_modules"), { recursive: true })
      symlinkSync(join(root, "node_modules", "@opencode"), join(project, "node_modules", "@opencode"), "dir")
      const runHost = await createHost({ directory: installed, version: "2.4.1", pluginId: "notion", options: { accounts: { work: {}, personal: {} } } })
      try {
        expect(runHost.failure).toBeUndefined()
        expect(runHost.definition?.id).toBe("notion")
        expect(runHost.tools.map((tool) => tool.name).sort()).toEqual(["events_list", "probe", "status"])
      } finally {
        await runHost.close()
      }
    }
  }, 300_000)
})
