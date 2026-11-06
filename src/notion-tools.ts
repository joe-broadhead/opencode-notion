// Every fact the plugin keeps about Notion's tools: their names, without the `notion_` server prefix, and what each
// one does. The default rules, the tools RPC's methods, status's unknown and denied tools and the tests all derive
// from these lists; `jelly.tools` in package.json and the skills' call examples are checked against them. Keep this
// file free of runtime imports.
//
// The names and classes come from Notion's own documentation of its MCP tools (developers.notion.com, "MCP supported
// tools" and the per-category references, 2026-11-05). That documentation gives no input schemas and names only three
// annotations, so each tool's class comes from what Notion says it does, and PARAMETERS stays empty until a tool list
// from a signed-in server is recorded (CONTRIBUTING.md, "Updating the tool lists"). A plan or an Enterprise tool list
// can leave out tools this file knows: a known tool missing from a live list is normal and never reported.

/** Known reads: each only reads, by Notion's description, and sends nothing beyond its query. They run without asking. */
export const READ_TOOLS: readonly string[] = [
  "notion-ai-search",
  "notion-calendar-list-calendar-resources",
  "notion-calendar-list-calendars",
  "notion-calendar-list-contacts",
  "notion-calendar-list-coworkers-events",
  "notion-calendar-list-events",
  "notion-connector-search",
  "notion-download-attachment",
  "notion-download-skill",
  "notion-fetch",
  "notion-get-async-task",
  "notion-get-comments",
  "notion-get-enabled-skills",
  "notion-get-file-download-urls",
  "notion-get-groups",
  "notion-get-self",
  "notion-get-session-status",
  "notion-get-suggested-edit",
  "notion-get-teams",
  "notion-get-tool-access",
  "notion-get-users",
  "notion-get-version-changes",
  "notion-list-favorite-pages",
  "notion-list-page-backlinks",
  "notion-list-private-pages",
  "notion-list-recent-pages",
  "notion-list-session-events",
  "notion-list-shared-pages",
  "notion-memory-search",
  "notion-query-data-sources",
  "notion-query-meeting-notes",
  "notion-query-multiple-data-sources",
  "notion-query-sessions",
  "notion-read-session-event",
  "notion-search",
  "notion-search-agents",
  "notion-search-sessions",
  "notion-view-version",
  "notion-wait-session",
]

/**
 * Known writes: they ask before they run. Each changes what someone else can see, or notifies someone: page content and
 * properties, comments and suggested edits, database properties and views, files, calendar events, or the Skills a
 * connection offers.
 *
 * `notion-resolve-suggested-edit` carries `destructiveHint: true` in Notion's documentation and stays here rather than
 * off: it accepts or discards one person's proposal on one page, which a permission prompt can describe, unlike a
 * whole-page write. Its skill line says to name the author and which of the two the user wants.
 */
export const WRITE_TOOLS: readonly string[] = [
  "notion-calendar-create-events",
  "notion-calendar-update-events",
  "notion-convert-page-to-skill",
  "notion-create-attachment",
  "notion-create-comment",
  "notion-create-database",
  "notion-create-file-upload",
  "notion-create-folder",
  "notion-create-pages",
  "notion-create-suggested-edit",
  "notion-create-view",
  "notion-duplicate-page",
  "notion-move-pages",
  "notion-resolve-suggested-edit",
  "notion-restore-pages",
  "notion-set-comment-reaction",
  "notion-set-discussion-resolved",
  "notion-update-comment",
  "notion-update-data-source",
  "notion-update-enabled-skills",
  "notion-update-folder",
  "notion-update-page",
  "notion-update-view",
]

/**
 * Off by default; a deny also hides them. A user or organisation turns one back on with a later `ask` rule for it.
 * - Three delete pages, databases or a comment, and a delete takes them away from everyone who could see them.
 * - `notion-restore-version` replaces a whole page with a past version, losing every later edit, including other
 *   people's, and the comments added since.
 * - `notion-upload-skill` replaces a Skill page's title, Description, body and Files.
 * - Three drive a Notion Custom Agent that acts in the workspace with the user's permissions, with effects this plugin
 *   cannot describe and AI credits it cannot count.
 * - `notion-calendar-cancel-events` removes an event from other people's calendars and may notify them.
 */
export const DENY_TOOLS: readonly string[] = [
  "notion-calendar-cancel-events",
  "notion-delete-comment",
  "notion-delete-databases",
  "notion-delete-pages",
  "notion-restore-version",
  "notion-send-message-to-session",
  "notion-spawn-session",
  "notion-stop-session",
  "notion-upload-skill",
]

/**
 * Each known tool's input parameters, as `name:type`, with `*` after a required name, in the input schema's order. Empty
 * until a tool list from a signed-in server is recorded: Notion's documentation gives no schemas. The skills test lets a
 * skill write a literal call only with parameters recorded here, so until then the skills name tools without their
 * inputs, and each call's signature gives the model the parameter names.
 */
export const PARAMETERS: Readonly<Record<string, readonly string[]>> = {}

type ToolClass = "read" | "write" | "denied" | "unknown"

export function classify(name: string): ToolClass {
  if (READ_TOOLS.includes(name)) return "read"
  if (WRITE_TOOLS.includes(name)) return "write"
  if (DENY_TOOLS.includes(name)) return "denied"
  return "unknown"
}
