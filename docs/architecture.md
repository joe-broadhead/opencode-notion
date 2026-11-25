# Architecture

The plugin is a thin layer over Notion's official MCP server. OpenCode owns the MCP transport, OAuth, credentials,
permission asks and tool execution. The contract owns the manifest, accounts, access rules, doors, status and errors.
The plugin owns what only it knows: the per-alias server names, the pages source, the provider reads and one status view.

## Layers

| Path | Role |
| --- | --- |
| `src/index.ts` | `Plugin.define({ id: "notion", setup })`: the host gate, account registration, the provider, one `register` call, the `/notion` command and the account watcher |
| `src/manifest.ts` | Reads `package.json` for the capabilities manifest and the version |
| `src/accounts.ts` | One MCP server per alias through `registerAccounts`; adopts the user's own `notion` entry at Notion's URL, or reports a conflict |
| `src/provider/server.ts` | The one Notion MCP URL, the pinned OAuth scope and the remote server config |
| `src/provider/notion.ts` | The provider client: alias → server → MCP tool, error mapping, `notion-get-self` identity and `notion-search` parsing |
| `src/provider/identity.ts` | The per-alias identity cache |
| `src/handlers/events.ts` | `events_list`: the search walk, last-edit ordering, the plan gate, gaps, the URL filter and the cursor |
| `src/handlers/probe.ts` | `probe`: one identity read per alias, no content |
| `src/handlers/status.ts` | `status`: host, state, one entry per alias and one next step |
| `src/status.ts` | The `/notion` command view, which renders the same status answer |
| `src/watch.ts` | The `account` bus watcher: an alias's MCP server status changed |

There is no TUI, no per-request hook and no copied contract code.

## The provider client

`createProvider({ tool, mcp, owned })` wraps OpenCode's own MCP boundary. It does not speak HTTP to Notion and
holds no credential. For one alias it derives the server name with `accountName("notion", alias)` and the tool id with
`toolAction(server, tool)` (`notion` for `default`, `notion-work` otherwise), then finds that entry in `ctx.tool.list()`
and calls its `execute` with the handler's call facts. The MCP tool's own permission action
(`notion-work_notion-search`) is what OpenCode checks, so the alias's sign-in and rules apply.

The tool list is read once per handler call and shared by every search in that call. A missing tool is read against
`ctx.mcp.list()`: a sign-in that needs attention is `NEEDS_SIGN_IN`, and a server that is connecting, disabled, failed
or not registered is `UNAVAILABLE` with the next step. Notion's own error is `RATE_LIMITED` (with `retry_after_seconds`
when it names one) or `UNAVAILABLE`; a permission refusal is `PERMISSION_DENIED`.

`readSearch` reads a `notion-search` answer: a notice that the plan dropped the sort, the date filter or an author
filter is the plan refusal; another shape, or results not ordered newest first, is `UNAVAILABLE`. A result needs an id,
a timestamp with a zone and a `page` or `database` type; a URL is kept only when it is https on one of the source's
`urlHosts`, without query or fragment.

## What is cached

The only cache is the per-alias identity: the owner and workspace from a `notion-get-self` read, held for the plugin
instance. `probe` and `events_list` share it, concurrent readers of one alias share one read, and a failed read
is kept by nobody. The account watcher clears one alias when its server leaves the connected state. The cache never
holds page content and never reaches disk.

## OpenCode APIs used

| API | Use |
| --- | --- |
| `ctx.app.version` | `assertHost` checks it against the manifest's range |
| `ctx.mcp.transform` | Reads the user's `notion` entry and lets `registerAccounts` set one server per alias |
| `ctx.mcp.list` | The provider's connection state, and status's per-alias state |
| `ctx.tool.list` and an MCP tool's `execute` | Every `notion-get-self` and `notion-search` read |
| `ctx.agent.list` | The `/notion` view's unguarded-agent list; the status handler asks the call instead |
| `ctx.command.transform` and `ctx.session.synthetic` | The `/notion` status view |
| `ctx.event.subscribe` | `mcp.status.changed` for the alias servers, which emits `account` |
| `ctx.permission.assert`, `ctx.agent.transform`, `ctx.tool.transform` and `ctx.rpc.register` | Reached only through the contract's `register`, never by the plugin |

## Setup order

1. `assertHost(ctx, manifest)` refuses an OpenCode release outside `>=2.4.1 <2.5.0` with `HOST_UNTESTED`, unless
   `options.allowUntestedHost` is true.
2. `registerNotionAccounts` reads the user's `notion` entry, then registers `notion-<alias>` for every alias it owns.
3. The provider, the identity cache, the handler table and the status reader are built.
4. `register(ctx, manifest, handlers)` adds the access rules, the namespace and one RPC id `notion`, and builds the
   bus writer from that registration; `registration.bus` and every `call.bus` are always present.
5. The `/notion` command is registered. Its view derives the rules with `accessLevel`/`rulesFor` from the options and
   asks `unguardedAgents` for the agents; the status handler asks `call.unguardedAgents()` instead, so it keeps no state
   filled after `register` returns.
6. The account watcher subscribes last. Setup returns one cleanup that stops it and disposes the registration.
