import { describe, expect, test } from "bun:test"
import { checkHost } from "../../src/host-version.js"
import { defaultRules } from "../../src/permissions.js"
import { buildStatus, formatStatus, readStatus, registerStatusCommand, registerStatusRpc, shortReason, StatusRpc, type Status, type StatusContext, type StatusFacts } from "../../src/status.js"
import { VERSION } from "../../src/version.js"
import { DENY_TOOLS, WRITE_TOOLS } from "../../src/notion-tools.js"
import { allow } from "./fake.js"

const SIGN_IN = "Run /connect and choose Notion, then press o or Enter to open the link (in a terminal, opencode mcp auth notion opens it automatically)."
const REVOKED =
  "If this sign-in worked earlier, its grant may have been revoked: Notion revokes the whole grant when a refresh token is reused, which two OpenCode processes sharing one sign-in do. Run opencode mcp logout notion, then sign in once."
const NOTHING_TO_DO = "Nothing to do."
/** The default rules as /notion-status shows them: one rule a line, a JSON array body. */
const AGENT_RULES = defaultRules().map((rule, index, rules) => `  ${JSON.stringify(rule)}${index < rules.length - 1 ? "," : ""}`).join("\n")

const host = checkHost("2.2.3", false)
const URL = "https://mcp.notion.com/mcp"
const base: StatusFacts = { server: { status: "connected" }, source: { type: "plugin", url: URL, signIn: "oauth" }, host, tools: ["notion-search"] }
const guarded = { id: "build", permissions: [allow("*"), ...defaultRules()] }
const RULES = "no agent runs new Notion tools unasked"
const POSTURE = `reads run without asking; the ${WRITE_TOOLS.length} changes and any new tool ask first; the ${DENY_TOOLS.length} that delete, replace a whole page, upload a Skill, drive a Notion agent or cancel an event are off`
const ACCESS = `${POSTURE}; ${RULES}`

