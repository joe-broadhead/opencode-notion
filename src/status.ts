import type { Plugin, Rpc } from "@opencode/plugin"
import type { Account } from "./account.js"
import { PLUGIN_ID, SERVER_NAME, TESTED_HOSTS } from "./constants.js"
import { isSupportedHost, type HostCheck } from "./host-version.js"
import { classify, DENY_TOOLS, WRITE_TOOLS } from "./notion-tools.js"
import { defaultRules, unguardedAgents, type Rule } from "./permissions.js"
import { cut, oneLine, shortReason } from "./redact.js"
import { VERSION } from "./version.js"

export { shortReason }

/** The shared status labels in machine form; `/notion-status` shows them as `sign-in required` and so on. */
type State = "connected" | "sign_in_required" | "connecting" | "disabled" | "failed" | "not_configured" | "conflict"
/**
 * Who owns the `notion` server: this plugin, the user's own config (adopted unchanged), or a server at another URL
 * (`expected` is Notion's). URLs are shown as origin and path only. `signIn` is `own` for an adopted entry with
 * `oauth: false`, which signs in with an MCP token the entry's headers carry.
 */
export type ServerSource =
  | { readonly type: "plugin"; readonly url: string; readonly signIn: "oauth" }
  | { readonly type: "adopted"; readonly url: string; readonly signIn: "oauth" | "own" }
  | { readonly type: "conflict"; readonly url: string; readonly expected: string }

interface SkillPath {
  readonly id: string
  readonly path: string
}

/** What status is built from. The terminal UI fills what it can see; fields it cannot see stay undefined. */
export interface StatusFacts {
  readonly server?: { readonly status: "connected" | "pending" | "disabled" | "failed" | "needs_auth"; readonly error?: string }
  readonly source?: ServerSource
  /** The workspace and connection type from the last `notion-get-self` result since OpenCode started. */
  readonly account?: Account
  /**
   * True when this status read found the server needing a new sign-in while a workspace from an earlier call was still
   * known: the sign-in worked before, so a revoked grant is the likely cause.
   */
  readonly wasSignedIn?: boolean
  readonly host: HostCheck
  /** The names of the tools the `notion` server serves, without the `notion_` prefix. */
  readonly tools?: readonly string[]
  /**
   * The server's status changed moments ago: a server that just connected lists its tools shortly after, so no tools
   * yet means "still listing", not "none for this connection".
   */
  readonly settling?: boolean
  readonly agents?: readonly { readonly id: string; readonly permissions: readonly Rule[] }[]
  readonly problems?: readonly string[]
  /** The plugin's own skills, and the skills OpenCode lists; the listed one wins when both have an id. */
  readonly skills?: { readonly own: readonly SkillPath[]; readonly listed: readonly SkillPath[] }
}

/**
 * One status model for `/notion-status`, the `/notion` dialog and the status RPC. `version`, `host`, `state`,
 * `unguardedAgents` and `nextStep` are the fields every plugin of this family shares; the rest are Notion's own.
 */
export interface Status {
  /** The plugin's version. */
  readonly version: string
  readonly state: State
  /** For a failed connection only: OpenCode's reason, on one line of at most 160 characters, URLs without their query. */
  readonly error?: string
  readonly source?: ServerSource
  /** The workspace's name from the last account read since OpenCode started, or null before one. */
  readonly workspace: string | null
  /** Whether that connection acts as a person or as a workspace connection, or null before an account read. */
  readonly connection: "person" | "bot" | null
  /** How many Notion tools OpenCode lists and the default rules let run or ask: the listed ones that are not denied. */
  readonly tools: number
  /** The listed tools that the default rules deny, such as notion-delete-pages; a later rule of the user's can turn one on. */
  readonly deniedTools: readonly string[]
  /** True while a server that just connected may still be listing its tools. */
  readonly listing: boolean
  /** How many of them the plugin does not know. */
  readonly unknownCount: number
  /** Up to 20 of the unknown tools' names, only those made of lowercase letters, digits, `_` and `-`. */
  readonly unknownTools: readonly string[]
  /** Agents where a new Notion tool would run without asking; empty when there are none. */
  readonly unguardedAgents: readonly string[]
  /** The plugin's skills that OpenCode loads from another file of the same id instead. */
  readonly shadowedSkills?: readonly SkillPath[]
  readonly host: HostCheck
  readonly problems: readonly string[]
  /** The one next step: the `Next step` row, "Nothing to do." when nothing is needed. */
  readonly nextStep: string
}

