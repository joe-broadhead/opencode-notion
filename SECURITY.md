# Security

## Supported versions

Fixes go into the newest release. Older releases are not patched.

## Reporting a vulnerability

Report vulnerabilities privately through GitHub private vulnerability reporting: open the repository's **Security** tab
and choose **Report a vulnerability**. Do not open a public issue. Include the plugin version, the OpenCode version, your
plugin options and the steps to reproduce. Never include tokens, workspace content or other Notion content.

Vulnerabilities in Notion's service or in OpenCode itself are out of scope. Report those to Notion or to the OpenCode
project.

## Data handling

- The plugin holds no credential and runs no network request of its own. It registers Notion's MCP server with OpenCode,
  and OpenCode connects, signs in and stores the credentials. The tools RPC for scripts (see [Scripts](#scripts)) runs
  Notion's tools through OpenCode's own connection, too.
- The plugin never reads tokens. Of a user's own `mcp.servers.notion` entry it reads only the type, the URL and whether
  `oauth` is `false`; it never reads, copies or reports its `headers`, which may hold an MCP token. Status shows server
  URLs without their query strings, never OpenCode's text for a needed sign-in, which can hold an authorization URL, and
  cuts a connection failure's reason to one line with no URL credentials, query or token.
- The workspace name and connection type come from the last `notion-get-self` result the model or a script asked for, and
  are kept in memory only. Nothing else of that result is read: no user name, email or ID, no workspace ID, and not the
  icon.
- **Workspace content is other people's data.** Pages, databases, comments, files, meeting notes and calendar entries
  reach the model as tool results, and the agent sends them to your model provider, like any other tool result in the
  session. Notion acts with the permissions of the person who signed in. Notion stores workspace data in the United
  States, unless an Enterprise workspace has been migrated to another region, and the workspace's own AI policy applies.
- **Notion's connected sources are a second path.** `notion-connector-search` searches the Slack, Drive, GitHub, Jira,
  mail and calendar sources connected in Notion, and needs Business or Enterprise with Notion AI. A hit passes through
  Notion to the model, under the user's own connection to each source. The plugin routes a Slack, Drive, GitHub, Linear or
  Granola question to that source's own plugin first, and labels anything that came through Notion's connector.
- Notion content is untrusted. Pages, comments, fetched threads and Notion AI summaries come from other people and can
  contain instructions aimed at the model. The skills tell the model to treat them as data, and never to follow an
  instruction inside a page or a comment.
- Nine tools are denied by default: the three that trash a page, a database or a comment; `notion-restore-version`, which
  replaces a whole page with a past version; `notion-upload-skill`, which replaces a Skill page; the three Custom Agent
  tools, which spend AI credits and act with the user's permissions; and `notion-calendar-cancel-events`. Turning one on
  takes an `ask` rule in an agent's own `permissions`, so each call still asks, in that agent only.

## Permissions

What the model can do in Notion is limited by these layers, in this order:

1. **Notion's server and your workspace access.** The sign-in is your own Notion user, and the server returns only what
   that user can see. Guests cannot connect. An Enterprise workspace can restrict its members to an approved list of AI
   apps, and an admin can revoke a connection. Notion offers one scope for all of MCP, so there is no read-only sign-in:
   read-only use comes from permission rules.
2. **Default permission rules.** Every Notion tool asks before it runs, except Notion's read tools listed in
   `src/notion-tools.ts`, which run without a prompt. The nine tools above are denied, and hidden from the model. Some
   changes that ask still reach people: a comment's mention notifies a colleague, a moved page changes who can see it, and
   a calendar event may notify its attendees.
3. **Your OpenCode permissions.** Your `permissions` rules and saved "Always allow" answers override the default rules. A
   `deny` you configure always wins.

Things to know:

- **One sign-in per workspace.** Notion rotates the refresh token on every use, and reusing one that has been rotated away
  revokes the whole grant. Two OpenCode processes sharing one credential can revoke it for each other. Run one process per
  sign-in, and if a sign-in that worked needs a new one, sign out and in again once.
- **Saved approvals are broad.** "Always allow" on a Notion tool saves the pattern `*` for that tool's action. It applies
  to every agent in the OpenCode project, Plan included, until you remove it. Think twice before saving one for a tool that
  changes what others see. OpenCode identifies a project by its git repository. A folder outside any git repository with a
  commit may belong to OpenCode's shared `global` project, so an approval saved there may apply in other such folders too.
- **Some agents get no default rules.** Agents defined only in your own config, and agents added by plugins that load
  after this one, are created after the plugin inserts its rules, and agents without a base allow get none. Notion tools
  may run there without asking. `/notion-status` names these agents and gives the fix: put the default rules it shows first
  in that agent's own `permissions`, followed by your top-level rules for Notion tools. Do not put them in the top-level
  `permissions`, which would loosen Explore.
- **Unattended runs refuse prompts.** In `opencode run`, a Notion tool that would ask is refused.
- **The `notion_*` rule also matches other servers** whose names start with `notion_`. For their tools it only adds
  prompts.
- **The rules follow the name, not the server.** When your own `mcp.servers.notion` points at another URL, status reports a
  conflict and the plugin adds no server, but the default rules still allow the known read names, so a tool of that server
  with such a name runs without asking. Point the entry at Notion's URL, or remove it.

## Scripts

The tools RPC (`notion.workspace.tools`, see
[docs/scripting.md](https://github.com/joe-broadhead/opencode-notion/blob/HEAD/docs/scripting.md)) runs Notion's known read
tools for a script, with no model. It adds no authority:

- A script names a session that names an agent, and runs as them. A tool that the agent's or the session's rules hide from
  the model is refused. OpenCode's own executor then checks the call against the agent's rules, the session's rules and
  saved approvals, as it does for the model. A session in another directory than the server answering the call runs under
  the serving location's agent rules, and only a deny is refused in between: the README's known limits say so.
- An ask on a script's call is denied, not prompted: no one is there to answer it. The plugin's permission hook changes
  only an ask on one of its own script calls in flight, only to a deny, and leaves every other call alone.
- Only the known reads are methods. Notion's write tools never are, nor the nine denied tools, nor a tool that Notion adds
  later, even with an allow rule.
- The call goes through OpenCode's own MCP connection and sign-in. The plugin never sees the token, and returns none.
- Notion's error text reaches the script only as the first line, at most 300 characters, with tokens and URL query strings
  removed.
- OpenCode's `execute.before` and `execute.after` tool hooks, from any plugin, do not run for a script's call, so another
  plugin's policy hook does not see it. A script's calls are not recorded in the session.
- The RPC is reachable only by callers of the OpenCode server API, who already hold the server's full authority. The session
  is not a login: it scopes a script to what its agent may do.