describe("buildStatus", () => {
  test("connected, with the workspace read, and nothing left to do", () => {
    const status = buildStatus({ ...base, account: { workspace: "Acme Robotics", connection: "person" }, agents: [guarded] })
    expect(status).toEqual({
      version: VERSION,
      state: "connected",
      source: { type: "plugin", url: URL, signIn: "oauth" },
      workspace: "Acme Robotics",
      connection: "person",
      tools: 1,
      deniedTools: [],
      listing: false,
      unknownCount: 0,
      unknownTools: [],
      unguardedAgents: [],
      host: { version: "2.2.3", range: ">=2.2.3 <2.3.0", tested: true },
      problems: [],
      nextStep: "Nothing to do.",
    })
    expect(formatStatus(status)).toBe(
      [
        "Notion status",
        "- Connection: connected (https://mcp.notion.com/mcp, registered by this plugin)",
        "- Account: Acme Robotics",
        `- Access: ${POSTURE}; your Notion account; ${RULES}`,
        "- Tools: 1 available, 0 unknown",
        "- Agents without default rules: none",
        "- OpenCode: 2.2.3 (tested; supported range >=2.2.3 <2.3.0)",
        "- Next step: Nothing to do.",
      ].join("\n"),
    )
  })

  test("before an account read, the Account row says so, and the connection type is unknown", () => {
    const status = buildStatus(base)
    expect(status).toMatchObject({ workspace: null, connection: null })
    const text = formatStatus(status)
    expect(text).toContain("- Account: not read yet: it appears after the first Notion call since OpenCode started\n")
    expect(text).toContain(`- Access: ${ACCESS}\n`)
    expect(text).not.toContain("your Notion account")
  })

  test("a workspace connection says its tool list is the admin's", () => {
    expect(formatStatus(buildStatus({ ...base, account: { workspace: "Acme Robotics", connection: "bot" } }))).toContain(
      `- Access: ${POSTURE}; a workspace connection with an admin-chosen tool list; ${RULES}\n`,
    )
  })

  test.each([
    [{ status: "needs_auth", error: "Authorization required" }, "sign_in_required", "sign-in required", SIGN_IN],
    [{ status: "failed", error: "fetch failed" }, "failed", "failed", "Check your network, then run /notion-status again."],
    [{ status: "disabled" }, "disabled", "disabled", `The notion MCP server is disabled. Enable it in /mcps, or remove "disabled": true from mcp.servers.notion in opencode.json.`],
    [{ status: "pending" }, "connecting", "connecting", "Notion is still connecting. Run /notion-status again in a few seconds."],
    [undefined, "not_configured", "not configured", "OpenCode has no notion MCP server. Check that no organisation policy (mcp.use) or other plugin removes it, then restart OpenCode."],
  ] as const)("%j is %s with the exact label and next step", (server, state, label, nextStep) => {
    const status = buildStatus({ ...base, ...(server ? { server } : { server: undefined }) })
    expect(status.state).toBe(state)
    expect(status.nextStep).toBe(nextStep)
    expect(formatStatus(status)).toContain(`- Connection: ${label}`)
    expect(formatStatus(status)).toContain(`- Next step: ${nextStep}`)
  })

  // Notion rotates a refresh token on every use; reusing one revokes the whole grant.
  test("a sign-in that worked and then failed says a revoked grant is possible, and one that never worked does not", () => {
    const before = buildStatus({ ...base, server: { status: "needs_auth" } })
    expect(before.nextStep).toBe(SIGN_IN)
    const after = buildStatus({ ...base, server: { status: "needs_auth" }, account: { workspace: "Acme Robotics", connection: "person" } })
    expect(after.nextStep).toBe(`${SIGN_IN} ${REVOKED}`)
    // A status read forgets the workspace as soon as the server needs a new sign-in, so the plain step comes back once
    // the model's last notion-get-self is no longer current.
    expect(after.workspace).toBe("Acme Robotics")
  })

  test("shows a failure's reason on one short line, without URL queries, and never the text of a needed sign-in", () => {
    const failed = buildStatus({ ...base, server: { status: "failed", error: "SSE error:\n  fetch https://mcp.notion.com/mcp?token=secret-123 failed.\n" } })
    expect(failed.error).toBe("SSE error: fetch https://mcp.notion.com/mcp failed")
    expect(formatStatus(failed)).toContain(`- Connection: failed (SSE error: fetch https://mcp.notion.com/mcp failed; ${URL}, registered by this plugin)`)
    expect(shortReason("word ".repeat(100))).toHaveLength(160)
    expect(shortReason(" \n. ")).toBeUndefined()
    const signIn = buildStatus({ ...base, server: { status: "needs_auth", error: "Visit https://mcp.notion.com/authorize?code=abc to sign in" } })
    expect(signIn.error).toBeUndefined()
    expect(formatStatus(signIn)).not.toContain("authorize")
  })

  test("adopted and conflicting servers", () => {
    expect(formatStatus(buildStatus({ ...base, source: { type: "adopted", url: URL, signIn: "oauth" } }))).toContain(`- Connection: connected (${URL}, your own mcp.servers.notion, used unchanged)`)
    const conflict = buildStatus({ ...base, source: { type: "conflict", url: "https://notion.example.com/mcp", expected: URL } })
    expect(conflict.state).toBe("conflict")
    expect(conflict.nextStep).toBe(
      `Your OpenCode config defines mcp.servers.notion with https://notion.example.com/mcp, but the plugin uses ${URL}. Point it at ${URL} or remove it, then restart OpenCode.`,
    )
    expect(formatStatus(conflict)).toContain("- Connection: conflict (your mcp.servers.notion points at https://notion.example.com/mcp)")
  })

  test("a user's own entry with an MCP token says so, and its failure points at the token", () => {
    const own = { type: "adopted", url: URL, signIn: "own" } as const
    expect(formatStatus(buildStatus({ ...base, source: own }))).toContain(`- Connection: connected (${URL}, your own mcp.servers.notion without OAuth, used unchanged)`)
    expect(buildStatus({ ...base, source: own, server: { status: "failed", error: "HTTP 401" } }).nextStep).toBe(
      'Check the MCP token in the headers of your own mcp.servers.notion (a workspace owner creates it in Notion\'s developer portal), then restart OpenCode.',
    )
  })

  test("connected with no tools names the Enterprise approved list", () => {
    expect(buildStatus({ ...base, tools: [], agents: [{ id: "reviewer", permissions: [allow("*")] }] }).nextStep).toBe(
      "Notion lists no tools for this connection. Ask an admin whether AI apps are restricted to an approved list (Settings, Connections, Permissions, AI apps), then sign in again.",
    )
  })

  test("counts the available tools, names the unknown ones, and counts denied ones apart; missing known tools are normal", () => {
    const status = buildStatus({ ...base, tools: ["notion-search", "notion-create-comment", "notion-delete-pages", "shiny-new-tool", "notion-schedule-interview"] })
    expect(status.tools).toBe(4)
    expect(status.deniedTools).toEqual(["notion-delete-pages"])
    expect(status.unknownCount).toBe(2)
    expect(status.unknownTools).toEqual(["shiny-new-tool", "notion-schedule-interview"])
    expect(formatStatus(status)).toContain("- Tools: 4 available, 2 unknown: shiny-new-tool, notion-schedule-interview (unknown tools ask before running); off by default: notion-delete-pages\n")
    expect(status.nextStep).toBe(NOTHING_TO_DO)
    const denied = buildStatus({ ...base, tools: ["notion-search", "notion-delete-pages", "notion-restore-version"] })
    expect(formatStatus(denied)).toContain("- Tools: 1 available, 0 unknown; off by default: notion-delete-pages and notion-restore-version\n")
  })

  test("a server that just connected and lists no tools yet is still listing them, with no advice to ask an admin", () => {
    const listing = buildStatus({ ...base, tools: [], settling: true })
    expect(listing).toMatchObject({ state: "connected", tools: 0, listing: true, nextStep: "Notion is still listing its tools. Run /notion-status again in a few seconds." })
    const text = formatStatus(listing)
    expect(text).toContain("- Connection: connected (https://mcp.notion.com/mcp, registered by this plugin; still listing its tools)")
    expect(text).toContain("- Tools: none listed yet (Notion is still listing them)")
    expect(text).not.toContain("approved list")
    // Settled, with no tools: the admin step.
    expect(buildStatus({ ...base, tools: [], settling: false }).nextStep).toStartWith("Notion lists no tools for this connection.")
    // Not connected: the connection's own step, never "listing".
    expect(buildStatus({ ...base, tools: [], settling: true, server: { status: "pending" } })).toMatchObject({ listing: false, state: "connecting" })
  })

  test("the Access row says whether the default rules are in place, from what status can see", () => {
    expect(formatStatus(buildStatus(base))).toContain(`- Access: ${ACCESS}\n`)
    // The posture is the tool lists': 23 changes ask, 9 tools are off.
    expect(ACCESS).toContain(`the ${WRITE_TOOLS.length} changes and any new tool ask first`)
    expect(ACCESS).toContain(`the ${DENY_TOOLS.length} that delete, replace a whole page, upload a Skill, drive a Notion agent or cancel an event are off`)
    const missing = buildStatus({ ...base, agents: [{ id: "reviewer", permissions: [allow("*")] }] })
    expect(formatStatus(missing)).toContain(`- Access: ${POSTURE}; default rules missing in the agents listed below\n`)
    const problem = "RULES_NOT_ADDED: Notion's default permission rules could not be added (boom), so Notion tools may run without asking. Next step: Restart OpenCode."
    expect(formatStatus(buildStatus({ ...base, problems: [problem] }))).toContain(`- Access: ${POSTURE}; default rules not added (see the OpenCode row)\n`)
  })

  test("a failure's reason never carries a token or key the host's text echoed", () => {
    const failed = buildStatus({ ...base, server: { status: "failed", error: "HTTP 401 for Authorization: Bearer sk-fake-abcdef123456 and api_key=fake-key-000111" } })
    expect(failed.error).toBeDefined()
    expect(failed.error).not.toMatch(/sk-fake|abcdef123456|fake-key-000111/)
  })

  test("names at most 20 unknown tools, and only plain names, but counts them all", () => {
    const odd = ["Bad Name", "x".repeat(70), "evil\u001b[31m", "-dash"]
    const many = Array.from({ length: 25 }, (_, index) => `notion-new-tool-${index}`)
    const status = buildStatus({ ...base, tools: ["notion-search", ...odd, ...many] })
    expect(status.unknownCount).toBe(29)
    expect(status.unknownTools).toEqual(many.slice(0, 20))
    expect(formatStatus(status)).toContain(`- Tools: 30 available, 29 unknown: ${many.slice(0, 20).join(", ")} and 9 more (unknown tools ask before running)`)
    expect(formatStatus(buildStatus({ ...base, tools: odd }))).toContain("- Tools: 4 available, 4 unknown (unknown tools ask before running)")
  })

  test("names agents without the default rules, with the block to paste, and points the next step at it", () => {
    const status = buildStatus({ ...base, agents: [guarded, { id: "reviewer", permissions: [allow("*")] }] })
    expect(status.unguardedAgents).toEqual(["reviewer"])
    expect(status.nextStep).toBe(
      "Put the default rules shown by /notion-status first in each listed agent's own permissions, in opencode.json or the agent's Markdown file, followed by your top-level rules for Notion tools.",
    )
    expect(JSON.parse(`[${AGENT_RULES}]`)).toEqual(defaultRules())
    expect(formatStatus(status)).toContain(`- Agents without default rules: reviewer\n${AGENT_RULES}\n- OpenCode:`)
  })

  test("an agent whose own rules already ask or deny for every Notion tool is not listed", () => {
    const agents = [
      { id: "asks-everything", permissions: [allow("*"), { action: "*", resource: "*", effect: "ask" as const }] },
      { id: "denies-notion", permissions: [allow("*"), { action: "notion_*", resource: "*", effect: "deny" as const }] },
      { id: "reviewer", permissions: [allow("*")] },
    ]
    expect(buildStatus({ ...base, agents }).unguardedAgents).toEqual(["reviewer"])
  })

  test("the sign-in step comes before the agent fix, which still shows, and there is one next step", () => {
    const status = buildStatus({ ...base, server: { status: "needs_auth", error: "x" }, agents: [{ id: "reviewer", permissions: [allow("*")] }] })
    expect(status.nextStep).toBe(SIGN_IN)
    const text = formatStatus(status)
    expect(text).toContain(`- Connection: sign-in required (${URL}, registered by this plugin)`)
    expect(text).toContain("- Agents without default rules: reviewer\n")
    expect(text.match(/Next step/g)).toHaveLength(1)
  })

  test("the rows come in the standard order", () => {
    const rows = formatStatus(buildStatus(base)).split("\n").filter((line) => line.startsWith("- ")).map((line) => line.slice(2, line.indexOf(":")))
    expect(rows).toEqual(["Connection", "Account", "Access", "Tools", "Agents without default rules", "OpenCode", "Next step"])
  })

  test("a skill of the same id at another path shadows the plugin's: status names it, after any other next step", () => {
    const own = [{ id: "notion", path: "/pkg/skills/notion/SKILL.md" }, { id: "notion-write", path: "/pkg/skills/notion-write/SKILL.md" }]
    const listed = [{ id: "notion", path: "/projects/acme/.opencode/skills/notion/SKILL.md" }, own[1]!, { id: "other", path: "/x" }]
    const status = buildStatus({ ...base, skills: { own, listed } })
    expect(status.shadowedSkills).toEqual([{ id: "notion", path: "/projects/acme/.opencode/skills/notion/SKILL.md" }])
    expect(status.nextStep).toBe(
      'Rename or move the "notion" skill at /projects/acme/.opencode/skills/notion/SKILL.md, which OpenCode loads instead of the plugin\'s skill of the same name.',
    )
    expect(buildStatus({ ...base, skills: { own, listed: own } })).not.toHaveProperty("shadowedSkills")
    expect(buildStatus({ ...base, skills: { own, listed }, agents: [{ id: "reviewer", permissions: [allow("*")] }] }).nextStep).toStartWith("Put the default rules")
  })

  test("an untested host and setup problems show on the OpenCode row; a problem's own next step comes first", () => {
    const outside = checkHost("2.3.0", true)
    const problem = 'SKILLS_INVALID: The "notion" skill was not loaded: skills/notion/SKILL.md is missing. Next step: Reinstall the plugin.'
    const status = buildStatus({ ...base, host: outside, problems: [problem] })
    expect(status.nextStep).toBe("Reinstall the plugin.")
    expect(formatStatus(status)).toContain(
      `- OpenCode: 2.3.0 (untested; supported range >=2.2.3 <2.3.0). It is outside the supported range; the plugin runs because allowUntestedHost is true. If Notion misbehaves, use OpenCode 2.2.3, 2.2.4 or 2.2.5. ${problem}`,
    )
    expect(buildStatus({ ...base, host: outside }).nextStep).toBe(NOTHING_TO_DO)
    const inside = buildStatus({ ...base, host: checkHost("2.2.6", false) })
    expect(inside).toMatchObject({ state: "connected", host: { version: "2.2.6", tested: false }, nextStep: NOTHING_TO_DO })
    expect(buildStatus({ ...base, host: checkHost("2.2.6", false), server: { status: "needs_auth" } }).nextStep).toBe(SIGN_IN)
    expect(formatStatus(inside)).toContain("- OpenCode: 2.2.6 (untested; supported range >=2.2.3 <2.3.0)\n")
    expect(formatStatus(buildStatus({ ...base, host: checkHost("2.2.5", false) }))).toContain("- OpenCode: 2.2.5 (tested; supported range >=2.2.3 <2.3.0)\n")
  })
})

