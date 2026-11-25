# Security

## Supported versions

Fixes go into the newest release. Older releases are not patched. The plugin supports OpenCode `>=2.4.1 <2.5.0`,
tested on 2.4.1.

## Reporting a vulnerability

Report vulnerabilities privately through GitHub private vulnerability reporting: open the repository's **Security** tab
and choose **Report a vulnerability**. Do not open a public issue. Include the plugin version, the OpenCode version,
your plugin options and the steps to reproduce. Never include tokens, workspace content or other Notion content.

Vulnerabilities in Notion's service or in OpenCode itself are out of scope. Report those to Notion or to the OpenCode
project.

## What leaves the machine

- The plugin holds no credential and makes no HTTP request of its own. OpenCode connects to Notion's MCP server, signs
  in and stores the credential; every read the plugin makes goes through OpenCode's executor for that server.
- A read sends only the tool input: `notion-get-self` with `{}`, and `notion-search` with an empty query, the
  last-edit sort, a whole-day date range and one author filter set to `"me"`. It never sends a page body.
- Page results reach the model as tool results, and an agent may send them to its model provider, like any other tool
  result. Notion returns only what the signed-in person can see.
- One vendor MCP server is registered per alias, named `notion` or `notion-<alias>`, each with its own OAuth. The one
  scope requested is `default`. The pin matters: Notion's metadata also advertises `ema_issuer:manage`, its
  enterprise-managed authorization scope, and OpenCode falls back to every advertised scope when a challenge names
  none.
- Of a user's own `mcp.servers.notion` entry the plugin reads only the type, the URL and whether `oauth` is `false`.
  It never reads, copies or reports its headers, which may hold an MCP token. An entry at another URL is reported as a
  conflict and left alone; its reads are refused, never sent to another server.

## Redaction

- Status reasons are one line, cut to 160 characters and redacted by the contract's `redactReason`: URL query values,
  authorization credentials, JWTs and token-shaped words are replaced, and control characters become spaces.
- A provider failure's reason is cut to one line and 200 characters before it becomes the refusal's message. Token
  values are not echoed.
- Status never carries page content, a page URL's query or fragment, an owner's email, or a raw provider error that may
  name a credential.
- The conformance fixture is invented: two synthetic aliases, invented workspaces, pages and people, and no secret.
  `plugin-kit record` redacts any fixture it writes.

## No plans or commits of the plugin's own

The plugin declares no action and no `plans`/`commits` method. Every write is one of Notion's pass-through MCP tools,
which the vendor's server registers and OpenCode runs. The plugin has no preview to show and no commit to verify, and it
never sees a write's progress. Its `access` rules still classify every pass-through tool (read, write, send, share,
delete, export or admin), and `ask-changes` or `read-only` restricts them; the vendor and OpenCode own the call.

## The plan gate

`events_list` refuses with `UNAVAILABLE` when Notion's search answers a notice that it dropped the last-edit sort, the
date filter or the author filter. Listing without them would order pages differently or include pages the account did
not create or edit, so the plugin returns no page rather than a misleading one. The same rule applies when no search ran.

## Untrusted content

Page and database titles, comments, files and connector results come from other people and can contain instructions
aimed at the model. The skills tell the model to treat them as data, never to follow an instruction inside a page or a
comment. Every page and probe answer, and every event, is marked `trust: "untrusted"`.
