// Notion's part of the tools RPC: the plugin-specific block of src/host/tools-rpc.ts. The shared part is tested in
// tools-rpc.test.ts.
import { describe, expect, test } from "bun:test"
import { DENY_TOOLS, READ_TOOLS, WRITE_TOOLS } from "../../src/notion-tools.js"
import { PLUGIN_ID as NOTION_PLUGIN_ID, SERVER_NAME } from "../../src/constants.js"
import { KNOWN_READS, NEXT_STEPS, PLUGIN_ID, pluginError, shapeResult, TOOLS_RPC_ID } from "../../src/host/tools-rpc.js"
import { defaultRules } from "../../src/permissions.js"

describe("Notion's tools RPC", () => {
  test("is notion.workspace.tools, under the plugin's own id", () => {
    expect(PLUGIN_ID).toBe(NOTION_PLUGIN_ID)
    expect(TOOLS_RPC_ID).toBe("notion.workspace.tools")
  })

  test("its methods are exactly the known reads, the server tools the default rules allow", () => {
    expect([...KNOWN_READS]).toEqual([...READ_TOOLS])
    const allowed = defaultRules().filter((rule) => rule.effect === "allow").map((rule) => rule.action)
    expect(KNOWN_READS.map((name) => `${SERVER_NAME}_${name}`)).toEqual(allowed)
  })

  test("keeps Notion's hyphens, with the double prefix the host builds", () => {
    expect(KNOWN_READS).toContain("notion-search")
    expect(KNOWN_READS.map((name) => `${SERVER_NAME}_${name}`)).toContain("notion_notion-search")
  })

  test("no write, no denied tool and no unknown tool is a method", () => {
    expect(KNOWN_READS.filter((name) => WRITE_TOOLS.includes(name) || DENY_TOOLS.includes(name))).toEqual([])
    for (const name of ["notion-update-page", "notion-delete-pages", "notion-spawn-session", "shiny_new_tool", "describe", "*"]) expect(KNOWN_READS).not.toContain(name)
    for (const name of DENY_TOOLS) expect(defaultRules()).toContainEqual({ action: `notion_${name}`, resource: "*", effect: "deny" })
  })

  test("names Notion's own commands in its next steps, the rate limit, and no per-account servers", () => {
    expect(NEXT_STEPS.AUTH_REQUIRED).toContain("/connect and choose Notion")
    expect(NEXT_STEPS.AUTH_REQUIRED).toContain("run it from the project folder where the plugin is installed")
    expect(NEXT_STEPS.AUTH_REQUIRED).toContain("MCP server not found: notion")
    expect(NEXT_STEPS.SERVER_CONFLICT).toContain("mcp.servers.notion")
    expect(NEXT_STEPS.TOOL_UNAVAILABLE).toBe("Call describe to see which methods OpenCode lists now, and run /notion-status.")
    expect(NEXT_STEPS.UPSTREAM_ERROR).toContain("if Notion reports rate_limited, wait retry_after_seconds and make fewer calls at once")
    for (const step of Object.values(NEXT_STEPS)) expect(step).toMatch(/[^.]\.$/)
    expect(NEXT_STEPS.ACCOUNT_UNKNOWN).toBeUndefined()
  })

  test("passes every result through unchanged, and has no errors of its own", () => {
    const result = { output: { name: "Acme Robotics" }, text: "{}" }
    for (const method of READ_TOOLS) expect(shapeResult(method, result)).toBe(result)
    expect(pluginError(new Error("boom"))).toBeUndefined()
  })
})