function statusContext(server: string, skills: Promise<unknown> = Promise.resolve({ data: [] })) {
  const ctx = {
    mcp: { list: async () => ({ data: [{ name: "github", status: { status: "connected" } }, { name: "notion", status: { status: server }, integrationID: "mcp_fake" }] }) },
    agent: { list: async () => ({ data: [guarded, { id: "reviewer", permissions: [allow("*")] }] }) },
    tool: {
      list: async () => [
        { id: "notion_notion-search", name: "notion-search", options: { namespace: "notion" } },
        { id: "notion_shiny-new-tool", name: "shiny-new-tool", options: { namespace: "notion" } },
        { id: "other_search", name: "search", options: { namespace: "other" } },
        { id: "read", name: "read" },
      ],
    },
    skill: { list: () => skills },
  }
  return ctx as unknown as StatusContext
}

/** A captured account whose reads the test can count and forget. */
function accountState(account: { workspace?: string; connection?: "person" | "bot" } | undefined) {
  const state: { current: { workspace?: string; connection?: "person" | "bot" } | undefined; forgotten: number } = { current: account, forgotten: 0 }
  return {
    current: () => state.current,
    forget: () => {
      state.forgotten++
      state.current = undefined
    },
    state,
  }
}

describe("readStatus", () => {
  test("reads connection, the workspace, tools and agents through public APIs", async () => {
    const account = accountState({ workspace: "Acme Robotics", connection: "person" })
    const status = await readStatus(statusContext("connected"), { source: { type: "plugin", url: URL, signIn: "oauth" }, host, problems: [], account, listing: { changedAt: () => 0 } })
    expect(status).toMatchObject({ state: "connected", workspace: "Acme Robotics", connection: "person", tools: 2, unknownTools: ["shiny-new-tool"], unguardedAgents: ["reviewer"], listing: false })
  })

  test("before an account read, both account fields are null", async () => {
    const status = await readStatus(statusContext("connected"), { host })
    expect(status).toMatchObject({ workspace: null, connection: null })
  })

  test("a server that needs a new sign-in forgets the workspace, so the revoked-grant step cannot outlive it", async () => {
    const account = accountState({ workspace: "Acme Robotics", connection: "person" })
    const status = await readStatus(statusContext("needs_auth"), { host, account })
    expect(account.state.forgotten).toBe(1)
    expect(status).toMatchObject({ state: "sign_in_required", workspace: null, connection: null, nextStep: SIGN_IN })
  })

  test("no tools moments after a status change is still listing; later it is not", async () => {
    const empty = statusContext("connected")
    ;(empty as unknown as { tool: { list: () => Promise<unknown[]> } }).tool.list = async () => []
    expect(await readStatus(empty, { host, listing: { changedAt: () => Date.now() } })).toMatchObject({ listing: true })
    expect(await readStatus(empty, { host, listing: { changedAt: () => Date.now() - 60_000 } })).toMatchObject({ listing: false })
  })

  test("names shadowed skills from the host's list, and a failed skill list hides nothing else", async () => {
    const own = [{ id: "notion", path: "/pkg/skills/notion/SKILL.md" }]
    const listed = Promise.resolve({ data: [{ id: "notion", path: "/home-skills/notion/SKILL.md" }] })
    expect((await readStatus(statusContext("connected", listed), { host, skills: own })).shadowedSkills).toEqual([{ id: "notion", path: "/home-skills/notion/SKILL.md" }])
    const failed = await readStatus(statusContext("connected", Promise.reject(new Error("offline"))), { host, skills: own })
    expect(failed).toMatchObject({ state: "connected", tools: 2 })
    expect(failed).not.toHaveProperty("shadowedSkills")
  })
})

