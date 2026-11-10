// The tool lists in src/notion-tools.ts are the one record of Notion's tools; everything else derives from them.
import { describe, expect, test } from "bun:test"
import { classify, DESTRUCTIVE_TOOLS, READ_TOOLS, WRITE_TOOLS } from "../../src/notion-tools.js"

const ALL = [...READ_TOOLS, ...WRITE_TOOLS, ...DESTRUCTIVE_TOOLS]

describe("Notion's tool lists", () => {
  test("name each tool once, in one list only, with Notion's own notion- prefix and lower case", () => {
    expect(new Set(ALL).size).toBe(ALL.length)
    for (const name of ALL) expect(name).toMatch(/^notion-[a-z0-9-]{1,80}$/)
    for (const list of [READ_TOOLS, WRITE_TOOLS, DESTRUCTIVE_TOOLS]) expect([...list]).toEqual([...list].sort())
  })

  test("hold the 41 reads, 29 writes and 9 destructive tools", () => {
    expect([READ_TOOLS.length, WRITE_TOOLS.length, DESTRUCTIVE_TOOLS.length]).toEqual([41, 29, 9])
  })

  test("class the tools the live list added as their descriptions say, and keep the two plan-gated searches as reads", () => {
    for (const tool of ["notion-get-setup-guide", "notion-get-sidebar-tabs"]) expect(classify(tool)).toBe("read")
    for (const tool of [
      "notion-complete-mcp-setup",
      "notion-convert-to-meetings-database",
      "notion-create-meeting-note",
      "notion-link-meeting-note-to-calendar-event",
      "notion-update-page-favorites",
      "notion-update-sidebar-tabs",
      "notion-update-skill-settings",
    ]) expect(classify(tool)).toBe("write")
    expect(classify("notion-ai-search")).toBe("read")
    expect(classify("notion-connector-search")).toBe("read")
    expect(classify("notion-update-enabled-skills")).toBe("unknown")
  })

  test("classify each tool by its list, and everything else as unknown", () => {
    for (const tool of READ_TOOLS) expect(classify(tool)).toBe("read")
    for (const tool of WRITE_TOOLS) expect(classify(tool)).toBe("write")
    for (const tool of DESTRUCTIVE_TOOLS) expect(classify(tool)).toBe("destructive")
    for (const tool of ["shiny_new_tool", "", "notion_search", "NOTION-SEARCH", "describe"]) expect(classify(tool)).toBe("unknown")
  })

  test("class every delete, whole-page and agent tool destructive, and every other change a write", () => {
    expect([...DESTRUCTIVE_TOOLS].sort()).toEqual([
      "notion-calendar-cancel-events",
      "notion-delete-comment",
      "notion-delete-databases",
      "notion-delete-pages",
      "notion-restore-version",
      "notion-send-message-to-session",
      "notion-spawn-session",
      "notion-stop-session",
      "notion-upload-skill",
    ])
    // The routine changes are writes, including the page update that also carries the whole-page replacement.
    for (const tool of ["notion-update-page", "notion-create-pages", "notion-create-comment", "notion-move-pages"]) expect(WRITE_TOOLS).toContain(tool)
    // The session reads stay reads; only starting, driving or stopping an agent is destructive.
    for (const tool of ["notion-query-sessions", "notion-search-sessions", "notion-get-session-status"]) expect(READ_TOOLS).toContain(tool)
  })
})