const SIGN_IN = `Run /connect and choose Notion, then press o or Enter to open the link (in a terminal, opencode mcp auth ${SERVER_NAME} opens it automatically).`
/**
 * Notion rotates a refresh token on every use, and reusing one that has been rotated away revokes the whole grant. So a
 * sign-in that worked and then needed a new one may have been revoked by a second OpenCode process sharing it.
 */
const REVOKED =
  "If this sign-in worked earlier, its grant may have been revoked: Notion revokes the whole grant when a refresh token is reused, which two OpenCode processes sharing one sign-in do. Run opencode mcp logout notion, then sign in once."

/** The default rules to paste into an agent's own permissions, one rule a line, as a JSON array body. */
const AGENT_RULES = defaultRules()
  .map((rule, index, rules) => `  ${JSON.stringify(rule)}${index < rules.length - 1 ? "," : ""}`)
  .join("\n")

/** The next step while agents lack the rules: the family's one fixed sentence. */
const AGENTS_NEXT_STEP =
  "Put the default rules shown by /notion-status first in each listed agent's own permissions, in opencode.json or the agent's Markdown file, followed by your top-level rules for Notion tools."

const NOTHING_TO_DO = "Nothing to do."
const ACCOUNT_LIMIT = 80

const TESTED_TEXT = `${TESTED_HOSTS.slice(0, -1).join(", ")} or ${TESTED_HOSTS.at(-1)}`
const LISTED_UNKNOWN = 20
// A tool name comes from the server; list only plain names. Notion's own names carry hyphens.
const SAFE_NAME = /^[a-z][a-z0-9_-]{0,63}$/

/** The plugin's skills that OpenCode lists from another file: a skill with the same id, such as a user's, replaced it. */
function shadowedOf(facts: StatusFacts): SkillPath[] {
  return (facts.skills?.own ?? []).flatMap((own) => {
    const listed = facts.skills?.listed.find((skill) => skill.id === own.id)
    return listed && listed.path !== own.path ? [{ id: own.id, path: listed.path }] : []
  })
}

const STATE_OF = { connected: "connected", pending: "connecting", needs_auth: "sign_in_required", failed: "failed", disabled: "disabled" } as const

export function buildStatus(facts: StatusFacts): Status {
  const state: State = facts.source?.type === "conflict" ? "conflict" : facts.server ? STATE_OF[facts.server.status] : "not_configured"
  const listed = facts.tools ?? []
  const unknown = listed.filter((tool) => classify(tool) === "unknown")
  const denied = listed.filter((tool) => classify(tool) === "denied")
  // OpenCode's text for a needed sign-in can hold an authorization URL, so only a failure's reason is kept.
  const error = facts.server?.status === "failed" && facts.server.error ? shortReason(facts.server.error) : undefined
  const shadowed = shadowedOf(facts)
  const status = {
    version: VERSION,
    state,
    ...(error ? { error } : {}),
    ...(facts.source ? { source: facts.source } : {}),
    workspace: facts.account?.workspace ? cut(oneLine(facts.account.workspace), ACCOUNT_LIMIT) : null,
    connection: facts.account?.connection ?? null,
    tools: listed.length - denied.length,
    deniedTools: denied,
    listing: state === "connected" && listed.length === 0 && facts.settling === true,
    unknownCount: unknown.length,
    unknownTools: unknown.filter((name) => SAFE_NAME.test(name)).slice(0, LISTED_UNKNOWN),
    unguardedAgents: unguardedAgents(facts.agents ?? []),
    ...(shadowed.length ? { shadowedSkills: shadowed } : {}),
    host: facts.host,
    problems: facts.problems ?? [],
  }
  return { ...status, nextStep: nextStepOf(status, facts.wasSignedIn === true) }
}