describe("/notion-status", () => {
  async function run(read: () => Promise<Status>) {
    const posted: unknown[] = []
    let execute: ((input: { sessionID: string }) => Promise<void>) | undefined
    await registerStatusCommand(
      {
        command: { transform: async (callback) => (callback({ add: (definition) => void (execute = definition.execute as never) }), { dispose: async () => {} }) },
        session: { synthetic: async (input) => (posted.push(input), {}) as never },
      },
      read,
    )
    await execute!({ sessionID: "ses_1" })
    return posted
  }

  test("posts the status text into the session without starting a turn", async () => {
    const posted = await run(async () => buildStatus(base))
    expect(posted).toEqual([{ sessionID: "ses_1", text: formatStatus(buildStatus(base)), description: "Notion status", resume: false }])
  })

  test("posts a coded error with a next step, cut to one short line without URL queries, when status cannot be read", async () => {
    const posted = (await run(() => Promise.reject(new Error("failed:\n https://x.example/a?token=t")))) as { text: string }[]
    expect(posted[0]!.text).toBe("STATUS_UNAVAILABLE: Could not read Notion's status (failed: https://x.example/a). Next step: Restart OpenCode, then run /notion-status again.")
  })
})

describe("status RPC", () => {
  async function register(read: () => Promise<Status>) {
    const registered: { id: string; methods: string[]; status: () => Promise<unknown> }[] = []
    const error = (type: string, message: string, data: unknown) => ({ type, message, data })
    await registerStatusRpc(
      {
        register: async (definition, handlers) => {
          registered.push({ id: definition.id, methods: Object.keys(definition.methods), status: () => handlers.status({} as never, { error } as never) })
          return { dispose: async () => {}, events: { emit: async () => {} } } as never
        },
      },
      read,
    )
    return registered
  }

  test("serves the same status as /notion-status through one read-only method", async () => {
    const registered = await register(async () => buildStatus(base))
    expect(registered.map(({ id, methods }) => ({ id, methods }))).toEqual([{ id: "notion.workspace", methods: ["status"] }])
    expect(await registered[0]!.status()).toEqual(buildStatus(base))
    expect(StatusRpc.events).toEqual({})
  })

  test("answers a status it cannot read with its declared error, unavailable, and a next step", async () => {
    const registered = await register(() => Promise.reject(new Error("agent list failed")))
    expect(await registered[0]!.status()).toEqual({
      type: "unavailable",
      message: "STATUS_UNAVAILABLE: Could not read Notion's status (agent list failed).",
      data: { nextStep: "Restart OpenCode, then run /notion-status again." },
    })
    expect(Object.keys(StatusRpc.methods.status.errors)).toEqual(["unavailable"])
  })

  test("has the fields every plugin of this family shares, with their names", () => {
    const status = buildStatus(base)
    expect({ version: status.version, host: status.host, state: status.state, unguardedAgents: status.unguardedAgents, nextStep: status.nextStep }).toEqual({
      version: VERSION,
      host: { version: "2.2.3", range: ">=2.2.3 <2.3.0", tested: true },
      state: "connected",
      unguardedAgents: [],
      nextStep: NOTHING_TO_DO,
    })
    expect(StatusRpc.methods.status.output.required).toEqual(expect.arrayContaining(["version", "host", "state", "unguardedAgents", "nextStep"]))
  })

  test("the output schema names every status field and requires the ones always present", () => {
    const { properties, required } = StatusRpc.methods.status.output
    const statuses: Status[] = [
      buildStatus({ ...base, account: { workspace: "Acme Robotics", connection: "person" }, tools: ["shiny-new-tool"], agents: [{ id: "reviewer", permissions: [allow("*")] }], problems: ["p"], skills: { own: [{ id: "notion", path: "/a" }], listed: [{ id: "notion", path: "/b" }] } }),
      buildStatus({ ...base, server: { status: "failed", error: "fetch failed" }, source: { type: "conflict", url: "https://x.example/mcp", expected: URL }, host: checkHost("2.3.0", true) }),
    ]
    for (const status of statuses) {
      expect(Object.keys(status).filter((key) => !(key in properties))).toEqual([])
      expect(required.filter((key) => !(key in status))).toEqual([])
      expect(Object.keys(status.host).filter((key) => !(key in properties.host.properties))).toEqual([])
    }
  })
})
