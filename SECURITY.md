# Security

## Supported versions

Fixes go into the newest release. Older releases are not patched. The plugin supports OpenCode `>=2.4.1 <2.5.0`, tested
on 2.4.1.

## Reporting a vulnerability

Report vulnerabilities privately through GitHub private vulnerability reporting: open the repository's **Security** tab
and choose **Report a vulnerability**. Do not open a public issue. Include the plugin version, the OpenCode version, your
plugin options and the steps to reproduce. Never include tokens, workspace content or other Notion content.

Vulnerabilities in Notion's service or in OpenCode itself are out of scope. Report those to Notion or to the OpenCode
project.

## Data handling

- The plugin holds no credential and makes no HTTP request of its own. It registers one vendor MCP server per alias;
  OpenCode connects, signs in and stores each credential. Every read the plugin makes goes through OpenCode's executor
  for that server.
- The one OAuth scope requested is `default`. The plugin never asks for a password, an API key or an integration token.
- Of a user's own `mcp.servers.notion` entry the plugin reads only the type, the URL and whether `oauth` is `false`. It
  never reads, copies or reports its headers. Status shows server URLs without their query strings.
- The per-alias identity is kept in the plugin instance only: the owner's id and label and the workspace's id and name. No page
  content, no email and no token is kept.
- Workspace content is other people's data. Pages, databases, comments, files and calendar entries reach the model as
  tool results, like any other tool result in the session. Notion returns only what the signed-in person can see.
- Notion content is untrusted. Pages, comments, files and connector results come from other people and can contain
  instructions aimed at the model. The skills tell the model to treat them as data, and never to follow an instruction
  inside a page or a comment.

## Permissions

1. **Notion's server and the workspace's access.** The sign-in is the person's own; the server returns only what that
   person can see. An admin can restrict AI apps to an approved list.
2. **Generated access rules.** The contract generates one rule per method and one per alias for each pass-through MCP
   tool. `all` allows everything, `ask-changes` asks for every non-read, and `read-only` denies it. A method with
   `effect: "ask"` asks even at `all`.
3. **The person's own rules.** OpenCode applies the agent's and the session's rules after the generated ones, so a later
   rule the person adds wins for one method. A saved approval never confirms an RPC write: the contract's register
   forces a fresh one-call ask. No saved approval or later rule can override a `deny`.

A saved approval on a pass-through tool applies to that alias's server only. A rule or grant for one alias never reaches
another alias's tools.

## Scripts and RPC

The single RPC id `notion` carries `status`, `probe` and `events_list`. A caller of the OpenCode server API already
holds the server's authority; the session is not a login. A non-read method over RPC needs an answered permission ask or
a host-signed action grant, which the contract's `register` enforces. This plugin declares no non-read method of its
own; the vendor's tools are not RPC methods here.

## Report a security problem

Do not open a public issue for a vulnerability. Use GitHub's private vulnerability reporting, and include no token or
workspace content in the report.