function nextStepOf(status: Omit<Status, "nextStep">, wasSignedIn: boolean): string {
  const { source } = status
  switch (status.state) {
    case "conflict": {
      const { url, expected } = source as Extract<ServerSource, { type: "conflict" }>
      return `Your OpenCode config defines mcp.servers.${SERVER_NAME} with ${url}, but the plugin uses ${expected}. Point it at ${expected} or remove it, then restart OpenCode.`
    }
    case "not_configured":
      return `OpenCode has no ${SERVER_NAME} MCP server. Check that no organisation policy (mcp.use) or other plugin removes it, then restart OpenCode.`
    case "disabled":
      return `The ${SERVER_NAME} MCP server is disabled. Enable it in /mcps, or remove "disabled": true from mcp.servers.${SERVER_NAME} in opencode.json.`
    case "connecting":
      return "Notion is still connecting. Run /notion-status again in a few seconds."
    case "sign_in_required":
      // A workspace was read in this run before the server asked for a new sign-in, so it worked: a revoked grant is
      // the likely cause.
      return wasSignedIn ? `${SIGN_IN} ${REVOKED}` : SIGN_IN
    case "failed":
      // A user's own entry with `oauth: false` signs in with an MCP token, which only a workspace owner can create.
      if (source?.type === "adopted" && source.signIn === "own") {
        return `Check the MCP token in the headers of your own mcp.servers.${SERVER_NAME} (a workspace owner creates it in Notion's developer portal), then restart OpenCode.`
      }
      return "Check your network, then run /notion-status again."
  }
  if (status.listing) return "Notion is still listing its tools. Run /notion-status again in a few seconds."
  if (status.tools === 0 && status.deniedTools.length === 0) {
    return "Notion lists no tools for this connection. Ask an admin whether AI apps are restricted to an approved list (Settings, Connections, Permissions, AI apps), then sign in again."
  }
  if (status.unguardedAgents.length) return AGENTS_NEXT_STEP
  // A problem reads `CODE: What happened. Next step: What to do.`; its own next step becomes the status's.
  const problem = status.problems[0]?.split(" Next step: ")[1]
  if (problem) return problem
  if (status.shadowedSkills?.length) {
    return `Rename or move ${status.shadowedSkills.map((skill) => `the "${skill.id}" skill at ${skill.path}`).join(" and ")}, which OpenCode loads instead of the plugin's skill of the same name.`
  }
  // An untested host changes no next step: the OpenCode row says it is untested.
  return NOTHING_TO_DO
}

const STATE_TEXT: Record<State, string> = {
  connected: "connected",
  connecting: "connecting",
  sign_in_required: "sign-in required",
  failed: "failed",
  disabled: "disabled",
  not_configured: "not configured",
  conflict: "conflict",
}

/** The permission posture, which the default rules fix. */
const RULES_NOT_ADDED = "RULES_NOT_ADDED:"

/** The server's address and owner, after the state label. */
function serverText(source: ServerSource) {
  if (source.type === "plugin") return `${source.url}, registered by this plugin`
  if (source.type === "adopted") return `${source.url}, your own mcp.servers.${SERVER_NAME}${source.signIn === "own" ? " without OAuth" : ""}, used unchanged`
  return `your mcp.servers.${SERVER_NAME} points at ${source.url}`
}

function toolsText({ tools, unknownCount, unknownTools, deniedTools, listing }: Status) {
  if (listing) return "none listed yet (Notion is still listing them)"
  const off = deniedTools.length ? `; off by default: ${list(deniedTools)}` : ""
  if (unknownCount === 0) return `${tools} available, 0 unknown${off}`
  const more = unknownCount - unknownTools.length
  const names = unknownTools.length ? `: ${unknownTools.join(", ")}${more > 0 ? ` and ${more} more` : ""}` : ""
  return `${tools} available, ${unknownCount} unknown${names} (unknown tools ask before running)${off}`
}

