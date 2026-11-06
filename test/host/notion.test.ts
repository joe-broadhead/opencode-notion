// The plugin on the public @opencode/sdk host: H1 load and connect, H2 what runs and what asks, H3 the permission
// model (P1-P5), H4 adoption and conflict, H5 /notion-status, H6 unload, the user's own server with a header secret that
// never reaches status or a script, the nine denied tools on every path (direct, model turns with Code Mode off and on,
// scripts) and their opt-in, the account capture, a server that asks for a sign-in, the CIMD sign-in OpenCode starts,
// and the /connect entry. Each describe owns one host.
import { ROOT } from "./isolate.js"
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test"
import { existsSync, realpathSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, sep } from "node:path"
import { Plugin } from "@opencode/plugin"
import { SUPPORTED_HOST, TESTED_HOSTS } from "../../src/constants.js"
import { DENY_TOOLS, WRITE_TOOLS } from "../../src/notion-tools.js"
import { defaultRules, type Rule } from "../../src/permissions.js"
import { SKILL_NAMES } from "../../src/skills.js"
import { StatusRpc } from "../../src/status.js"
import { TOOLS_RPC_ID } from "../../src/host/tools-rpc.js"
import { ACCOUNT_READ, CHALLENGE_SCOPE, CLIENT_URL, MODEL_ID, SAMPLE_READ, SAMPLE_WRITE } from "./fake-mcp.js"
import { agentRules, attempt, cleanup, effect, HOST_VERSION, session, startHost, until, type Host } from "./harness.js"

const AGENT_RULES = defaultRules().map((rule, index, rules) => `  ${JSON.stringify(rule)}${index < rules.length - 1 ? "," : ""}`).join("\n")
const AGENTS_NEXT_STEP = "Put the default rules shown by /notion-status first in each listed agent's own permissions, in opencode.json or the agent's Markdown file, followed by your top-level rules for Notion tools."
const TOKEN = "ntn_fake_host_test_0123456789"
const SIGN_IN = "Run /connect and choose Notion, then press o or Enter to open the link (in a terminal, opencode mcp auth notion opens it automatically: run it from the project folder where the plugin is installed, and if it answers MCP server not found: notion, wait a few seconds and run it again)."
const SIGN_IN_AGAIN = "Notion needs a new sign-in. Choose this account to sign in again."
/** The default list: two reads, every write, every denied tool, and the unknown one. */
const LISTED = 2 + WRITE_TOOLS.length + DENY_TOOLS.length + 1
const AVAILABLE = 2 + WRITE_TOOLS.length + 1
const OFF = `${DENY_TOOLS.slice(0, -1).join(", ")} and ${DENY_TOOLS.at(-1)}`

// Starting a host takes several seconds, more on a busy machine; the longest wait below polls a condition with 180 s.
setDefaultTimeout(300_000)
afterAll(cleanup)

