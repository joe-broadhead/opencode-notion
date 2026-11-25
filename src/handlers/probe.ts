import { PROBE_SCHEMA, parseProbeInput, probeResult } from "@we-the-rebel-alliance/plugin-contract/events"
import type { JsonSchema } from "@we-the-rebel-alliance/plugin-contract/manifest"
import { RegisterError, refusal, type MethodCall, type MethodHandler } from "@we-the-rebel-alliance/plugin-contract/register"
import type { Identity, NotionReader } from "../provider/notion.ts"
import { SOURCE } from "./events.ts"

const PROBE_DESCRIPTION =
  "For a consumer binding Notion's pages source, not for answering questions: who is signed in to an account, from one notion-get-self read, and nothing else. " +
  "It returns the owner and the workspace as an organization; no page or database content is read."

const PROBE_INPUT = {
  type: "object",
  additionalProperties: false,
  properties: {
    source: { type: "string", enum: [SOURCE], description: "The source to probe; pages." },
  },
} as const satisfies JsonSchema

export const invalidInput = (problems: readonly string[]) =>
  new RegisterError(
    refusal("INPUT_INVALID", `The probe input is invalid: ${problems.join("; ")}`, "Pass only source, as the method's schema describes."),
  )

/** The `probe` handler: one identity read for the alias, no content, and the workspace as an organization. */
export function probeHandler(
  provider: { reader: (alias: string, call: MethodCall) => NotionReader },
  identities: { resolve: (alias: string, read: () => Promise<Identity>) => Promise<Identity> },
): MethodHandler {
  return {
    description: PROBE_DESCRIPTION,
    input: PROBE_INPUT,
    output: PROBE_SCHEMA,
    async run(input, call) {
      const parsed = parseProbeInput(input)
      if (!parsed.ok) throw invalidInput(parsed.problems)
      if (parsed.value.source !== undefined && parsed.value.source !== SOURCE) {
        throw new RegisterError(refusal("SOURCE_UNKNOWN", "This plugin lists one source, pages", 'Leave source out, or pass "pages".'))
      }
      const reader = provider.reader(call.account, call)
      const identity = await identities.resolve(call.account, () => reader.identity())
      const orgs = identity.workspace === undefined ? undefined : [{ id: `notion-workspace:${identity.workspace.id}`, label: identity.workspace.label }]
      return probeResult({
        source: SOURCE,
        account: call.account,
        owner: { ...identity.owner, ...(orgs === undefined ? {} : { orgs }) },
      })
    },
  }
}
