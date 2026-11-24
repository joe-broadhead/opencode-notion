// The docs and skills must match the code: tool names, the access blocks, error codes, URLs and the release.
import { describe, expect, test } from "bun:test"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { CODES, TESTED_HOSTS, UNTESTED_EXAMPLE } from "../../src/constants.js"
import { DESTRUCTIVE_TOOLS, READ_TOOLS, WRITE_TOOLS } from "../../src/notion-tools.js"
import { METHODS, NEXT_STEPS, TOOLS_RPC_ID } from "../../src/host/tools-rpc.js"
import { ACCESS, defaultRules } from "../../src/permissions.js"

const ROOT = fileURLToPath(new URL("../..", import.meta.url))
// Everything a user or the model reads about the current release.
const FILES = [
  "README.md",
  "SECURITY.md",
  "CONTRIBUTING.md",
  "CHANGELOG.md",
  "AGENTS.md",
  ...readdirSync(join(ROOT, "docs")).map((name) => `docs/${name}`),
  ...readdirSync(join(ROOT, "skills")).map((name) => `skills/${name}/SKILL.md`),
]
const KNOWN = [...READ_TOOLS, ...WRITE_TOOLS, ...DESTRUCTIVE_TOOLS]
const raw = (file: string) => readFileSync(join(ROOT, file), "utf8")
const text = (file: string) => raw(file).replace(/\s+/g, " ")
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { name: string; version: string; repository: { url: string } }

