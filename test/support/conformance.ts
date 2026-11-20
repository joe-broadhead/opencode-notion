// source-contract's conformance kit, run over this plugin's own reads for its one source (events_list and probe), as
// setup registers them, against the fake Notion of test/support/fake-notion.ts and test/fixtures/conformance.json. No
// live call is made. Each read runs in the kit's recording permission: the plugin's own asserts go to it, and so does
// every Notion tool the fake executor runs (`notion_<tool>`, as OpenCode's executor asserts it), so declared must equal
// asserted. `npm run conformance` writes the report (reports/conformance-report.json); test/unit/source.test.ts asserts it.
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { sourceConformance, type ConformanceReport, type SessionContext, type ToolDeclaration } from "@we-the-rebel-alliance/source-contract/conformance"
import { encodeBoundCursor } from "@we-the-rebel-alliance/source-contract/cursor"
import { readInstalledDescriptor, type InstalledDescriptor } from "@we-the-rebel-alliance/source-contract/descriptor"
import { SOURCES_SCHEMA } from "@we-the-rebel-alliance/source-contract/schema"
import { METHODS } from "../../src/host/tools-rpc.js"
import { PACKAGE, SOURCE, eventsMethod, probeMethod, signIns } from "../../src/source.js"
import { FIXTURE, ROOT, call, fakeContext, type Fixture } from "./fake-notion.js"

export { ROOT }

/** The plugin's tools RPC methods, as describe lists them: the tools a source may name, each read-only or not. */
export function declaredTools(): ToolDeclaration[] {
  const ctx = fakeContext(FIXTURE, async () => {})
  return [...METHODS, eventsMethod(ctx), probeMethod(ctx)].map((method) => ({ id: method.name, readOnly: method.class === "read" }))
}

/** The repository's package.json, read as a consumer reads an installed plugin: checked, then hashed. */
export function installed(): InstalledDescriptor {
  const checked = readInstalledDescriptor(ROOT)
  if (!checked.ok) throw new Error(`package.json's sources: ${checked.problems.join("; ")}`)
  return checked.value
}

/** package.json's sources, as Memory's schema parses them for the kit. */
export function declaredSources() {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { sources: unknown }
  const checked = SOURCES_SCHEMA.check(pkg.sources)
  if (!checked.ok) throw new Error(`package.json's sources: ${checked.problems.join("; ")}`)
  return checked.value
}

/** The kit's report for the declared source. */
export async function conformanceReports(fixture: Fixture = FIXTURE): Promise<ConformanceReport[]> {
  // Read as a consumer reads it first (the frame, checked and hashed), then as the kit reads it (Memory's schema).
  installed()
  const sources = declaredSources()
  const account = fixture.self.workspace.id
  const now = Date.parse(fixture.now)
  // What the plugin keeps for the one sign-in: nothing at the start, as after a restart. No probe runs first, so the kit's
  // first listing reads who is signed in itself, as a consumer's collection does after a restart.
  const known = signIns()
  const methods = (session: Pick<SessionContext, "permission">) => {
    const ctx = fakeContext(fixture, async (input) => session.permission.assert(input), { signIns: known })
    return { events: eventsMethod(ctx, () => now), probe: probeMethod(ctx) }
  }
  const reports: ConformanceReport[] = []
  for (const source of sources.items) {
    reports.push(
      await sourceConformance({
        plugin: PACKAGE,
        source,
        tools: declaredTools(),
        account,
        sources: { rpc: sources.rpc, probe: sources.probe },
        describe: { id: sources.rpc },
        atomicPages: {
          reason:
            "every notion-search answers a whole list in one call: a page is listed from an answer or the call fails, and events_list fails with it, so no single page can fail on its own",
        },
        noExpiry: {
          reason: "the cursor is a last-edit time and a page id, and Notion's search can be asked from any time, so it never expires; edits it cannot list are answered with gap window-truncated",
        },
        calls: {
          list: (input, session) => methods(session).events.run(input, call()),
          probe: (input, session) => methods(session).probe.run(input, call()),
        },
        cases: [
          { name: "the edits since a day, with a page whose title holds a secret refused", input: { source: SOURCE, account, since: "2026-11-15T00:00:00Z" } },
          { name: "the oldest edit, then more", input: { since: "2026-11-15T00:00:00Z", limit: 1 } },
          { name: "an empty page still carries a cursor", input: { source: SOURCE, since: "2026-11-16T09:00:00Z" }, expect: "empty" },
          { name: "more edits in one day than a search lists answer a gap once, then read on", input: { since: "2026-11-10T00:00:00Z", limit: 5 } },
          { name: "another workspace is refused", input: { account: fixture.otherWorkspace }, expect: { refuses: "ACCOUNT_MISMATCH" } },
          {
            name: "another workspace's cursor is refused",
            input: { cursor: encodeBoundCursor({ plugin: "notion", source: SOURCE, account: fixture.otherWorkspace }, { a: fixture.otherWorkspace, t: now - 3_600_000, i: "" }) },
            expect: { refuses: "ACCOUNT_MISMATCH" },
          },
          { name: "another source's cursor is refused", input: { cursor: encodeBoundCursor({ plugin: "notion", source: "comments", account }, { a: account, t: now - 3_600_000, i: "" }) }, expect: { refuses: "CURSOR_INVALID" } },
          { name: "a scope is refused, since this source reads the whole workspace", input: { scope: { teamspaces: ["Design"] } }, expect: { refuses: "INPUT_INVALID" } },
          { name: "another source is refused", input: { source: "comments" }, expect: { refuses: "SOURCE_UNKNOWN" } },
        ],
      }),
    )
  }
  return reports
}
