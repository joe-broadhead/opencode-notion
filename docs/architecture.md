# Architecture

The plugin is a thin layer over Notion's official MCP server. OpenCode owns the MCP transport, OAuth, credentials,
permission prompts and tool output limits. The plugin registers the server, names its `/connect` entry, adds default
permission rules, reports status, ships two skills, adds `notion_events_list`, and lets scripts call the known tools
through a tools RPC. It also offers one source of the source contract, `notion.pages`, to consumers that call it through
the tools RPC. It has no runtime dependencies: the source contract package it uses is bundled into `dist/index.js`.

## Layout

| Path | Role |
| --- | --- |
| `src/index.ts` | The server part: the plugin `notion.workspace`, pointed at Notion's server |
| `src/plugin.ts` | Setup, server registration or adoption, and the `notion_events_list` tool |
| `src/integration.ts` | The `/connect` entry: its name "Notion", and the sign-in problem on its account |
| `src/account.ts` | The workspace name and connection type from the model's own `notion-get-self` calls; when the server's status last changed |
| `src/options.ts` | Option parsing and validation |
| `src/host-version.ts` | The host check: the supported range and the tested releases |
| `src/notion-tools.ts` | `READ_TOOLS`, `WRITE_TOOLS`, `DESTRUCTIVE_TOOLS`, `PARAMETERS`, `PLUGIN_METHODS` and `classify()`: every fact the plugin keeps about Notion's tools. No runtime imports |
| `src/permissions.ts` | The default rules, their placement, and detection of agents without them |
| `src/status.ts` | The status model and text, `/notion-status`, and the status RPC method |
| `src/redact.ts` | Redaction for everything status shows: URL credentials, queries and token shapes removed, one line, controls and bidi characters stripped, cut by whole characters |
| `src/skills.ts` | Loading and registering the skills |
| `src/host/tools-rpc.ts` | Notion's part of the tools RPC, `notion.workspace.tools`: the plugin value and the method table the source contract's `tools-rpc` module takes |
| `src/source.ts` | The pages source, `notion.pages`: `events_list` and `probe`, over `notion-get-self` and `notion-search`; `events_list` is also registered as a tool |
| `src/tui.ts` | The terminal UI part: the plugin `notion.workspace.tui` and the `/notion` dialog |
| `src/constants.ts` | IDs, the server name and URL, the one OAuth scope, the Code Mode namespace description, the supported host range, the tested releases and the error shape. No imports, so `scripts/check.mjs` can load it |
| `src/version.ts` | The plugin's version from `package.json`; the build replaces it with the version string alone |

The default rules, the tools RPC's methods, status's unknown tools, the fake server in the tests and the checks of
`jelly.tools` and the skills all derive from `src/notion-tools.ts`, so a change to Notion's tools is a change there, in
`jelly.tools`, and in any skill example that names a tool. `test/unit/notion-live-tools.json` is the tool table as a
signed-in server should list it; `npm run drift` compares it with the lists.

`scripts/build.mjs` bundles each entry with esbuild into one self-contained file: `src/index.ts` into `dist/index.js` and
`src/tui.ts` into `dist/tui.js`. Shared code, such as the status model and the RPC contract, is inlined into both. The
bundles have no chunks and no relative imports, because OpenCode reloads a plugin in place and keeps the modules it
already loaded for unchanged paths. Only `@opencode/plugin`, OpenTUI, Solid and `node:` built-ins stay external. `tsc`
only typechecks. The package exports `.` (`dist/index.js`) and `./tui` (`dist/tui.js`), plus the three icon files.

## Setup

1. `parseOptions` validates `access` and `allowUntestedHost`; anything else fails with `OPTIONS_INVALID`.
2. `checkHost` compares `ctx.app.version` with `>=2.4.1 <2.5.0`, the same range as `opencode.host` in `package.json`.
   Inside it the plugin starts, and status calls only 2.4.1 tested. Outside it, setup fails with `HOST_UNTESTED` unless
   `allowUntestedHost` is set.
3. The skills are read from the package's `skills/` folder, before the synchronous skill transform needs them.
4. `ctx.mcp.transform` registers `notion` at Notion's URL with its one scope pinned, or adopts the user's own entry at
   that URL, reading only its type, URL and whether `oauth` is `false`. Any other URL, or a local command, is a
   conflict: nothing is added, and status reports it.
5. `ctx.tool.transform` gives the `notion` namespace its Code Mode description.
6. `ctx.agent.transform` inserts the default rules after each agent's base `* * allow`.
7. `watchAccount` registers one `execute.after` hook for `notion_notion-get-self` results, keeps the workspace name and
   connection type in memory, and notes when the server's status last changes.
8. `ctx.skill.transform`, `ctx.command.transform` (`/notion-status`) and `ctx.rpc.register` (`notion.workspace/status`).
9. `registerToolsRpc` registers the tools RPC, `notion.workspace.tools`, with the known tools and the pages source's
   `events_list` and `probe`, and its `evaluate` hook.
