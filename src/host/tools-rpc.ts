/**
 * Notion's part of the tools RPC (`notion.workspace.tools`): the plugin value and the method table that the source
 * contract's `tools-rpc` module takes. The module (`@we-the-rebel-alliance/source-contract/tools-rpc`, bundled into
 * `dist/index.js`) is the transport the plugin family shares:
 *
 *   POST /api/rpc/notion.workspace.tools/<method>
 *   { "input": { "sessionID": "<session>", "input": <the tool's input> } }
 *
 * A script runs as a session and the agent it names; the rule for the method's permission action is resolved before
 * dispatch, and only `allow` runs. An MCP method then runs through OpenCode's own executor, which checks
 * `notion_<tool>` against the same rules and sends OpenCode's own credential; the plugin's own methods, `events_list`
 * and `probe` (`src/source.ts`), run their own specs. `docs/scripting.md` describes the calls.
 */
import { SourceError } from "@we-the-rebel-alliance/source-contract/events"
import { toolsRpcId, type Failure, type McpResult, type MethodSpec, type NextSteps, type ShapeCall, type ToolsRpcPlugin } from "@we-the-rebel-alliance/source-contract/tools-rpc"
import { ACCOUNT_TOOL, captureAccount } from "../account.js"
import { DESTRUCTIVE_TOOLS, READ_TOOLS, WRITE_TOOLS } from "../notion-tools.js"
import { PLUGIN_ID as NOTION_PLUGIN_ID, SERVER_NAME } from "../constants.js"

/** The plugin's id. The RPC id is `<PLUGIN_ID>.tools`. */
export const PLUGIN_ID = NOTION_PLUGIN_ID

/** The RPC's id, `notion.workspace.tools`. Scripts call it by name, so it never changes. */
export const TOOLS_RPC_ID = toolsRpcId(PLUGIN_ID)

/**
 * Every known Notion tool, by exact name, from the plugin's one table: the reads, the writes, and the nine of the
 * destructive class. A tool Notion adds later is never a method until it is classified in `src/notion-tools.ts`;
 * `describe` lists it as unclassified. The names keep Notion's hyphens: the host registers them under exactly these
 * names. The class never decides whether a call runs: the rules do. The plugin's own two reads, `events_list` and
 * `probe`, are added in setup, where they have the plugin's context.
 */
export const METHODS: readonly MethodSpec[] = [
  ...READ_TOOLS.map((name): MethodSpec => ({ kind: "mcp", name, class: "read" })),
  ...WRITE_TOOLS.map((name): MethodSpec => ({ kind: "mcp", name, class: "write" })),
  ...DESTRUCTIVE_TOOLS.map((name): MethodSpec => ({ kind: "mcp", name, class: "destructive" })),
]

/** The tools RPC's argument shaping. Notion changes no argument. */
export function shapeInput(_method: string, input: unknown, _call: ShapeCall): unknown {
  return input
}

/**
 * The tools RPC's result shaping: a script's `notion-get-self` call records the workspace's name and connection type
 * that status shows. The result itself is unchanged. No `execute.after` hook is registered for the model path.
 */
export function shapeResult(method: string, result: McpResult, _call: ShapeCall): McpResult {
  if (method === ACCOUNT_TOOL) captureAccount({ output: result.output, content: result.text })
  return result
}

/** The next step for each code. Each is one sentence that ends with a full stop. */
export const NEXT_STEPS: NextSteps = {
  SESSION_UNKNOWN: `Create a session in the location you mean, such as POST /api/session with {"agent":"build"} sent with the header "x-opencode-directory: <dir>" or the location[directory] query, and pass its id.`,
  SESSION_AGENT_REQUIRED: `Create a session that names an agent this project has, with its project as the location, such as POST /api/session with {"agent":"build","location":{"directory":"/path/to/project"}}, and pass its id.`,
  PERMISSION_DENIED: "Add an allow rule for the tool to the session's agent or to the session, or use a session whose agent allows it.",
  SERVER_CONFLICT: `Run /notion-status, then point your own mcp.servers.${SERVER_NAME} in opencode.json at the URL it names or remove it, and restart OpenCode.`,
  AUTH_REQUIRED: `Run /connect and choose Notion, then press o or Enter to open the link (in a terminal, opencode mcp auth ${SERVER_NAME} opens it automatically; run it from the project folder where the plugin is installed, and if it answers MCP server not found: ${SERVER_NAME}, wait a few seconds and run it again).`,
  CONNECTING: "Wait a few seconds, then call the method again.",
  CONNECTION_FAILED: "Check your network, then run /notion-status and follow its next step.",
  DISABLED: `Enable the ${SERVER_NAME} server in /mcps, or remove "disabled": true from mcp.servers.${SERVER_NAME} in opencode.json.`,
  NOT_REGISTERED: "Run /notion-status and follow its next step.",
  TOOL_UNAVAILABLE: "Call describe to see which methods OpenCode lists now, and run /notion-status.",
  UPSTREAM_ERROR: "Check the input against the method's schema from describe; if Notion reports rate_limited, wait retry_after_seconds and make fewer calls at once.",
  CANCELLED: "Call the method again if you still need the result.",
}

/** The plugin's own errors: events_list's and probe's, in the source contract's codes, as a code, what happened and the next step. */
export function pluginError(error: unknown): Failure | undefined {
  if (!(error instanceof SourceError)) return undefined
  return { code: error.code, what: error.what.replace(/[.\s]+$/, ""), next: error.next }
}

/** Notion's plugin value for the tools RPC. */
export const PLUGIN: ToolsRpcPlugin = { id: PLUGIN_ID, nextSteps: NEXT_STEPS, shapeInput, shapeResult, pluginError }
