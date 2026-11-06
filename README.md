# Notion for OpenCode

Search, read and edit your Notion workspace's pages, databases and comments from OpenCode, through Notion's official
MCP server.

Unofficial; not affiliated with Notion.

## Requirements

- OpenCode `>=2.2.3 <2.3.0`, tested on 2.2.3, 2.2.4 and 2.2.5. Outside that range the plugin does not start, unless
  you set `allowUntestedHost`.
- macOS or Linux, and a browser for the sign-in.
- A Notion workspace you are a **member** of. Guests cannot connect. Notion MCP works on every plan, Free included.
- Some tools need more: connected-source search and SQL across data sources need Business or Enterprise with Notion AI;
  comment editing, reactions, suggested edits and version history need Business or Enterprise; meeting notes need
  Business with Notion AI.
- An Enterprise workspace can restrict AI apps to an approved list. If yours does, an admin adds OpenCode first.
- Notion stores workspace data in the United States, unless your Enterprise workspace has been migrated to another
  region.
- Notion still labels this MCP server beta, so its tools and behaviour can change without notice.
- The tool table, and which tools read and write, comes from Notion's own documentation. This release has not been
  reconciled with a live tool list, so treat a tool's class as Notion's description of it, not as its annotation.

## Install

```sh
opencode plugin add @joe-broadhead/opencode-notion
```