const list = (names: readonly string[]) => (names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`)

/**
 * The permission posture the default rules fix, derived from the tool lists so it cannot go stale, the person or
 * workspace connection that holds it, and whether those rules are in place: facts status can check, not a claim.
 */
const POSTURE = `reads run without asking; the ${WRITE_TOOLS.length} changes and any new tool ask first; the ${DENY_TOOLS.length} that delete, replace a whole page, upload a Skill, drive a Notion agent or cancel an event are off`

function accessText({ problems, unguardedAgents, connection }: Status) {
  const who = connection === "person" ? "your Notion account" : connection === "bot" ? "a workspace connection with an admin-chosen tool list" : ""
  const rules = problems.some((problem) => problem.startsWith(RULES_NOT_ADDED))
    ? "default rules not added (see the OpenCode row)"
    : unguardedAgents.length
      ? "default rules missing in the agents listed below"
      : "no agent runs new Notion tools unasked"
  return [POSTURE, who, rules].filter(Boolean).join("; ")
}

/** The OpenCode row: the version, whether it is tested, the supported range, then any setup problems. */
function hostText({ host, problems }: Status) {
  const { version, range, tested } = host
  const outside = version === null || !isSupportedHost(version)
  const notes = [
    ...(outside ? [`It is outside the supported range; the plugin runs because allowUntestedHost is true. If Notion misbehaves, use OpenCode ${TESTED_TEXT}.`] : []),
    ...problems,
  ]
  return `${version ?? "unknown version"} (${tested ? "tested" : "untested"}; supported range ${range})${notes.length ? `. ${notes.join(" ")}` : ""}`
}

export function formatStatus(status: Status) {
  const { source, unguardedAgents: agents } = status
  const details = [status.error, source && serverText(source), status.listing && "still listing its tools"].filter(Boolean).join("; ")
  return [
    "Notion status",
    `- Connection: ${STATE_TEXT[status.state]}${details ? ` (${details})` : ""}`,
    `- Account: ${status.workspace ?? "not read yet: it appears after the first Notion call since OpenCode started"}`,
    `- Access: ${accessText(status)}`,
    `- Tools: ${toolsText(status)}`,
    `- Agents without default rules: ${agents.length ? `${agents.join(", ")}\n${AGENT_RULES}` : "none"}`,
    `- OpenCode: ${hostText(status)}`,
    `- Next step: ${status.nextStep}`,
  ].join("\n")
}

export interface StatusContext {
  readonly mcp: Pick<Plugin.Context["mcp"], "list">
  readonly agent: Pick<Plugin.Context["agent"], "list">
  readonly tool: Pick<Plugin.Context["tool"], "list">
  readonly skill: Pick<Plugin.Context["skill"], "list">
}

/** When the server's status last changed, or the watcher started, in milliseconds since the epoch. */
interface ListingState {
  readonly changedAt: () => number
}

/** The captured account: what the last account read said, and a way to forget it once the user is signed out. */
export interface AccountState {
  readonly current: () => Account | undefined
  readonly forget: () => void
}

/** How long after a status change no tools still means "listing". */
const LISTING_MS = 15_000

/** Reads the live facts through public host APIs; never calls Notion. Optional lookups that fail leave their field empty. */
export async function readStatus(
  ctx: StatusContext,
  facts: Pick<StatusFacts, "source" | "host" | "problems"> & { readonly skills?: readonly SkillPath[]; readonly listing?: ListingState; readonly account?: AccountState },
) {
  const [servers, agents, tools, listed] = await Promise.all([
    ctx.mcp.list(),
    ctx.agent.list(),
    ctx.tool.list(),
    // The skill check is advice; a failed list must not hide the rest of the status.
    ctx.skill.list().then(
      (result) => result.data,
      () => undefined,
    ),
  ])
  const server = servers.data.find((entry) => entry.name === SERVER_NAME)
  // A server that needs a new sign-in may come back as another workspace. Note whether one was known first, so status
  // can tell a first sign-in from one that worked and was revoked.
  const wasSignedIn = server?.status.status === "needs_auth" && facts.account?.current() !== undefined
  if (server?.status.status === "needs_auth") facts.account?.forget()
  const account = facts.account?.current()
  const { skills: own, listing, account: watched, ...rest } = facts
  const settling = listing !== undefined && Date.now() - listing.changedAt() < LISTING_MS
  return buildStatus({
    ...rest,
    wasSignedIn,
    ...(server ? { server: server.status } : {}),
    ...(account ? { account } : {}),
    tools: tools.filter((tool) => tool.options?.namespace === SERVER_NAME).map((tool) => tool.name),
    settling,
    agents: agents.data,
    ...(own && listed ? { skills: { own, listed } } : {}),
  })
}

/** Why status could not be read: a coded message and its next step. The reason is cut like a failure's. */
function unavailable(error: unknown) {
  const reason = shortReason(error instanceof Error ? error.message : String(error))
  return {
    message: `STATUS_UNAVAILABLE: Could not read Notion's status${reason ? ` (${reason})` : ""}.`,
    nextStep: "Restart OpenCode, then run /notion-status again.",
  }
}