describe("docs", () => {
  test("the package is renamed, restarted at 0.0.0, and the changelog has one section", () => {
    expect(pkg.name).toBe("@we-the-rebel-alliance/notion-plugin")
    expect(pkg.version).toBe("0.0.0")
    expect(pkg.repository.url).toContain("we-the-rebel-alliance/notion-plugin")
    expect(raw("CHANGELOG.md")).toMatch(/^## 0\.0\.0 \(unreleased\)$/m)
    expect(raw("CHANGELOG.md")).not.toMatch(/^## \[?0\.0\.[1-9]/m)
  })

  test.each(FILES)("%s states no count of read, write or declared tools that could go stale", (file) => {
    const counts = [...text(file).matchAll(/\b\d+ (?:known )?(?:read|write)(?:s\b| tools\b| read-only)|\b\d+ tools are declared/g)].map((match) => match[0])
    const stale = counts.filter((count) => !count.startsWith(`${READ_TOOLS.length} read`) && !count.startsWith(`${WRITE_TOOLS.length} write`) && count !== `${KNOWN.length} tools are declared`)
    expect(stale).toEqual([])
  })

  test.each(FILES)("%s names only Notion tools the plugin knows", (file) => {
    const named = [...text(file).matchAll(/\bnotion_(notion-[a-z0-9-]+)(?![\w*-])/g)].map((match) => match[1]!)
    expect(named.filter((tool) => !KNOWN.includes(tool))).toEqual([])
    const spans = [...text(file).matchAll(/`notion-([a-z0-9-]+)`/g)].map((match) => `notion-${match[1]!}`)
    expect(spans.filter((tool) => !KNOWN.includes(tool) && tool !== "notion-write").length).toBeLessThan(1)
  })

  test.each(FILES)("%s names no old organisation or repository, and points at blob/master", (file) => {
    const source = text(file)
    expect(source).not.toContain("joe-broadhead")
    expect(source).not.toContain("opencode-notion")
    for (const link of source.matchAll(/https:\/\/github\.com\/we-the-rebel-alliance\/notion-plugin\/(blob|tree)\/([^\s/)#]+)/g)) {
      expect({ file, link: link[2] }).toEqual({ file, link: "master" })
    }
  })

  test.each(["README.md", "docs/configuration.md", "docs/scripting.md", "SECURITY.md"])("%s says nothing provisional or pending", (file) => {
    expect(text(file)).not.toMatch(/provisional|not yet (?:checked|published|signed)|private package|TODO/i)
  })

  test("there is no Jelly app guide, and no doc links to one", () => {
    expect(existsSync(join(ROOT, "docs", "jelly.md"))).toBe(false)
    for (const file of FILES) expect({ file, hit: text(file).includes("docs/jelly.md") }).toEqual({ file, hit: false })
  })

  test("the README covers install, sign-in, access and what the plugin adds, and points at the docs", () => {
    const readme = text("README.md")
    expect(readme).toContain("github:we-the-rebel-alliance/notion-plugin#v0.0.0")
    expect(readme).toContain("Run `/connect`, choose **Notion**")
    expect(readme).toContain("**Every tool is allowed by default.**")
    expect(readme).toContain("tools[\"notion\"][\"notion-search\"]")
    expect(readme).toContain("`notion_events_list`")
    expect(readme).toContain("Not for Google Docs or Google Calendar (use the gws plugin), recorded meetings (granola), or remembering things across\nsessions (Memory).".replace("\n", " "))
    expect(readme).toContain("Notion Memory")
    expect(readme).toContain("docs/configuration.md")
  })

  test("the README's uninstall signs out before it removes the plugin", () => {
    const uninstall = /## Uninstall(.*?)## Links/.exec(text("README.md"))?.[1] ?? ""
    const logout = uninstall.indexOf("opencode mcp logout notion")
    const list = uninstall.indexOf("opencode auth list")
    const remove = uninstall.indexOf(`opencode plugin remove github:we-the-rebel-alliance/notion-plugin#v${pkg.version}`)
    expect(logout).toBeGreaterThanOrEqual(0)
    expect(list).toBeGreaterThan(logout)
    expect(remove).toBeGreaterThan(list)
  })

  // R6: one typed code table (CODES in src/constants.ts). `notionError`, `errorText` and `codeText` take a PluginCode, so
  // a code outside it does not compile; this finds any code that escaped the helpers, and keeps the README's table
  // equal to the table in both directions.
  test("every code raised in src/ is in CODES, and every non-rpc code in CODES is raised", () => {
    const sources = readdirSync(join(ROOT, "src")).filter((name) => name.endsWith(".ts")).map((name) => [name, readFileSync(join(ROOT, "src", name), "utf8")] as const)
    const found = new Set(sources.flatMap(([, source]) => [...source.matchAll(/(?:notionError|errorText|codeText)\(\s*"([A-Z][A-Z_]+)"/g)].map((match) => match[1]!)))
    for (const [, source] of sources) for (const match of source.matchAll(/`([A-Z][A-Z0-9]*_[A-Z0-9_]+): /g)) found.add(match[1]!)
    expect([...found].filter((code) => !(code in CODES))).toEqual([])
    const declared = Object.entries(CODES).filter(([, entry]) => entry.surface !== "rpc").map(([code]) => code)
    expect(declared.filter((code) => !found.has(code))).toEqual([])
  })

  test("the tools RPC's next steps are exactly the rpc codes in CODES", () => {
    const rpc = Object.entries(CODES).filter(([, entry]) => entry.surface === "rpc").map(([code]) => code)
    expect(Object.keys(NEXT_STEPS).sort()).toEqual(rpc.sort())
  })

  test("the README's Errors table is CODES, in both directions, with the same surface and when", () => {
    const errors = /## Errors\n([\s\S]*?)\n## /.exec(raw("README.md"))?.[1] ?? ""
    const rows = [...errors.matchAll(/\| `([A-Z][A-Z_]+)` \| ([a-z-]+) \| ([^|]+?) \|/g)].map(([, code, surface, when]) => [code!, { surface: surface!, when: when!.trim() }] as const)
    expect(Object.fromEntries(rows)).toEqual(CODES)
  })

  test("the configuration guide documents the setup and status codes, and the scripting guide the rpc ones", () => {
    const errors = /## Errors([\s\S]*)$/.exec(text("docs/configuration.md"))?.[1] ?? ""
    const setup = Object.entries(CODES).filter(([, entry]) => entry.surface !== "rpc").map(([code]) => code)
    expect([...errors.matchAll(/\| `([A-Z][A-Z_]+)` \|/g)].map((match) => match[1]!).sort()).toEqual(setup.sort())
    const scripting = /## Errors([\s\S]*?)## What scripts cannot do/.exec(text("docs/scripting.md"))?.[1] ?? ""
    for (const [code, entry] of Object.entries(CODES)) expect({ code, named: entry.surface !== "rpc" || scripting.includes(`\`${code}\``) }).toEqual({ code, named: true })
    const named = [...scripting.matchAll(/`([A-Z][A-Z_]+)`/g)].map((match) => match[1]!)
    expect(named.filter((code) => !(code in CODES))).toEqual([])
  })

  // R7 with R18: the configuration guide prints the whole block for every `access` value, generated from
  // defaultRules(access), so a class or an option change cannot leave the guide showing a block that is not what runs.
  test("the configuration guide prints the whole default-rules block for each access value, and each equals defaultRules(access)", () => {
    const blocks = [...raw("docs/configuration.md").matchAll(/```json\n(\[[\s\S]*?\])\n```/g)].map((match) => JSON.parse(match[1]!) as { action: string; effect: string }[])
    const arrays = blocks.filter((value) => Array.isArray(value) && value.some((item) => item?.action === "notion_*"))
    for (const access of ACCESS) {
      const expected = defaultRules(access)
      const found = arrays.filter((value) => JSON.stringify(value) === JSON.stringify(expected))
      expect({ access, found: found.length }).toEqual({ access, found: 1 })
    }
    for (const value of blocks) if (Array.isArray(value)) for (const item of value) expect(typeof item).toBe("object")
    expect(/## Permissions\n\n\*\*Every tool is allowed by default\.\*\*/.test(raw("docs/configuration.md"))).toBe(true)
  })

  // R8: every "tested on ..." mention is TESTED_HOSTS, and the untested example is a version that is not a release.
  test("every tested-on mention equals TESTED_HOSTS, and the untested example is not a tested release", () => {
    let mentions = 0
    const check = (file: string, source: string) => {
      for (const match of source.matchAll(/tested on /g)) {
        mentions += 1
        const run = /^\s*((?:\d+\.\d+\.\d+)(?:(?:,[ \t]*|\s+and\s+)(?:\d+\.\d+\.\d+))*)/.exec(source.slice(match.index! + match[0].length))?.[1] ?? ""
        expect({ file, versions: [...(run.match(/\d+\.\d+\.\d+/g) ?? [])] }).toEqual({ file, versions: [...TESTED_HOSTS] })
      }
    }
    for (const file of ["README.md", "SECURITY.md", "CONTRIBUTING.md", "docs/configuration.md"]) check(file, raw(file))
    expect(mentions).toBeGreaterThanOrEqual(2)
    const list = TESTED_HOSTS.length === 1 ? TESTED_HOSTS[0]! : `${TESTED_HOSTS.slice(0, -1).join(", ")} and ${TESTED_HOSTS.at(-1)}`
    for (const file of ["AGENTS.md", "CONTRIBUTING.md"]) expect({ file, list: text(file).includes(list) }).toEqual({ file, list: true })
    expect(text("docs/configuration.md")).toContain(UNTESTED_EXAMPLE)
    for (const version of TESTED_HOSTS) expect(text("docs/configuration.md")).not.toContain(`inside the range, such as ${version}`)
  })

  // R9: shipped text states behaviour, never who decided it, and names no lane.
  test("the shipped docs use no internal wording", () => {
    const banned = /\bowner(?:'s)? (?:decision|ruling|sign-off|call)\b|\bthe lead(?:'s)? (?:decision|ruling|audit|report|review)\b|\bhey-jelly\s*#|\b(?:audit|review|reconcile) lane\s+[A-Z]\d\b|\blane\s+G\d\b/i
    for (const file of FILES) expect({ file, hit: banned.exec(text(file))?.[0] }).toEqual({ file, hit: undefined })
  })

  // R1: every example runs the RPC this plugin registers, with the location header and the envelope, and names a method
  // in the table. A `<method>` placeholder names no method, but it must still carry the header and the body shape.
  test("every scripting example has the RPC id, the location header, the envelope, and a method in the table", () => {
    const names = new Set(["describe", ...METHODS.map((method) => method.name), "probe", "events_list"])
    let examples = 0
    for (const file of ["docs/scripting.md", "README.md"]) {
      const source = raw(file).replace(/\\\n\s*/g, " ")
      for (const match of source.matchAll(/opencode api post (\/api\/rpc\/[^\s/]+\/([A-Za-z0-9._<>-]+))[ \t]+([^\n]*)/g)) {
        examples += 1
        const [, path, method] = match
        const placeholder = method!.startsWith("<")
        expect({ file, path }).toEqual({ file, path: `/api/rpc/${TOOLS_RPC_ID}/${method}` })
        if (!placeholder) expect({ file, method, known: names.has(method!) }).toEqual({ file, method, known: true })
        const line = match[0]
        expect({ file, header: line.includes(`-H "x-opencode-directory:$PWD"`) }).toEqual({ file, header: true })
        if (placeholder) continue
        const window = source.slice(match.index!, match.index! + match[0].length + 400).replace(/\n\s+(?=["}])/g, "")
        const body = /-d '(\{[^']*\})'/.exec(window)
        expect({ file, body: body !== null }).toEqual({ file, body: true })
        const parsed = JSON.parse(body![1]!) as { input?: { sessionID?: unknown; input?: unknown } }
        expect({ file, envelope: typeof parsed.input }).toEqual({ file, envelope: "object" })
        const session = typeof parsed.input!.sessionID
        if (method === "describe") {
          expect({ file, session: session === "string" || session === "undefined" }).toEqual({ file, session: true })
          expect({ file, keys: Object.keys(parsed.input!).filter((key) => key !== "sessionID") }).toEqual({ file, keys: [] })
          continue
        }
        expect({ file, session }).toEqual({ file, session: "string" })
        expect({ file, input: typeof parsed.input!.input }).toEqual({ file, input: "object" })
      }
    }
    expect(examples).toBeGreaterThanOrEqual(3)
  })

  test("the docs say the tool and the RPC method share one run, and name the direct tool", () => {
    const architecture = text("docs/architecture.md")
    expect(architecture).toContain("notion_events_list")
    expect(architecture).toContain("the same run and schemas as the RPC method")
    expect(text("docs/scripting.md")).toContain("also a direct tool, `notion_events_list`")
  })
})