Run `opencode reload`, or restart OpenCode. Then run `/notion-status`: it shows `sign-in required` until you sign in
(see [Sign in](#sign-in)).

The plugin registers Notion's MCP server under the name `notion`, adds default permission rules, the `/notion-status`
command, the `/notion` status view and two skills. Every tool is Notion's, and OpenCode handles the connection, the
sign-in and the stored credentials.

**Update** with `opencode plugin update @joe-broadhead/opencode-notion`, then run `opencode reload`. An entry pinned to a
version does not update: remove the `@version` from its `plugins` entry first.

## Sign in

Run `/connect` and choose **Notion** (it is listed under MCP). In the terminal UI, press `o` or Enter to open the link to
Notion's sign-in page in your browser, sign in, and choose the workspace to connect. The plugin asks Notion for its one scope, `default`, so there is no
access level to choose; the permission rules below narrow what the model may do. No integration token or API key is
needed or used.

From a terminal, run `opencode mcp auth notion` instead; it opens the link automatically. `/mcps` also offers the same
sign-in.

Notion issues a refresh token that it rotates on every use, and revoking or reusing one ends the whole sign-in. OpenCode
refreshes its own token as it goes; when it cannot, OpenCode asks for a new sign-in, and `/connect` marks the account while
it is still listed. OpenCode also shows its "MCP server needs authentication" notice.

To sign out, or to switch workspace, run `opencode mcp logout notion`, or remove the account in `/connect` → Notion. Then
sign in again. To sign out before you remove the plugin, see [Uninstall](#uninstall).

## Use

Ask, for example:

- "find where we wrote the launch decision"
- "summarise this page and its subpages"
- "which tasks in the tracker are overdue"
- "add a comment on the launch page for Jane Doe"
- "draft a spec page under the project"
- "what did my meeting notes say about the launch"

The model changes only what you ask for, names the pages it read, and keeps page content out of other tools unless you
name them. Label a Notion AI summary as Notion AI's.

| Command | What it does |
| --- | --- |
| `/notion-status` | Posts the status report into the session: connection, account, access, tools, agents without the default rules, the OpenCode check and the next step. The model can read it too. |
| `/notion`, or "Notion: Status" in the command palette | Opens the same report in a dialog. Press `r` to refresh it and `Esc` to close it. It also refreshes when Notion's connection, the sign-in or the agents change. |

The Account row shows the workspace and connection type from the last `notion-get-self` call the model or a script made
since OpenCode started; the plugin makes no Notion call of its own. Before one, it says the account has not been read
yet.

Two skills teach the model to use Notion well:

- `notion`: searching and reading pages and databases, citing them, meeting notes, Notion's connected sources, and the
  rules for other people's content.
- `notion-write`: whom each change reaches, saying so before the call, and the rule against replacing a whole page.

### Scripts

A script or a cron job can call Notion's read tools with no model, through `opencode api`. It runs as a session and its
agent, under that agent's permission rules and the session's own. Write tools are never available to scripts:

```sh
opencode api post /api/rpc/notion.workspace.tools/notion-search \
  -d '{"input":{"sessionID":"ses_…","input":{…}}}'
```

See [Scripting](https://github.com/joe-broadhead/opencode-notion/blob/HEAD/docs/scripting.md).

## Permissions

The plugin adds these rules to every agent, directly after the agent's base rule that allows everything:

1. `{ "action": "notion_*", "resource": "*", "effect": "ask" }`: every Notion tool asks, including tools Notion adds
   later.
2. One `allow` rule for each of Notion's 39 read tools, listed in
   [`src/notion-tools.ts`](https://github.com/joe-broadhead/opencode-notion/blob/HEAD/src/notion-tools.ts). These run
   without a prompt.
3. Nine `deny` rules, for tools that are off until you turn them on. A deny also hides the tool from the model.
   - `{ "action": "notion_notion-delete-pages", "resource": "*", "effect": "deny" }`: it trashes a page that everyone
     with access can see.
   - `{ "action": "notion_notion-delete-databases", "resource": "*", "effect": "deny" }`: the same, for a database.
   - `{ "action": "notion_notion-delete-comment", "resource": "*", "effect": "deny" }`: the same, for a comment.
   - `{ "action": "notion_notion-restore-version", "resource": "*", "effect": "deny" }`: it replaces a whole page with a
     past version, losing every later edit, including other people's, and the comments added since.
   - `{ "action": "notion_notion-upload-skill", "resource": "*", "effect": "deny" }`: it replaces a Skill page's title,
     Description, body and Files.
   - `{ "action": "notion_notion-spawn-session", "resource": "*", "effect": "deny" }`: it starts a Notion Custom Agent
     that acts in the workspace with your permissions and spends AI credits.
   - `{ "action": "notion_notion-send-message-to-session", "resource": "*", "effect": "deny" }`: it sends a message to
     that agent.
   - `{ "action": "notion_notion-stop-session", "resource": "*", "effect": "deny" }`: it stops that agent, ending work
     someone may be waiting on.
   - `{ "action": "notion_notion-calendar-cancel-events", "resource": "*", "effect": "deny" }`: it removes an event from
     other people's calendars and may notify them.

   To turn one on for an agent, add a rule that makes it **ask** to that agent's own `permissions`, which come after the
   plugin's block. For the build agent:

   ```json
   {
     "agents": {
       "build": {
         "permissions": [{ "action": "notion_notion-delete-pages", "resource": "*", "effect": "ask" }]
       }
     }
   }
   ```

   Not in the top-level `permissions`: a top-level rule reaches every agent, Explore included. Never make a denied tool
   `allow`, and don't answer "Always allow" for it: that would save an allow for every agent in the project.

So reads run, and the 23 write tools ask before they run. Each change reaches people: everyone with access to the page or
database; colleagues a comment mentions, who are notified; the people whose access changes when a page moves; and the
attendees a calendar event may notify. `notion-write` says so before each call.

**A permission rule matches a tool's name, not its arguments.** `notion-update-page` is the commonest change and stays at
`ask`, although it also carries `replace_content`, which replaces a page's whole body. No rule can tell the two apart, so
the guard is `notion-write`'s: edit through `update_content` with text copied from a fetch, and never send
`replace_content` unless the user explicitly asked to replace the whole page. Read the input shown in the permission
prompt before you answer yes. To remove that path entirely, deny the tool, in your own `permissions` or an agent's:

```json
{ "permissions": [{ "action": "notion_notion-update-page", "resource": "*", "effect": "deny" }] }
```

The tool names are double-prefixed, because Notion's own names start `notion-`: `notion-search` becomes
`notion_notion-search`, and in Code Mode `tools["notion"]["notion-search"]`.

Everything that comes later than these rules still wins: an agent's own stricter rules (Explore cannot use Notion), your
`permissions` in `opencode.json`, and your saved "Always allow" answers. In an unattended run such as `opencode run`, a
tool that asks is refused.

Agents that exist only in your own config, and agents added by plugins that load later, are created after the plugin adds
its rules, so Notion tools run there without asking. `/notion-status` and `/notion` name those agents and show the default
rules to put first in each one's own `permissions`. Do not put them in the top-level `permissions`, which would loosen
Explore. [Configuration](https://github.com/joe-broadhead/opencode-notion/blob/HEAD/docs/configuration.md#permissions) has
a worked example and permission recipes.

## Configure

Set options with the object form of the plugin entry:

```json
{
  "plugins": [{ "package": "@joe-broadhead/opencode-notion", "options": { "allowUntestedHost": true } }]
}
```

| Option | Values | Default | Effect |
| --- | --- | --- | --- |
| `allowUntestedHost` | `true` or `false` | `false` | Starts on an OpenCode version outside `>=2.2.3 <2.3.0`, with a warning in status. |

[docs/configuration.md](https://github.com/joe-broadhead/opencode-notion/blob/HEAD/docs/configuration.md) has the details,
including your own `mcp.servers.notion` entry, the MCP token alternative, permission recipes and every error.

## Organisation rollout

OpenCode registers itself with Notion's sign-in server through its client metadata document, so there is no client ID or
secret to distribute. Put the plugin entry in the system config: `/Library/Application Support/opencode/opencode.json` on
macOS, or `/etc/opencode/opencode.json` on Linux. This example also turns off deleting pages, for everyone:

```json
{
  "plugins": ["@joe-broadhead/opencode-notion"],
  "permissions": [{ "action": "notion_notion-delete-pages", "resource": "*", "effect": "deny" }]
}
```

Members then only sign in: run `/connect` and choose Notion, then press `o` or Enter to open the link.

Notion's own controls stay in Notion: `Settings` → `Connections` → `Permissions` → **AI apps**, where an Enterprise
workspace can restrict its members to an approved list, and the Admin API, which can list and revoke members' MCP
connections. A Business or Enterprise workspace owner can also create an MCP token for a headless machine; the
configuration guide shows that entry.

## Troubleshooting

Run `/notion-status` first. Its last line is the next step.

| Status or error | What to do |
| --- | --- |
| Connection: sign-in required | Run `/connect` and choose Notion, then press `o` or Enter to open the link. In a terminal, `opencode mcp auth notion` opens it automatically. |
| Connection: sign-in required, and it worked earlier | Its grant may have been revoked: Notion revokes the whole grant when a refresh token is reused, which two OpenCode processes sharing one sign-in do. Run `opencode mcp logout notion`, close the other OpenCode process, then sign in once. |
| Connection: connecting | Wait a few seconds, then run `/notion-status` again. |
| Connection: failed | Check your network, then run `/notion-status` again. With your own `mcp.servers.notion` that carries an MCP token, check the token in its headers. |
| Connection: disabled | Enable `notion` in `/mcps`, or remove `"disabled": true` from `mcp.servers.notion` in `opencode.json`. |
| Connection: not configured | An organisation policy (`mcp.use`) or another plugin removes the `notion` server. Ask your administrator, then restart OpenCode. |
| Connection: conflict | Your config has an `mcp.servers.notion` entry with a URL other than `https://mcp.notion.com/mcp`. Point it at `https://mcp.notion.com/mcp` or remove it, then restart OpenCode. |
| Notion refuses the sign-in | Guests cannot connect. An Enterprise workspace may restrict AI apps to an approved list: ask an admin to add OpenCode under `Settings` → `Connections` → `Permissions` → **AI apps**. |
| Tools: none listed yet | Notion connected moments ago and is still listing its tools. Run `/notion-status` again, or press `r` in the dialog, in a few seconds. |
| Tools: 0 available | Notion lists no tools for this connection. Ask an admin whether AI apps are restricted to an approved list, then sign in again. |
| Tools: off by default | The tools the default rules deny, listed by name. See [Permissions](#permissions) to turn one on, as an ask. |
| Tools: unknown | Notion added tools the plugin does not know yet. They ask before they run. A known tool missing from the count is normal: a plan or an admin-chosen tool list may leave it out. |
| Access: default rules missing or not added | Some agents lack the default rules (see the agents row), or OpenCode could not add them (see the OpenCode row). Follow the next step. |
| Account: not read yet | Nothing is wrong: the row fills in after the first `notion-get-self` call the model or a script makes. The plugin makes no call of its own. |
| A tool says it needs an upgrade | That tool needs a higher plan, or Notion AI: connected-source search and SQL across data sources need Business or Enterprise with Notion AI, and meeting notes need Business with Notion AI. |
| An edit did nothing | Read the result's `warnings`. The old text must match the page exactly once; fetch the page again and copy it. |
| A page came back truncated | The page has more blocks than one answer carries. Fetch the subtrees it names. |
| A download link expired | Notion's file URLs last minutes. Ask again. |
| Rate limited | Wait the `retry_after_seconds` Notion reports, and make fewer calls at once. A Free, Plus or Education workspace allows 180 requests a minute per connection; Business and Enterprise 600. |
| Agents without default rules | Put the default rules shown by `/notion-status` first in each listed agent's own permissions, in `opencode.json` or the agent's Markdown file, followed by your top-level rules for Notion tools. |
| OpenCode: untested | OpenCode is not 2.2.3, 2.2.4 or 2.2.5. Inside `>=2.2.3 <2.3.0` the plugin runs normally; outside it, it runs only because `allowUntestedHost` is set. If Notion misbehaves, use a tested release. |
| Signed in to the wrong workspace | Run `opencode mcp logout notion` (or remove the account in `/connect` → Notion), then sign in again. |
| A Notion tool is refused in `opencode run` | Nobody could answer its prompt. A read runs if you add an `allow` rule for it to the agent's own `permissions`. A write needs an interactive session: this plugin documents no `allow` for one, and a saved one would run it unasked in every agent of the project. |
| A skill seems ignored, and status names a skill to rename or move | A skill of yours with the same id, such as `notion`, replaces the plugin's. Rename or move it. |
| `/notion` is missing | The plugin did not start. Run `/plugins` to see the error. |
| `OPTIONS_INVALID` | An option is unknown or has a wrong value. The message names the option and the accepted values. |
| `HOST_UNTESTED` | Your OpenCode is outside `>=2.2.3 <2.3.0`, so the plugin did not start. Use OpenCode `>=2.2.3 <2.3.0`, or set `"allowUntestedHost": true` to run anyway. |
| `STATUS_UNAVAILABLE` | The status could not be read, or the plugin is not running. Follow the next step in the message. |
| `SKILLS_INVALID` | A skill file in the package is missing or broken. Reinstall the plugin. |
| `SERVER_NOT_REGISTERED` | The plugin could not register the `notion` server. Restart OpenCode. |
| `RULES_NOT_ADDED` | The default permission rules could not be added, so Notion tools may run without asking. Restart OpenCode. |

A script's errors from the tools RPC have their own codes, listed in
[Scripting](https://github.com/joe-broadhead/opencode-notion/blob/HEAD/docs/scripting.md#errors).

## Known limits

- **The permission prompt is the only guard for a whole-page replacement.** A rule matches the tool name, not its
  arguments, so `notion-update-page` asks the same way for a property edit and for `replace_content`, which replaces the
  page's body. Read the input in the prompt before saying yes, or deny the tool as [Permissions](#permissions) shows.
- **The tool table comes from Notion's documentation.** Notion publishes no input schemas and names only three
  annotations, and this release has not been reconciled with a live tool list. A tool Notion adds, or changes to change
  data, can run here as a read until a release knows it. `CONTRIBUTING.md` has the check that reconciles the list.
- **One sign-in per workspace.** Notion rotates the refresh token on every use, and reusing one that has been rotated
  away revokes the whole grant. Two separate OpenCode processes on one credential can therefore revoke it for each
  other: run one OpenCode process per sign-in, or sign out and in again when one has revoked it. The sign-in also ends
  after 180 days, and after 30 days without a refresh.
- **Some tools need a plan.** A Free workspace cannot use connected-source search, meeting notes, SQL across data
  sources, comment editing, reactions, suggested edits or version history. The skill passes Notion's upgrade prompt on;
  it never retries.
- **A script's read can cross projects.** A script's session may belong to another directory than the OpenCode server
  answering it, and the read then runs under the serving location's agent rules; only a `deny` is refused in between. Run
  scripts in the project whose agent you mean. This is in the module shared with the other plugins, not in this one.
- **In Jelly, a tool Notion adds is not asked about.** Jelly applies each declared tool's effect and nothing else, so an
  undeclared tool, a write included, runs without asking until a release of this plugin declares it. A Jelly admin can set
  it to ask.

## Uninstall

Sign out while the plugin is still installed: once it is removed, OpenCode no longer knows the `notion` server, so
`opencode mcp logout notion` fails with `MCP server not found: notion` and the sign-in stays in OpenCode's credential
store.

1. Sign out: `opencode mcp logout notion`. Right after OpenCode starts or reloads, it can answer `MCP server not found:
   notion` for a few seconds; wait, then run it again.
2. Check: `opencode auth list` no longer lists **Notion**.
3. Remove the plugin: `opencode plugin remove @joe-broadhead/opencode-notion`, then `opencode reload`. `opencode mcp list`
   no longer lists `notion`.
4. Remove any Notion rules you copied into your agents' own `permissions`.

A workspace owner can also revoke the connection from Notion's connections screen, and an Enterprise admin can revoke it
through the Admin API.

## Links

- [Configuration](https://github.com/joe-broadhead/opencode-notion/blob/HEAD/docs/configuration.md)
- [Scripting](https://github.com/joe-broadhead/opencode-notion/blob/HEAD/docs/scripting.md)
- [In Jelly](https://github.com/joe-broadhead/opencode-notion/blob/HEAD/docs/jelly.md)
- [Architecture](https://github.com/joe-broadhead/opencode-notion/blob/HEAD/docs/architecture.md)
- [Contributing](https://github.com/joe-broadhead/opencode-notion/blob/HEAD/CONTRIBUTING.md)
- [Security](https://github.com/joe-broadhead/opencode-notion/blob/HEAD/SECURITY.md)
- [Changelog](https://github.com/joe-broadhead/opencode-notion/blob/HEAD/CHANGELOG.md)
- [MIT license](https://github.com/joe-broadhead/opencode-notion/blob/HEAD/LICENSE)
- [Notion's MCP server](https://developers.notion.com/guides/mcp/overview)