10. `registerEventsTool` adds `notion_events_list` to the `notion` namespace: the same run and schemas as the RPC method.
11. `watchIntegration` starts. Setup returns one cleanup that stops it, disposes the tools RPC and stops the account
    watcher.

Transforms are synchronous and never throw: a failure is kept as a problem for status, and cleared when the next replay
succeeds.

## Status

`readStatus` reads the server's state (`ctx.mcp.list()`), the `notion` tools (`ctx.tool.list()`, by the namespace
`notion`, without the plugin's own methods), every agent's rules (`ctx.agent.list()`) and the skills OpenCode lists
(`ctx.skill.list()`). `buildStatus` turns them into one model, and `formatStatus` renders it in a fixed order: Connection,
Account, Access, Server, Tools, Agents without default rules, OpenCode, and exactly one Next step. For 15 seconds after
the server's status changes, no tools means "still listing". An agent is listed only when it has a base allow, lacks the
plugin's whole block after it, and its own rules would let a new Notion tool run without asking. A skill of the plugin's
id that OpenCode loads from another path is named. OpenCode's text for a needed sign-in is never shown, and a failure's
reason is cut to one line of 160 characters with no URL query.

`/notion-status` posts the text with `ctx.session.synthetic`. The RPC method returns the model to the terminal UI and to
scripts, with the fields every plugin of this family shares (`version`, `host`, `state`, `unguardedAgents`, `nextStep`).
A status it cannot read is its declared error `unavailable`, with a next step.

## Tools RPC

`notion.workspace.tools` lets a script call every known tool with no model; [Scripting](scripting.md) is the user's view.
Its methods are `describe` and one per name in `READ_TOOLS`, `WRITE_TOOLS` and `DESTRUCTIVE_TOOLS`, named after the
upstream tool, hyphens included (`notion-search`), each with its class, plus the pages source's `events_list` and
`probe`. A tool that Notion adds later is never a method. The rules are resolved before dispatch: an `ask` or a `deny`
is refused with no call, and only an `allow` runs.

A call is `{ sessionID, input }`. The module looks up the session and the agent's rules (`SESSION_UNKNOWN`,
`SESSION_AGENT_REQUIRED`), refuses a denied or asking action (`PERMISSION_DENIED`) and a conflicting server
(`SERVER_CONFLICT`), finds the tool's executor or names the connection state, calls it with a new call id, and returns
`{ output?, text }`. OpenCode's executor checks `notion_<tool>` itself and sends OpenCode's own credential.

While a call runs, its id is live. A `permission.hook("evaluate")` from the source contract's `tools-rpc` module turns
an `ask` whose source id is live into a deny, so the script gets `PERMISSION_DENIED` at once and no prompt waits. This is
the plugin's only permission hook, and the forbidden scan allows exactly this one in the bundle.

A `Tool.Error` with a cause is a permission refusal; one without a cause is Notion's own error, which becomes
`UPSTREAM_ERROR` with its first line, at most 300 characters, with tokens and URL queries removed.

## The pages source

`package.json`'s top-level `sources` declares one source of the source contract, `notion.pages` (kind `events`, reads
`doc`), on the tools RPC `notion.workspace.tools`. `src/source.ts` implements its two methods:

- `probe` asserts `notion_probe`, then reads `notion-get-self`: the account is the workspace's id, and the owner is the
  signed-in user, `notion:` and their id, labelled with their name. It records them for the sign-in; `watchAccount`
  clears the record on `credential.switched` or a status that is not connected.
- `events_list` asserts `notion_events_list` and reads only `notion-search`, with an empty query, `sort: "last_edited"`,
  `filters.last_edited_date_range` and one author filter for the signed-in user (`filters.edited_by_user_ids`, then
  `filters.created_by_user_ids`, each `["me"]`): it walks once with each and lists the union, each page once. Notion runs
  that sort and those filters only for Business and Enterprise workspaces; on another plan it drops them with a notice,
  and the source refuses with `UNAVAILABLE` rather than list pages in another order.

Each result gives a page's id, title, URL, type and `timestamp`, its last edit to the minute; no tool names the editor,
so `actors` is empty, and no content is read, so `text` is empty. An edit is listed once its minute ended ten minutes ago.
The cursor is the source contract's, bound to the plugin, the source and the workspace, and holds the last (time, page
id) listed; it never expires.

`npm run conformance` runs the source contract's conformance kit over these methods against the fake Notion in
`test/support/fake-notion.ts` and writes `reports/conformance-report.json`, which a release attaches.

## Terminal UI part

`src/tui.ts` uses no JSX, because OpenTUI's JSX transform skips `node_modules`. One global keymap layer provides
"Notion: Status" (palette and `/notion`) and the `r` key, which is enabled only while the dialog is open. The dialog is a
`ui.dialog.alert`, which closes on `Esc`. It listens to events only while it is open, and refreshes on
`mcp.status.changed` for `notion`, `server.connected`, `agent.updated`, `integration.updated`, `credential.updated` and
`credential.switched`. The newest answer wins, and a refresh never reopens a closed dialog.

