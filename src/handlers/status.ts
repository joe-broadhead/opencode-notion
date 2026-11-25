import type { Plugin } from "@opencode/plugin"
import {
  STATUS_SCHEMA,
  accountStatuses,
  redactReason,
  statusAnswer,
  type AccountProfile,
  type AccountSignal,
  type AccountStatus,
  type StatusAnswer,
} from "@we-the-rebel-alliance/plugin-contract/accounts"
import type { JsonSchema, Manifest, Owner } from "@we-the-rebel-alliance/plugin-contract/manifest"
import type { MethodHandler } from "@we-the-rebel-alliance/plugin-contract/register"
import type { UnguardedAgentsResult } from "@we-the-rebel-alliance/plugin-contract/access"
import { accountName } from "@we-the-rebel-alliance/plugin-contract/accounts"
import type { Identities } from "../provider/identity.ts"
import type { Identity } from "../provider/notion.ts"

const STATUS_DESCRIPTION = "Read the plugin's state, its OpenCode host range and every account alias, with one next step."
const EMPTY = { type: "object", properties: {}, additionalProperties: false } as const satisfies JsonSchema
const MAX_PROBLEM = 200

/** One alias's owner as status shows it: the user and the workspace as an organization, once a probe answered. */
function ownerOf(identity: Identity): Owner {
  const orgs = identity.workspace === undefined ? undefined : [{ id: `notion-workspace:${identity.workspace.id}`, label: identity.workspace.label }]
  return { ...identity.owner, ...(orgs === undefined ? {} : { orgs }) }
}

/** One line, redacted and cut, so a problem can be status's next step. */
const problemLine = (value: string): string => {
  const text = redactReason(value)
  return text.length <= MAX_PROBLEM ? text : `${text.slice(0, MAX_PROBLEM - 1)}…`
}

/** What status is built from: values setup already has, plus the host's current MCP server states. */
export interface StatusDeps {
  readonly manifest: Manifest
  readonly version: string
  readonly hostVersion: string
  readonly aliases: readonly string[]
  readonly problems: readonly string[]
  readonly mcp: Pick<Plugin.Context["mcp"], "list">
  readonly identities: Identities
}

/** One alias's signal from its MCP server's state, with the owner from the identity cache when a probe answered. */
async function signalsOf(deps: StatusDeps): Promise<Readonly<Record<string, AccountSignal | undefined>>> {
  const servers = (await deps.mcp.list()).data
  const signals: Record<string, AccountSignal | undefined> = {}
  for (const alias of deps.aliases) {
    const name = accountName("notion", alias)
    const server = servers.find((candidate) => candidate.name === name)
    const identity = deps.identities.get(alias)
    const owner = identity === undefined ? undefined : ownerOf(identity)
    if (server === undefined) {
      signals[alias] = { state: "needs_sign_in", ...(owner === undefined ? {} : { owner }) }
      continue
    }
    const status = server.status.status
    if (status === "connected") {
      signals[alias] = { state: "ready", ...(owner === undefined ? {} : { owner }) }
    } else if (status === "needs_auth") {
      signals[alias] = { state: "needs_sign_in", ...(owner === undefined ? {} : { owner }) }
    } else {
      const detail = "error" in server.status && typeof server.status.error === "string" ? server.status.error : undefined
      const reason = detail === undefined ? `${name} is ${status}` : `${name}: ${detail}`
      signals[alias] = { state: "error", reason, ...(owner === undefined ? {} : { owner }) }
    }
  }
  return signals
}

/** What the status handler and the `/notion` view share. `read` never keeps state: it asks the host when it runs. */
export interface StatusReader {
  readonly handler: MethodHandler
  read(unguardedAgents: UnguardedAgentsResult): Promise<StatusAnswer>
}

/**
 * The status reader. The handler asks the register for the unguarded agents through `call.unguardedAgents()`; the
 * command view passes the same value, computed from `ctx.agent.list()` and the registration's rules, so both render one
 * answer.
 */
export function createStatus(deps: StatusDeps): StatusReader {
  const profiles: readonly AccountProfile[] = deps.aliases.map((alias) => ({ alias }))
  const read = async (unguardedAgents: UnguardedAgentsResult): Promise<StatusAnswer> => {
    const problems = [...deps.problems]
    let accounts: readonly AccountStatus[]
    try {
      accounts = accountStatuses(profiles, await signalsOf(deps))
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      problems.push(problemLine(`UNAVAILABLE: the account states could not be read (${reason}). Next step: restart OpenCode and run /notion status again.`))
      accounts = accountStatuses(profiles, {})
    }
    return statusAnswer({
      manifest: deps.manifest,
      version: deps.version,
      hostVersion: deps.hostVersion,
      accounts,
      problems,
      unguardedAgents,
    })
  }
  return {
    handler: {
      description: STATUS_DESCRIPTION,
      input: EMPTY,
      output: STATUS_SCHEMA,
      async run(_input, call) {
        return read(await call.unguardedAgents())
      },
    },
    read,
  }
}

/** The one-line state label the command shows. */
const STATE_TEXT = { ready: "ready", needs_sign_in: "sign-in required", error: "error" } as const

/** The `/notion` view: the same answer, as a few plain lines. */
export function formatStatus(answer: StatusAnswer): string {
  const accounts = answer.accounts.length === 0 ? "none" : answer.accounts.map((account) => `${account.alias}: ${STATE_TEXT[account.state]}${account.owner === undefined ? "" : ` (${account.owner.label})`}`).join(", ")
  return [
    `Notion ${answer.version}`,
    `- State: ${STATE_TEXT[answer.state]}`,
    `- Accounts: ${accounts}`,
    `- OpenCode: ${answer.host.version} (supported ${answer.host.range}; tested ${answer.host.tested.join(", ")})`,
    `- Agents without the generated rules: ${answer.unguardedAgents.length === 0 ? "none" : answer.unguardedAgents.join(", ")}`,
    `- Next step: ${answer.nextStep ?? "Nothing to do."}`,
  ].join("\n")
}