const strings = { type: "array", items: { type: "string" } }
const count = { type: "integer", minimum: 0 }
const nullableString = { type: ["string", "null"] }

/**
 * One read-only method for the terminal UI view and scripts. The UI part does not receive the plugin options on 2.2.x,
 * and cannot see the server's own findings, so it asks the server for the same status /notion-status reports.
 */
export const StatusRpc = {
  id: PLUGIN_ID,
  methods: {
    status: {
      input: { type: "object" },
      output: {
        type: "object",
        required: ["version", "state", "workspace", "connection", "tools", "deniedTools", "listing", "unknownCount", "unknownTools", "unguardedAgents", "host", "problems", "nextStep"],
        properties: {
          version: { type: "string" },
          state: { enum: ["connected", "sign_in_required", "connecting", "disabled", "failed", "not_configured", "conflict"] },
          error: { type: "string" },
          source: {
            type: "object",
            required: ["type", "url"],
            properties: { type: { enum: ["plugin", "adopted", "conflict"] }, url: { type: "string" }, expected: { type: "string" }, signIn: { enum: ["oauth", "own"] } },
          },
          workspace: nullableString,
          connection: { enum: ["person", "bot", null] },
          tools: count,
          deniedTools: strings,
          listing: { type: "boolean" },
          unknownCount: count,
          unknownTools: strings,
          unguardedAgents: strings,
          shadowedSkills: {
            type: "array",
            items: { type: "object", required: ["id", "path"], properties: { id: { type: "string" }, path: { type: "string" } } },
          },
          host: {
            type: "object",
            required: ["version", "range", "tested"],
            properties: { version: nullableString, range: { type: "string" }, tested: { type: "boolean" } },
          },
          problems: strings,
          nextStep: { type: "string" },
        },
      },
      errors: { unavailable: { type: "object", required: ["nextStep"], properties: { nextStep: { type: "string" } } } },
    },
  },
  events: {},
} satisfies Rpc.PortableDefinition

export function registerStatusRpc(rpc: Pick<Plugin.Context["rpc"], "register">, read: () => Promise<Status>) {
  return rpc.register(StatusRpc, {
    status: (_input, { error }) =>
      read().catch((cause: unknown) => {
        const { message, nextStep } = unavailable(cause)
        return error("unavailable", message, { nextStep })
      }),
  })
}

export function registerStatusCommand(
  ctx: { readonly command: Pick<Plugin.Context["command"], "transform">; readonly session: Pick<Plugin.Context["session"], "synthetic"> },
  read: () => Promise<Status>,
) {
  return ctx.command.transform((editor) =>
    editor.add({
      name: "notion-status",
      description: "Show Notion's connection, sign-in, workspace, tools and the next step",
      execute: async ({ sessionID }) => {
        const text = await read().then(formatStatus, (cause: unknown) => {
          const { message, nextStep } = unavailable(cause)
          return `${message} Next step: ${nextStep}`
        })
        await ctx.session.synthetic({ sessionID, text, description: "Notion status", resume: false })
      },
    }),
  )
}