const BUILT_IN = ["build", "general", "explore", "compaction", "title", "summary", "plan"]
const allow = (tool: string): Rule => ({ action: `notion_${tool}`, resource: "*", effect: "allow" })
const deny = (tool: string): Rule => ({ action: `notion_${tool}`, resource: "*", effect: "deny" })
const wildcard = (pattern: string) => new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`)
/** The host hides a tool when the last rule matching its action is a deny on every resource. */
const hidden = (rules: readonly Rule[], action: string) => {
  const last = rules.findLast((rule) => wildcard(rule.action).test(action))
  return last?.resource === "*" && last.effect === "deny"
}

/**
 * The host lists an MCP server's tools shortly after it connects. The registry lists the denied tools too; the deny
 * hides them from the model's tools and refuses them.
 */
const notionTools = (host: Host) =>
  until("Notion's tools are registered", async () => {
    const ids = (await host.probe().tool.list()).map((tool) => tool.id).filter((id) => id.startsWith("notion_"))
    return ids.length === LISTED && ids.sort()
  })

async function status(host: Host, sessionID: string) {
  await host.client.sessions.command({ sessionID, name: "notion-status", text: "" })
  return until("/notion-status posts its text", async () => {
    const inbox = await host.client.session.inbox.list({ sessionID })
    const posted = inbox.findLast((item) => item.type === "synthetic")
    return posted?.type === "synthetic" ? posted.payload.text : undefined
  })
}

/** Enough of the tools RPC's contract for the client to call describe, the account read and two known reads. */
const TOOLS_CONTRACT = {
  id: TOOLS_RPC_ID,
  methods: Object.fromEntries(["describe", ACCOUNT_READ, SAMPLE_READ, "notion-fetch"].map((name) => [name, { input: { type: "object" }, output: { type: "object" } }])),
  events: {},
}
type ToolsClient = Record<string, (input: object, options: object) => Promise<unknown>>
const toolsRpc = (host: Host) => (host.client.rpc as unknown as (definition: object) => ToolsClient)(TOOLS_CONTRACT)
/** A tools RPC call's output, or its error as JSON, so a test can search either for a secret. */
const scriptCall = (host: Host, method: string, input: object) =>
  toolsRpc(host)[method]!(input, { location: host.location }).then(
    (output) => JSON.stringify(output),
    (error: unknown) => JSON.stringify(error, Object.getOwnPropertyNames(error ?? {})),
  )

const statusRpc = (host: Host) => (host.client.rpc as unknown as (definition: typeof StatusRpc) => { status: (input: object, options: object) => Promise<Record<string, unknown>> })(StatusRpc).status({}, { location: host.location })

describe(`the plugin on OpenCode ${HOST_VERSION}`, () => {
  let host: Host
  beforeAll(async () => {
    host = await startHost({ config: () => ({ agents: { reviewer: { description: "Reviews changes", mode: "subagent" } } }) })
  })
  afterAll(() => host?.close())

  test("the host's global folders, temp folder and working directory are inside the test's temp root", async () => {
    const global = ["XDG_DATA_HOME", "XDG_STATE_HOME", "XDG_CACHE_HOME"].map((key) => join(process.env[key]!, "opencode"))
    expect(global.filter((path) => !existsSync(path))).toEqual([])
    const { paths } = await host.client.server.info()
    const used = [...global, realpathSync(paths.tmp), process.env.OPENCODE_TEST_HOME!, tmpdir(), process.cwd()]
    expect(used.filter((path) => !path.startsWith(ROOT + sep))).toEqual([])
  })

  test("H1: the plugin is active, notion is connected, and its tools, skills and command are registered", async () => {
    const { data: plugins } = await host.client.plugin.list({ location: host.location })
    expect(plugins.find((plugin) => plugin.id === "notion.workspace")?.state.status).toBe("active")
    const { data: servers } = await host.client.mcp.list({ location: host.location })
    expect(servers.find((server) => server.name === "notion")?.status).toEqual({ status: "connected" })
    expect(await notionTools(host)).toEqual([...["shiny_new_tool", SAMPLE_READ, ACCOUNT_READ, ...WRITE_TOOLS, ...DENY_TOOLS].map((tool) => `notion_${tool}`)].sort())
    const { data: skills } = await host.client.skill.list({ location: host.location })
    expect(skills.map((skill) => skill.id).filter((id) => id.startsWith("notion")).sort()).toEqual([...SKILL_NAMES].sort())
    const { data: commands } = await host.client.command.list({ location: host.location })
    expect(commands.map((command) => command.name)).toContain("notion-status")
  })

  test("P1: the rules sit right after the base allow in every built-in agent, once", async () => {
    const rules = await agentRules(host)
    for (const id of BUILT_IN) {
      const permissions = rules.get(id)!
      const base = permissions.findIndex((rule) => rule.action === "*" && rule.resource === "*" && rule.effect === "allow")
      expect(base).toBe(0)
      expect(permissions.slice(base + 1, base + 1 + defaultRules().length)).toEqual(defaultRules())
      expect(permissions.filter((rule) => rule.action === "notion_*")).toHaveLength(1)
      // The exact double-prefixed, hyphenated action the host evaluates.
      expect(permissions.some((rule) => rule.action === "notion_notion-search" && rule.effect === "allow")).toBe(true)
    }
  })

  test("P1: Plan and Explore are not weakened", async () => {
    expect(await effect(host, "plan", "edit")).toBe("deny")
    expect(await effect(host, "explore", "notion_notion-search")).toBe("deny")
    const explore = await session(host, "explore")
    expect(await attempt(host, explore, "explore", SAMPLE_READ)).toEqual({ asked: undefined, ok: false, error: `Tool.Error: Permission denied: notion_${SAMPLE_READ}` })
    const plan = await session(host, "plan")
    expect(await attempt(host, plan, "plan", "shiny_new_tool")).toMatchObject({ asked: "notion_shiny_new_tool", ok: false })
  })

  test("P2 and H2: known reads run without a prompt, everything else asks, and the denied tools are hidden", async () => {
    const build = await session(host)
    const before = host.fake.calls.length
    expect(await attempt(host, build, "build", SAMPLE_READ)).toMatchObject({ asked: undefined, ok: true })
    expect(await attempt(host, build, "build", "shiny_new_tool")).toEqual({ asked: "notion_shiny_new_tool", ok: false, error: "Permission.DeclinedError: " })
    // Every known write asks, and a declined ask never reaches Notion.
    for (const tool of WRITE_TOOLS) {
      expect({ tool, result: await attempt(host, build, "build", tool) }).toEqual({ tool, result: { asked: `notion_${tool}`, ok: false, error: "Permission.DeclinedError: " } })
    }
    expect(host.fake.calls.slice(before)).toEqual([SAMPLE_READ])
    const rules = (await agentRules(host)).get("build")!
    expect([`notion_${SAMPLE_READ}`, `notion_${SAMPLE_WRITE}`, "notion_shiny_new_tool"].filter((action) => hidden(rules, action))).toEqual([])
    // Each denied tool is hidden, refused with no prompt even when "always" would be the answer, and never reaches
    // Notion, in every built-in agent.
    const all = await agentRules(host)
    for (const tool of DENY_TOOLS) {
      for (const id of BUILT_IN) expect({ id, tool, hidden: hidden(all.get(id)!, `notion_${tool}`) }).toEqual({ id, tool, hidden: true })
      expect(await effect(host, "build", `notion_${tool}`)).toBe("deny")
      expect(await attempt(host, build, "build", tool, "always")).toEqual({ asked: undefined, ok: false, error: `Tool.Error: Permission denied: notion_${tool}` })
      expect(host.fake.calls).not.toContain(tool)
    }
  })

  test("no script reaches a denied tool: the tools RPC has no such method, and describe never lists one", async () => {
    const sessionID = await session(host)
    const described = await scriptCall(host, "describe", {})
    for (const tool of DENY_TOOLS) {
      expect(described).not.toContain(tool)
      const call = (host.client.rpc as unknown as { call: (input: object) => Promise<unknown> }).call
      const outcome = await call({ rpcID: TOOLS_RPC_ID, method: tool, input: { sessionID, input: { query: "trash it" } }, location: host.location }).then(
        (output) => ({ ran: true, output }),
        (error: unknown) => ({ ran: false, error: JSON.stringify(error, Object.getOwnPropertyNames(error ?? {})) }),
      )
      expect(outcome).toMatchObject({ ran: false })
      expect(host.fake.calls).not.toContain(tool)
    }
  })

  test("P4: a saved 'Always allow' removes the prompt", async () => {
    const build = await session(host)
    expect(await attempt(host, build, "build", "shiny_new_tool", "always")).toMatchObject({ asked: "notion_shiny_new_tool", ok: true })
    expect(await attempt(host, build, "build", "shiny_new_tool")).toMatchObject({ asked: undefined, ok: true })
    const { projectID } = await host.client.sessions.get({ sessionID: build })
    const saved = await host.client.permission.saved.list({ projectID })
    expect(saved.map(({ action, resource }) => ({ action, resource }))).toEqual([{ action: "notion_shiny_new_tool", resource: "*" }])
  })

  test("P5: an agent defined only in user config gets no rules, and Notion tools run there unprompted", async () => {
    const reviewer = (await agentRules(host)).get("reviewer")!
    expect(reviewer.some((rule) => rule.action.startsWith("notion_"))).toBe(false)
    const sessionID = await session(host, "reviewer")
    expect(await attempt(host, sessionID, "reviewer", SAMPLE_WRITE)).toMatchObject({ asked: undefined, ok: true })
  })

  test("H5: /notion-status reports the connection, the tools, the denied ones, the unguarded agent and its fix", async () => {
    await notionTools(host)
    const before = host.fake.calls.length
    const text = await status(host, await session(host))
    expect(text).toContain(`- Connection: connected (${host.fake.url}, registered by this plugin)`)
    // No account read yet, so no workspace name.
    expect(text).toContain("- Account: not read yet: it appears after a notion-get-self call\n")
    expect(text).toContain(`- Access: reads run without asking; the ${WRITE_TOOLS.length} changes and any new tool ask first; the ${DENY_TOOLS.length} that delete, replace a whole page, upload a Skill, drive a Notion agent or cancel an event are off; default rules missing in the agents listed below\n`)
    // Notion's own sign-in metadata calls the server beta; status says so wherever it runs.
    expect(text).toContain("- Server: Notion MCP (Beta): Notion may change its tools and behaviour\n")
    expect(text).toContain(`- Tools: ${AVAILABLE} available, 1 unknown: shiny_new_tool (unknown tools ask before running); off by default: ${OFF}\n`)
    expect(text).toContain(`- Agents without default rules: reviewer\n${AGENT_RULES}\n`)
    expect(text).toContain(`- Next step: ${AGENTS_NEXT_STEP}`)
    expect(text).toContain(`- OpenCode: ${HOST_VERSION} (${TESTED_HOSTS.includes(HOST_VERSION) ? "tested" : "untested"}; supported range ${SUPPORTED_HOST})`)
    expect(text).not.toContain("Plan")
    const output = await statusRpc(host)
    expect(output).toMatchObject({ state: "connected", workspace: null, connection: null, beta: true, tools: AVAILABLE, deniedTools: [...DENY_TOOLS], unknownCount: 1, listing: false, unguardedAgents: ["reviewer"] })
    // DR-9: status is built from the host's own lists; neither the command nor the RPC calls Notion. The dialog shows the
    // same RPC answer through the terminal UI, so it adds no call either.
    expect(host.fake.calls.slice(before)).toEqual([])
  })

  test("the account comes from a notion-get-self the model or a script asked for, never a call of the plugin's", async () => {
    expect(await statusRpc(host)).toMatchObject({ workspace: null, connection: null })
    const sessionID = await session(host)
    // The tools RPC's executor skips execute.after, so its result shaping records the account; the model path's hook
    // does the same for a model turn, which account.test.ts covers.
    expect(JSON.parse(await scriptCall(host, "notion-get-self", { sessionID, input: {} }))).toHaveProperty("output")
    const output = await until("status reads the workspace", async () => {
      const current = await statusRpc(host)
      return current.workspace === "Acme Robotics" ? current : undefined
    })
    expect(output).toMatchObject({ workspace: "Acme Robotics", connection: "person" })
    const text = await status(host, sessionID)
    expect(text).toContain("- Account: Acme Robotics\n")
    expect(text).toContain("; your Notion account;")
    // Only the invented workspace name and the type reach status: no user name or ID.
    for (const hidden of ["Jane Doe", "1111", "2222"]) expect(text).not.toContain(hidden)
  })

  test("H6: unloading the plugin removes the server, the rules and the command", async () => {
    // Registering a plugin with the same ID replaces the old generation, which disposes everything it registered.
    await host.client.plugin(Plugin.define({ id: "notion.workspace", setup: () => {} }))
    await until("the notion server is gone", async () => {
      const { data } = await host.client.mcp.list({ location: host.location })
      return !data.some((server) => server.name === "notion")
    })
    const rules = await agentRules(host)
    for (const id of BUILT_IN) expect(rules.get(id)!.some((rule) => rule.action.startsWith("notion_"))).toBe(false)
    const { data: commands } = await host.client.command.list({ location: host.location })
    expect(commands.map((command) => command.name)).not.toContain("notion-status")
  })
})

describe("the user's own notion server, with a secret in its headers", () => {
  let host: Host
  beforeAll(async () => {
    host = await startHost({
      config: (url) => ({ mcp: { servers: { notion: { type: "remote", url, oauth: false, headers: { "x-notion-test": "user", Authorization: `Bearer ${TOKEN}` } } } } }),
    })
  })
  afterAll(() => host?.close())

  test("H4: is adopted unchanged: the host sends its headers, and the plugin's rules still apply", async () => {
    expect(await attempt(host, await session(host), "build", SAMPLE_READ)).toMatchObject({ asked: undefined, ok: true })
    expect(await attempt(host, await session(host), "build", SAMPLE_WRITE)).toMatchObject({ asked: `notion_${SAMPLE_WRITE}`, ok: false })
    expect(host.fake.markers.length).toBeGreaterThan(0)
    expect(new Set(host.fake.markers)).toEqual(new Set(["user"]))
    expect(new Set(host.fake.authorizations)).toEqual(new Set([`Bearer ${TOKEN}`]))
  })

  test("the secret never reaches /notion-status or the status RPC, which name the entry as the user's own", async () => {
    const text = await status(host, await session(host))
    expect(text).toContain(`- Connection: connected (${host.fake.url}, your own mcp.servers.notion without OAuth, used unchanged)`)
    const output = await statusRpc(host)
    expect(output).toMatchObject({ state: "connected", source: { type: "adopted", signIn: "own" } })
    for (const shown of [text, JSON.stringify(output)]) {
      expect(shown).not.toContain(TOKEN)
      expect(shown).not.toMatch(/Bearer|Authorization/i)
    }
  })

  test("the secret never reaches a script: not describe, a result or an upstream error", async () => {
    const sessionID = await session(host)
    const describe = await scriptCall(host, "describe", {})
    expect(describe).toContain(SAMPLE_READ)
    const result = await scriptCall(host, SAMPLE_READ, { sessionID, input: { query: "Acme Robotics" } })
    expect(result).toContain(`called ${SAMPLE_READ}`)
    const failure = await scriptCall(host, SAMPLE_READ, { sessionID, input: { query: "fail" } })
    expect(failure).toContain("UPSTREAM_ERROR")
    for (const shown of [describe, result, failure]) {
      expect(shown).not.toContain(TOKEN)
      expect(shown).not.toMatch(/Bearer/i)
    }
  })
})

const scripted = (host: Host) => host.client.sessions as unknown as {
  create: (input: object) => Promise<{ id: string }>
  prompt: (input: object) => Promise<unknown>
}

/** A host whose own `notion` entry points at the fake, whose model is the fake's scripted model, with Code Mode on or off. */
async function modelHost(codemode: boolean) {
  const host = await startHost({
    config: (url) => ({
      mcp: { servers: { notion: { type: "remote", url, oauth: false, ...(codemode ? {} : { codemode: false }) } } },
      // No model leaves the machine: LM Studio's local API is the fake; the other local providers are off.
      providers: { lmstudio: { settings: { baseURL: `${new URL(url).origin}/v1` } }, ollama: { settings: { baseURL: "" } }, vllm: { settings: { baseURL: "" } } },
    }),
  })
  const models = host.client as unknown as { model: { list: (input: object) => Promise<{ data: { id: string; providerID: string }[] }> } }
  await until("the scripted model is listed", async () => (await models.model.list({ location: host.location })).data.find((model) => model.providerID === "lmstudio" && model.id === MODEL_ID))
  await notionTools(host)
  return host
}

describe("a model turn that asks for the denied tools, with Code Mode off", () => {
  let host: Host
  beforeAll(async () => {
    host = await modelHost(false)
  })
  afterAll(() => host?.close())

  test("the model's own calls to the denied tools never reach Notion, and none is offered to it", async () => {
    host.fake.model.script = DENY_TOOLS.map((tool) => ({ tool: `notion_${tool}`, arguments: { query: "trash it" } }))
    const before = host.fake.model.requests.length
    const sessionID = (await scripted(host).create({ agent: "build", location: host.location, model: { providerID: "lmstudio", id: MODEL_ID } })).id
    await scripted(host).prompt({ sessionID, text: "Delete the launch page and stop the agent." })
    const turns = () => host.fake.model.requests.slice(before) as { tools?: { function?: { name?: string } }[]; messages?: { role: string }[] }[]
    await until("the model's final turn", async () => turns().some((request) => (request.messages ?? []).filter((message) => message.role === "tool").length >= DENY_TOOLS.length))
    const offered = turns().flatMap((request) => (request.tools ?? []).map((item) => item.function?.name ?? ""))
    expect(offered.filter((name) => name.startsWith("notion_"))).toContain(`notion_${SAMPLE_READ}`)
    for (const tool of DENY_TOOLS) {
      expect(offered).not.toContain(`notion_${tool}`)
      expect(host.fake.calls).not.toContain(tool)
    }
  })
})

describe("a Code Mode turn that asks for the denied tools", () => {
  let host: Host
  beforeAll(async () => {
    host = await modelHost(true)
  })
  afterAll(() => host?.close())

  test("an inner tools.notion call to a denied tool fails inside the program and never reaches Notion; a read runs", async () => {
    const code = [
      "const results = []",
      `for (const name of ${JSON.stringify(DENY_TOOLS)}) {`,
      "  try { await tools.notion[name]({ query: 'trash it' }); results.push(name + ': ran') } catch (error) { results.push(name + ': refused') }",
      "}",
      `results.push(String((await tools.notion[${JSON.stringify(SAMPLE_READ)}]({})) !== undefined))`,
      "return results",
    ].join("\n")
    host.fake.model.script = [{ tool: "execute", arguments: { code } }]
    const before = host.fake.model.requests.length
    const sessionID = (await scripted(host).create({ agent: "build", location: host.location, model: { providerID: "lmstudio", id: MODEL_ID } })).id
    await scripted(host).prompt({ sessionID, text: "Delete the launch page and stop the agent." })
    await until("the model's final turn", async () => host.fake.model.requests.slice(before).some((request) => (request as { messages?: { role: string }[] }).messages?.some((message) => message.role === "tool")))
    expect(host.fake.calls).toContain(SAMPLE_READ)
    for (const tool of DENY_TOOLS) expect(host.fake.calls).not.toContain(tool)
  })

  // AF-5: a write inside a program asks, and a refusal stops it before Notion is called.
  test("a write inside the program asks, and a declined prompt stops it", async () => {
    const code = [
      "const results = []",
      `results.push(String((await tools.notion[${JSON.stringify(SAMPLE_READ)}]({})) !== undefined))`,
      `try { await tools.notion[${JSON.stringify(SAMPLE_WRITE)}]({ query: 'comment on it' }); results.push('write: ran') } catch (error) { results.push('write: refused') }`,
      "return results",
    ].join("\n")
    host.fake.model.script = [{ tool: "execute", arguments: { code } }]
    const sessionID = (await scripted(host).create({ agent: "build", location: host.location, model: { providerID: "lmstudio", id: MODEL_ID } })).id
    const before = host.fake.calls.length
    const turn = scripted(host).prompt({ sessionID, text: "Comment on the launch page." })
    const request = await until("the write asks for permission", async () => (await host.client.permission.list({ sessionID })).find((item) => item.action === `notion_${SAMPLE_WRITE}`))
    expect(request.action).toBe(`notion_${SAMPLE_WRITE}`)
    await host.client.permission.reply({ sessionID, requestID: request.id, decision: "reject" })
    await turn
    expect(host.fake.calls.slice(before)).not.toContain(SAMPLE_WRITE)
    // The read in the same program still ran, so the refusal was the write's alone.
    expect(host.fake.calls.slice(before)).toContain(SAMPLE_READ)
  })
})

describe("the documented opt-in for a denied tool", () => {
  // DP-1's recipe: the ask goes in the agent's own permissions, which come after the plugin's block in that agent.
  const tool = "notion-delete-pages"
  const optIn: Rule = { action: `notion_${tool}`, resource: "*", effect: "ask" }
  let host: Host
  beforeAll(async () => {
    host = await startHost({ config: () => ({ agents: { build: { permissions: [optIn] } } }) })
  })
  afterAll(() => host?.close())

  test("turns that one tool into a per-call ask in that agent, never an allow, and leaves the rest denied", async () => {
    await notionTools(host)
    const rules = (await agentRules(host)).get("build")!
    expect(rules.indexOf(rules.find((rule) => JSON.stringify(rule) === JSON.stringify(optIn))!)).toBeGreaterThan(rules.findIndex((rule) => rule.action === `notion_${tool}` && rule.effect === "deny"))
    expect(await effect(host, "build", `notion_${tool}`)).toBe("ask")
    const build = await session(host)
    expect(await attempt(host, build, "build", tool)).toEqual({ asked: `notion_${tool}`, ok: false, error: "Permission.DeclinedError: " })
    expect(host.fake.calls).not.toContain(tool)
    // Each call asks again: a "once" answer runs one call and saves nothing.
    expect(await attempt(host, build, "build", tool, "once")).toMatchObject({ asked: `notion_${tool}`, ok: true })
    expect(await attempt(host, build, "build", tool)).toMatchObject({ asked: `notion_${tool}`, ok: false })
    // The other agents, Explore included, and the other denied tools stay denied.
    for (const id of BUILT_IN.filter((id) => id !== "build")) expect({ id, effect: await effect(host, id, `notion_${tool}`) }).toEqual({ id, effect: "deny" })
    for (const other of DENY_TOOLS.filter((name) => name !== tool)) expect(await effect(host, "build", `notion_${other}`)).toBe("deny")
  })
})

describe("user permissions", () => {
  const userRules = [allow(SAMPLE_WRITE), deny(SAMPLE_READ)]
  let host: Host
  beforeAll(async () => {
    host = await startHost({
      config: () => ({
        permissions: userRules,
        // The documented fix for a config-only agent: the plugin's block first, then the user's rules again.
        agents: { reviewer: { description: "Reviews changes", mode: "subagent", permissions: [...defaultRules(), ...userRules] } },
      }),
    })
  })
  afterAll(() => host?.close())

  test("P3: a user allow on a write removes the prompt, and a user deny on a read hides it", async () => {
    const build = await session(host)
    expect(await attempt(host, build, "build", SAMPLE_WRITE)).toMatchObject({ asked: undefined, ok: true })
    expect(await attempt(host, build, "build", SAMPLE_READ)).toEqual({ asked: undefined, ok: false, error: `Tool.Error: Permission denied: notion_${SAMPLE_READ}` })
    expect(hidden((await agentRules(host)).get("build")!, `notion_${SAMPLE_READ}`)).toBe(true)
    expect(await attempt(host, build, "build", "shiny_new_tool")).toMatchObject({ asked: "notion_shiny_new_tool", ok: false })
  })

  test("P5: the per-agent fix guards a config-only agent and keeps the user's rules winning", async () => {
    const reviewer = await session(host, "reviewer")
    expect(await attempt(host, reviewer, "reviewer", "shiny_new_tool")).toMatchObject({ asked: "notion_shiny_new_tool", ok: false })
    expect(await attempt(host, reviewer, "reviewer", SAMPLE_WRITE)).toMatchObject({ asked: undefined, ok: true })
    expect(await attempt(host, reviewer, "reviewer", SAMPLE_READ)).toMatchObject({ asked: undefined, ok: false })
    expect(await status(host, reviewer)).toContain("- Agents without default rules: none\n")
  })
})

describe("a user notion server that points elsewhere", () => {
  let host: Host
  beforeAll(async () => {
    host = await startHost({ config: (url) => ({ mcp: { servers: { notion: { type: "remote", url: url.replace(/\/mcp$/, "/other"), oauth: false } } } }) })
  })
  afterAll(() => host?.close())

  test("H4: is left in place and reported as a conflict", async () => {
    const text = await status(host, await session(host))
    const other = host.fake.url.replace(/\/mcp$/, "/other")
    expect(text).toContain(`- Connection: conflict (your mcp.servers.notion points at ${other})`)
    expect(text).toContain(`- Next step: Your OpenCode config defines mcp.servers.notion with ${other}, but the plugin uses ${host.fake.url}.`)
  })
})

// The host lists a server's tools shortly after it connects. For those first seconds, no tools means "still listing",
// not "none for this account": the admin advice must wait.
describe("a server that just connected and lists no tools yet", () => {
  let host: Host
  beforeAll(async () => {
    host = await startHost({ fake: { emptyTools: true } })
  })
  afterAll(() => host?.close())

  test("is still listing, with no advice to ask an admin", async () => {
    const output = await statusRpc(host)
    expect(output).toMatchObject({ state: "connected", tools: 0, deniedTools: [], listing: true })
    expect(output.nextStep).toBe("Notion is still listing its tools. Run /notion-status again in a few seconds.")
    const text = await status(host, await session(host))
    expect(text).toContain("- Tools: none listed yet (Notion is still listing them)")
    expect(text).toContain("still listing its tools")
    expect(text).not.toContain("approved list")
  })
})

// Notion's server answers 401 with a bearer challenge until the user signs in, or after its grant is revoked. On the
// host's own MCP client that is a sign-in, not a failure: status says so, with the /connect step.
describe("a server that asks for a sign-in", () => {
  let host: Host
  beforeAll(async () => {
    // A token without a refresh token: a 401 then needs a new sign-in and keeps the credential, which is the account
    // /connect marks.
    host = await startHost({ oauth: true, fake: { refreshTokens: false } })
  })
  afterAll(() => host?.close())

  /** The /connect entry's connections, with the status a credential shows there. */
  const connections = async () => {
    const { data: servers } = await host.client.mcp.list({ location: host.location })
    const integrationID = servers.find((item) => item.name === "notion")?.integrationID
    if (!integrationID) return []
    const { data } = await host.client.integration.get({ integrationID, location: host.location })
    return (data as unknown as { connections?: { status?: { status: string; message?: string } }[] }).connections ?? []
  }

  /** Signs in through OpenCode's own flow: it signs in with its client URL, the authorization endpoint redirects the loopback callback, and the token endpoint exchanges the code. */
  const signIn = async () => {
    const { data: servers } = await host.client.mcp.list({ location: host.location })
    const integrationID = servers.find((item) => item.name === "notion")!.integrationID!
    const { data: integration } = await host.client.integration.get({ integrationID, location: host.location })
    const oauth = (host.client.integration as unknown as { oauth: Record<"connect", (input: object) => Promise<{ data: { attemptID: string; url: string } }>> }).oauth
    const { data: attempt } = await oauth.connect({ integrationID, methodID: (integration.methods as { id: string }[])[0]!.id, location: host.location })
    const redirect = await fetch(attempt.url, { redirect: "manual" })
    const callback = redirect.headers.get("location")
    expect(callback).toMatch(/^http:\/\/127\.0\.0\.1:\d+\//)
    await fetch(callback!)
  }

  test("is sign-in required, with the /connect next step, in the RPC and in /notion-status", async () => {
    await notionTools(host)
    expect(await statusRpc(host)).toMatchObject({ state: "connected" })
    // A real sign-in leaves a credential: the account /connect marks when Notion stops accepting it.
    host.fake.challenge = true
    await signIn()
    await until("the sign-in stores a token", async () => host.fake.tokens.length === 1)
    expect(host.fake.tokens[0]).toMatchObject({ grant_type: "authorization_code" })
    expect(host.fake.tokens[0]).not.toHaveProperty("refresh_token")
    host.fake.challenge = false
    await until("the server is connected after the sign-in", async () => {
      const { data } = await host.client.mcp.list({ location: host.location })
      return data.find((item) => item.name === "notion")?.status.status === "connected"
    })
    expect(await until("/connect shows the account", async () => (await connections()).find((item) => item.status?.message === undefined && (item as { type?: string }).type === "credential")))
    // Read the account while the signed-in connection works, so the later challenge is one that had a working sign-in:
    // this is the revoked-grant case, which the account clear on needs_auth must not erase.
    const sessionID = await session(host)
    await scriptCall(host, ACCOUNT_READ, { sessionID, input: {} })
    await until("the workspace is read", async () => ((await statusRpc(host)).workspace === "Acme Robotics" ? true : undefined), 180_000)
    // The tokens stop working: the next connection gets the challenge.
    host.fake.challenge = true
    const mcp = host.client.mcp as unknown as Record<"connect" | "disconnect", (input: object) => Promise<unknown>>
    await mcp.disconnect({ server: "notion", location: host.location })
    await mcp.connect({ server: "notion", location: host.location }).catch(() => {})
    const server = await until("the server needs a sign-in", async () => {
      const { data } = await host.client.mcp.list({ location: host.location })
      const found = data.find((item) => item.name === "notion")
      return found?.status.status === "needs_auth" ? found : undefined
    })
    expect(server.status.status).toBe("needs_auth")
    // The plugin marks the /connect account, so the person sees which one to choose there.
    expect(await until("/connect shows the new sign-in on the account", async () => (await connections()).find((item) => item.status?.message === SIGN_IN_AGAIN)))
    const output = await statusRpc(host)
    expect(output).toMatchObject({ state: "sign_in_required", workspace: null })
    // The account was cleared by the challenge, but the sign-in had worked: the step names a revoked grant.
    expect(output.nextStep).toContain(SIGN_IN)
    expect(output.nextStep).toContain("If this sign-in worked earlier, its grant may have been revoked")
    const text = await status(host, await session(host))
    expect(text).toContain(`- Connection: sign-in required (${host.fake.url}, registered by this plugin)`)
    expect(text).toContain("- Next step: Run /connect and choose Notion")
    expect(text).toContain("If this sign-in worked earlier, its grant may have been revoked")
    expect(text).not.toMatch(/authorize|code_challenge/)
    // The same account connects again once Notion answers: the mark is the plugin's, and it clears its own.
    host.fake.challenge = false
    await mcp.connect({ server: "notion", location: host.location })
    await until("the server is connected again", async () => {
      const { data } = await host.client.mcp.list({ location: host.location })
      return data.find((item) => item.name === "notion")?.status.status === "connected"
    })
    expect(await until("/connect clears the sign-in mark", async () => ((await connections()).some((item) => item.status?.message) ? undefined : true))).toBe(true)
  })
})

// The plugin pins one scope and no client: Notion advertises a client ID metadata document and the `none` auth method,
// so OpenCode signs in with its own client URL, asks only `default`, and registers nothing.
describe("the sign-in OpenCode starts", () => {
  let host: Host
  beforeAll(async () => {
    host = await startHost({ oauth: true })
  })
  afterAll(() => host?.close())

  test("signs in with its client metadata document and asks for the one scope, default", async () => {
    await notionTools(host)
    host.fake.challenge = true
    const { data: servers } = await host.client.mcp.list({ location: host.location })
    const integrationID = servers.find((item) => item.name === "notion")!.integrationID!
    const { data: integration } = await host.client.integration.get({ integrationID, location: host.location })
    const oauth = (host.client.integration as unknown as { oauth: Record<"connect" | "cancel", (input: object) => Promise<{ data: { attemptID: string; url: string } }>> }).oauth
    const { data: attempt } = await oauth.connect({ integrationID, methodID: (integration.methods as { id: string }[])[0]!.id, location: host.location })
    try {
      // The authorization request is issued when the person opens the link; fetch it without following the callback.
      const redirect = await fetch(attempt.url, { redirect: "manual" })
      expect(redirect.headers.get("location")).toMatch(/^http:\/\/127\.0\.0\.1:\d+\//)
      const url = new URL(attempt.url)
      expect(`${url.origin}${url.pathname}`).toBe(`${host.fake.origin}/oauth/authorize`)
      expect(url.searchParams.get("scope")).toBe(CHALLENGE_SCOPE)
      expect(url.searchParams.get("code_challenge_method")).toBe("S256")
      expect(url.searchParams.get("client_id")).toBe(CLIENT_URL)
      expect(url.searchParams.get("redirect_uri")).toMatch(/^http:\/\/127\.0\.0\.1:\d+\//)
      // Nothing was registered, and no token was exchanged for this attempt's start.
      expect(host.fake.authorizeRequests).toHaveLength(1)
      expect(host.fake.tokens).toHaveLength(0)
    } finally {
      await oauth.cancel({ integrationID, attemptID: attempt.attemptID, location: host.location }).catch(() => {})
    }
  })
})

// BUILD-LESSONS, "The scope request": no challenge scope means OpenCode asks for every scope the metadata advertises,
// which for Notion includes `ema_issuer:manage`. The pin is what keeps the request to `default`; removing it fails here.
describe("a sign-in whose challenge names no scope", () => {
  let host: Host
  beforeAll(async () => {
    host = await startHost({ oauth: true, fake: { challengeScope: false } })
  })
  afterAll(() => host?.close())

  test("still asks for default alone, not the metadata's ema_issuer:manage", async () => {
    await notionTools(host)
    host.fake.challenge = true
    const { data: servers } = await host.client.mcp.list({ location: host.location })
    const integrationID = servers.find((item) => item.name === "notion")!.integrationID!
    const { data: integration } = await host.client.integration.get({ integrationID, location: host.location })
    const oauth = (host.client.integration as unknown as { oauth: Record<"connect" | "cancel", (input: object) => Promise<{ data: { attemptID: string; url: string } }>> }).oauth
    const { data: attempt } = await oauth.connect({ integrationID, methodID: (integration.methods as { id: string }[])[0]!.id, location: host.location })
    try {
      const url = new URL(attempt.url)
      expect(url.searchParams.get("scope")).toBe(CHALLENGE_SCOPE)
      // The metadata a real Notion sign-in server publishes. Without the pin this request would carry both scopes.
      expect((await (await fetch(`${host.fake.origin}/.well-known/oauth-protected-resource/mcp`)).json() as { scopes_supported: string[] }).scopes_supported).toEqual(["default", "ema_issuer:manage"])
    } finally {
      await oauth.cancel({ integrationID, attemptID: attempt.attemptID, location: host.location }).catch(() => {})
    }
  })
})

describe("the /connect entry", () => {
  let host: Host
  beforeAll(async () => {
    host = await startHost({ oauth: true })
  })
  afterAll(() => host?.close())

  const entry = async () => {
    const { data } = await host.client.mcp.list({ location: host.location })
    const integrationID = data.find((server) => server.name === "notion")?.integrationID
    if (!integrationID) return undefined
    return (await host.client.integration.get({ integrationID, location: host.location })).data
  }

  test("is named Notion, also after the host reloads its MCP servers", async () => {
    expect((await until("the entry is named Notion", async () => ((await entry())?.name === "Notion" ? entry() : undefined)))?.methods).toHaveLength(1)
    await host.probe().mcp.reload()
    await until("the entry is named Notion again after the reload", async () => (await entry())?.name === "Notion")
    await Bun.sleep(1000)
    expect((await entry())?.name).toBe("Notion")
  })
})