## Platform facts

These facts are checked on OpenCode 2.4.1, the tested release. Links point to the OpenCode source at tag `v2.4.1`.

| Topic | Fact | Source |
| --- | --- | --- |
| MCP tool permissions | The host asserts every MCP call: action `<server>_<tool>`, resource `*`. Its name sanitizer replaces every character outside `[a-zA-Z0-9_-]`, so Notion's hyphens survive and an action is `notion_notion-search`. A last-matching `deny` on `*` hides the tool. | [`tool/mcp.ts`](https://github.com/anomalyco/opencode/blob/v2.4.1/packages/core/src/tool/mcp.ts) |
| Rule evaluation | The last match wins. Saved approvals come after all rules as `allow`. An unattended `ask` is refused. | [`permission.ts`](https://github.com/anomalyco/opencode/blob/v2.4.1/packages/core/src/permission.ts) |
| Agent rule order | Built-in agents start from a base `* * allow` and exist before package plugins run. User `permissions`, and agents defined only in user config, come after. | [`config/plugin/agent.ts`](https://github.com/anomalyco/opencode/blob/v2.4.1/packages/core/src/config/plugin/agent.ts) |
| User MCP config | `mcp.servers` is applied before package plugins. A later plugin `set` would replace the user's entry. | [`config/plugin/mcp.ts`](https://github.com/anomalyco/opencode/blob/v2.4.1/packages/core/src/config/plugin/mcp.ts) |
| MCP sign-in scope | OpenCode requests `oauth.scope` when the server entry sets one, else the challenge's `scope`, else **every** scope in the protected-resource metadata's `scopes_supported`. Notion's challenge names `default`, but its metadata advertises `["default", "ema_issuer:manage"]`, its enterprise-managed authorization scope. The plugin therefore pins `oauth.scope` to `default`. The host test starts a sign-in whose challenge names no scope and asserts the request still says only `default`; the pack test repeats the normal case. | [`mcp/oauth.ts`](https://github.com/anomalyco/opencode/blob/v2.4.1/packages/core/src/mcp/oauth.ts) |
| MCP client registration | Without `oauth.client_id`, OpenCode signs in with its client ID metadata document when the authorization server advertises `client_id_metadata_document_supported` with the `none` auth method, and registers a client dynamically otherwise. Notion advertises both the metadata document and a registration endpoint; OpenCode chooses the document, so nothing is registered. Pinning `oauth.client_id` or `oauth.redirect_uri` would disable that. | [`mcp/oauth.ts`](https://github.com/anomalyco/opencode/blob/v2.4.1/packages/core/src/mcp/oauth.ts) |
| Refresh tokens | Notion rotates the refresh token on every use, and reusing one that has been rotated away revokes the whole grant. The host's refresh is serial, so one process is safe; two processes sharing one credential are not. | Notion's "Notion MCP OAuth specifics"; the host's token store |
| MCP integrations | Integration ID `mcp_` + the first 16 hex digits of sha1(`<name>\0<url>`), so credentials are kept per name and URL. | [`mcp/index.ts`](https://github.com/anomalyco/opencode/blob/v2.4.1/packages/core/src/mcp/index.ts) |
| Code Mode | MCP tools are in Code Mode by default. A tool name with a hyphen is not valid property syntax, so a call is `tools["notion"]["notion-search"]`. A declined prompt is an error the program can catch. Each tool's signature reaches the model; a tool's full description reaches it only through `search()`, so the skills name the tools they use. | [`codemode/tool.ts`](https://github.com/anomalyco/opencode/blob/v2.4.1/packages/core/src/codemode/tool.ts) |
| Account capture | `ctx.tool.hook("execute.after", …)` sees the tool's id and its completed result. The plugin reads only `workspace.name` and `user.type` from a `notion-get-self` result, and keeps them in memory. The tools RPC's executor skips the hook, so `shapeResult` captures the same fields for a script's call. | The host test on 2.4.1 |
| Tool executors | `ctx.tool.list()` returns each MCP tool with a callable `execute`, which checks `<server>_<tool>` with the agent's and the session's rules and saved approvals. A deny is a `Tool.Error` with a cause; the server's `isError` is one without. `execute.before` and `execute.after` hooks do not run for it. | [`tool/mcp.ts`](https://github.com/anomalyco/opencode/blob/v2.4.1/packages/core/src/tool/mcp.ts) |
| MCP server probe | A server entry with no `protocol` is probed with `server/discover` first, and a 401 ends the attempt: no `initialize` follows. The fake MCP server answers both. | The host test on 2.4.1 |
| RPC input | An RPC input given as a Standard Schema is validated with it; a plain JSON Schema is decoded with Effect, which drops unknown keys of an object that has properties. The package test checks the envelope. | `@opencode/core` 2.4.1, the RPC service's `parse` |
