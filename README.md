# Notion for OpenCode

Search, read and edit your Notion workspace's pages, databases and comments from OpenCode, through Notion's official
MCP server.

Every tool is allowed by default. A change, a delete or a Custom Agent session runs without a prompt unless you restrict
it, and [Permissions](#permissions) shows the one option that does.

Unofficial; not affiliated with Notion.

## Requirements

- OpenCode `>=2.2.3 <2.3.0`, tested on 2.2.3, 2.2.4, 2.2.5 and 2.2.6. Outside that range the plugin does not start, unless
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
- The 39 read, 23 write and 9 destructive tools, and their classes, come from Notion's own documentation, which gives no
  input schemas and names only three annotations: treat a class as Notion's description of the tool, not as its
  annotation. A tool Notion adds is allowed at once under `access: "all"`, and counted as unknown until a release knows
  it.

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
Notion's sign-in page in your browser, sign in, and choose the workspace to connect. The plugin asks Notion for its one
scope, `default`, so there is no access level to choose; the permission rules below narrow what the model may do. No
integration token is needed for the browser sign-in; a headless machine can use an MCP token, as [Configure](#configure)
shows.

From a terminal, run `opencode mcp auth notion` instead; it opens the link automatically. `/mcps` also offers the same
sign-in. Run it from the project folder where the plugin is installed, or remove the account in `/connect` → **Notion**. If it answers `MCP server not found: notion`, OpenCode is still opening that folder: wait a few seconds and run it again.

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

A script or a cron job can call every known Notion tool with no model, through `opencode api`. It runs as a session and
its agent, under that agent's permission rules and the session's own, and gets the same default: every method runs unless
the agent restricts. A session on an agent with `access: "ask-changes"` or `read-only` needs an explicit `allow` for the
method in the session's or the agent's rules. An `ask` is refused before anything reaches Notion, and a saved "Always
allow" does not authorise a script.

```sh
opencode api post /api/rpc/notion.workspace.tools/notion-search \
  -H "x-opencode-directory:$PWD" \
  -d '{"input":{"sessionID":"ses_…","input":{}}}'
```

See [Scripting](https://github.com/joe-broadhead/opencode-notion/blob/HEAD/docs/scripting.md).

## Permissions

**Every tool is allowed by default.** The plugin adds one block to every agent, right after the agent's base rule that
allows everything, and that block allows Notion's tools: reads, writes, the nine that delete or replace a page, and the
Custom Agent sessions alike. An agent can therefore create, update or move a page, comment, change a database, upload a
Skill, start a Notion agent or cancel an event without a prompt. `/notion` and `/notion-status` show the block, the
access value and the tools involved.

There are three ways to restrict it.

### 1. The `access` option

```json
{
  "plugins": [
    { "package": "@joe-broadhead/opencode-notion", "options": { "access": "ask-changes" } }
  ]
}
```

| `access` | What runs |
| --- | --- |
| `all` (the default) | every Notion tool runs without a prompt |
| `ask-changes` | a read runs; every other tool asks, including one Notion adds later |
| `read-only` | a read runs; every other tool is denied, and hidden from the model |

The block is generated from the tool table and the value, so `/notion` always shows what is in force. The three
blocks:

#### `all` (the default)

The plugin adds these rules for `access: "all"`:

```json
[
    { "action": "notion_*", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-ai-search", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-calendar-list-calendar-resources", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-calendar-list-calendars", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-calendar-list-contacts", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-calendar-list-coworkers-events", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-calendar-list-events", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-connector-search", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-download-attachment", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-download-skill", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-fetch", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-get-async-task", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-get-comments", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-get-enabled-skills", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-get-file-download-urls", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-get-groups", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-get-self", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-get-session-status", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-get-suggested-edit", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-get-teams", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-get-tool-access", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-get-users", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-get-version-changes", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-list-favorite-pages", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-list-page-backlinks", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-list-private-pages", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-list-recent-pages", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-list-session-events", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-list-shared-pages", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-memory-search", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-query-data-sources", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-query-meeting-notes", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-query-multiple-data-sources", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-query-sessions", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-read-session-event", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-search", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-search-agents", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-search-sessions", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-view-version", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-wait-session", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-calendar-create-events", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-calendar-update-events", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-convert-page-to-skill", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-create-attachment", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-create-comment", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-create-database", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-create-file-upload", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-create-folder", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-create-pages", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-create-suggested-edit", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-create-view", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-duplicate-page", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-move-pages", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-resolve-suggested-edit", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-restore-pages", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-set-comment-reaction", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-set-discussion-resolved", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-update-comment", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-update-data-source", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-update-enabled-skills", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-update-folder", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-update-page", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-update-view", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-calendar-cancel-events", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-delete-comment", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-delete-databases", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-delete-pages", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-restore-version", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-send-message-to-session", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-spawn-session", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-stop-session", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-upload-skill", "resource": "*", "effect": "allow" }
]
```

#### `ask-changes`

The plugin adds these rules for `access: "ask-changes"`:

```json
[
    { "action": "notion_*", "resource": "*", "effect": "ask" },
    { "action": "notion_notion-ai-search", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-calendar-list-calendar-resources", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-calendar-list-calendars", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-calendar-list-contacts", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-calendar-list-coworkers-events", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-calendar-list-events", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-connector-search", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-download-attachment", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-download-skill", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-fetch", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-get-async-task", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-get-comments", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-get-enabled-skills", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-get-file-download-urls", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-get-groups", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-get-self", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-get-session-status", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-get-suggested-edit", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-get-teams", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-get-tool-access", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-get-users", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-get-version-changes", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-list-favorite-pages", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-list-page-backlinks", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-list-private-pages", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-list-recent-pages", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-list-session-events", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-list-shared-pages", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-memory-search", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-query-data-sources", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-query-meeting-notes", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-query-multiple-data-sources", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-query-sessions", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-read-session-event", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-search", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-search-agents", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-search-sessions", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-view-version", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-wait-session", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-calendar-create-events", "resource": "*", "effect": "ask" },
    { "action": "notion_notion-calendar-update-events", "resource": "*", "effect": "ask" },
    { "action": "notion_notion-convert-page-to-skill", "resource": "*", "effect": "ask" },
    { "action": "notion_notion-create-attachment", "resource": "*", "effect": "ask" },
    { "action": "notion_notion-create-comment", "resource": "*", "effect": "ask" },
    { "action": "notion_notion-create-database", "resource": "*", "effect": "ask" },
    { "action": "notion_notion-create-file-upload", "resource": "*", "effect": "ask" },
    { "action": "notion_notion-create-folder", "resource": "*", "effect": "ask" },
    { "action": "notion_notion-create-pages", "resource": "*", "effect": "ask" },
    { "action": "notion_notion-create-suggested-edit", "resource": "*", "effect": "ask" },
    { "action": "notion_notion-create-view", "resource": "*", "effect": "ask" },
    { "action": "notion_notion-duplicate-page", "resource": "*", "effect": "ask" },
    { "action": "notion_notion-move-pages", "resource": "*", "effect": "ask" },
    { "action": "notion_notion-resolve-suggested-edit", "resource": "*", "effect": "ask" },
    { "action": "notion_notion-restore-pages", "resource": "*", "effect": "ask" },
    { "action": "notion_notion-set-comment-reaction", "resource": "*", "effect": "ask" },
    { "action": "notion_notion-set-discussion-resolved", "resource": "*", "effect": "ask" },
    { "action": "notion_notion-update-comment", "resource": "*", "effect": "ask" },
    { "action": "notion_notion-update-data-source", "resource": "*", "effect": "ask" },
    { "action": "notion_notion-update-enabled-skills", "resource": "*", "effect": "ask" },
    { "action": "notion_notion-update-folder", "resource": "*", "effect": "ask" },
    { "action": "notion_notion-update-page", "resource": "*", "effect": "ask" },
    { "action": "notion_notion-update-view", "resource": "*", "effect": "ask" },
    { "action": "notion_notion-calendar-cancel-events", "resource": "*", "effect": "ask" },
    { "action": "notion_notion-delete-comment", "resource": "*", "effect": "ask" },
    { "action": "notion_notion-delete-databases", "resource": "*", "effect": "ask" },
    { "action": "notion_notion-delete-pages", "resource": "*", "effect": "ask" },
    { "action": "notion_notion-restore-version", "resource": "*", "effect": "ask" },
    { "action": "notion_notion-send-message-to-session", "resource": "*", "effect": "ask" },
    { "action": "notion_notion-spawn-session", "resource": "*", "effect": "ask" },
    { "action": "notion_notion-stop-session", "resource": "*", "effect": "ask" },
    { "action": "notion_notion-upload-skill", "resource": "*", "effect": "ask" }
]
```

#### `read-only`

The plugin adds these rules for `access: "read-only"`:

```json
[
    { "action": "notion_*", "resource": "*", "effect": "deny" },
    { "action": "notion_notion-ai-search", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-calendar-list-calendar-resources", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-calendar-list-calendars", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-calendar-list-contacts", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-calendar-list-coworkers-events", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-calendar-list-events", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-connector-search", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-download-attachment", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-download-skill", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-fetch", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-get-async-task", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-get-comments", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-get-enabled-skills", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-get-file-download-urls", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-get-groups", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-get-self", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-get-session-status", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-get-suggested-edit", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-get-teams", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-get-tool-access", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-get-users", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-get-version-changes", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-list-favorite-pages", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-list-page-backlinks", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-list-private-pages", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-list-recent-pages", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-list-session-events", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-list-shared-pages", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-memory-search", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-query-data-sources", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-query-meeting-notes", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-query-multiple-data-sources", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-query-sessions", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-read-session-event", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-search", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-search-agents", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-search-sessions", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-view-version", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-wait-session", "resource": "*", "effect": "allow" },
    { "action": "notion_notion-calendar-create-events", "resource": "*", "effect": "deny" },
    { "action": "notion_notion-calendar-update-events", "resource": "*", "effect": "deny" },
    { "action": "notion_notion-convert-page-to-skill", "resource": "*", "effect": "deny" },
    { "action": "notion_notion-create-attachment", "resource": "*", "effect": "deny" },
    { "action": "notion_notion-create-comment", "resource": "*", "effect": "deny" },
    { "action": "notion_notion-create-database", "resource": "*", "effect": "deny" },
    { "action": "notion_notion-create-file-upload", "resource": "*", "effect": "deny" },
    { "action": "notion_notion-create-folder", "resource": "*", "effect": "deny" },
    { "action": "notion_notion-create-pages", "resource": "*", "effect": "deny" },
    { "action": "notion_notion-create-suggested-edit", "resource": "*", "effect": "deny" },
    { "action": "notion_notion-create-view", "resource": "*", "effect": "deny" },
    { "action": "notion_notion-duplicate-page", "resource": "*", "effect": "deny" },
    { "action": "notion_notion-move-pages", "resource": "*", "effect": "deny" },
    { "action": "notion_notion-resolve-suggested-edit", "resource": "*", "effect": "deny" },
    { "action": "notion_notion-restore-pages", "resource": "*", "effect": "deny" },
    { "action": "notion_notion-set-comment-reaction", "resource": "*", "effect": "deny" },
    { "action": "notion_notion-set-discussion-resolved", "resource": "*", "effect": "deny" },
    { "action": "notion_notion-update-comment", "resource": "*", "effect": "deny" },
    { "action": "notion_notion-update-data-source", "resource": "*", "effect": "deny" },
    { "action": "notion_notion-update-enabled-skills", "resource": "*", "effect": "deny" },
    { "action": "notion_notion-update-folder", "resource": "*", "effect": "deny" },
    { "action": "notion_notion-update-page", "resource": "*", "effect": "deny" },
    { "action": "notion_notion-update-view", "resource": "*", "effect": "deny" },
    { "action": "notion_notion-calendar-cancel-events", "resource": "*", "effect": "deny" },
    { "action": "notion_notion-delete-comment", "resource": "*", "effect": "deny" },
    { "action": "notion_notion-delete-databases", "resource": "*", "effect": "deny" },
    { "action": "notion_notion-delete-pages", "resource": "*", "effect": "deny" },
    { "action": "notion_notion-restore-version", "resource": "*", "effect": "deny" },
    { "action": "notion_notion-send-message-to-session", "resource": "*", "effect": "deny" },
    { "action": "notion_notion-spawn-session", "resource": "*", "effect": "deny" },
    { "action": "notion_notion-stop-session", "resource": "*", "effect": "deny" },
    { "action": "notion_notion-upload-skill", "resource": "*", "effect": "deny" }
]
```

The tool names are double-prefixed, because Notion's own names start `notion-`: `notion-search` becomes
`notion_notion-search`, and in Code Mode `tools["notion"]["notion-search"]`.

### 2. An agent's own rules

A rule in an agent's own `permissions` comes after the plugin's block, so it wins for that agent. A read-only agent
that keeps Notion's reads and asks for one change:

```json
{
  "agents": {
    "build": {
      "permissions": [
        { "action": "notion_*", "resource": "*", "effect": "ask" },
        { "action": "notion_notion-search", "resource": "*", "effect": "allow" },
        { "action": "notion_notion-fetch", "resource": "*", "effect": "allow" },
        { "action": "notion_notion-create-comment", "resource": "*", "effect": "ask" }
      ]
    }
  }
}
```

### 3. A per-tool rule

Every action is `notion_` followed by the tool's name. A later rule wins, so this denies one tool in the top-level
`permissions`, for every agent:

```json
{
  "permissions": [
    { "action": "notion_notion-delete-pages", "resource": "*", "effect": "deny" }
  ]
}
```

The nine destructive tools, and why they deserve their own sentence:

- `notion_notion-delete-pages`, `notion_notion-delete-databases` and `notion_notion-delete-comment` trash something
  everyone with access can see.
- `notion_notion-restore-version` replaces a whole page with a past version, losing every later edit, including other
  people's, and the comments added since.
- `notion_notion-upload-skill` replaces a Skill page's title, Description, body and Files.
- `notion_notion-spawn-session`, `notion_notion-send-message-to-session` and `notion_notion-stop-session` start, drive or
  stop a Notion Custom Agent that acts in the workspace with your permissions and spends AI credits.
- `notion_notion-calendar-cancel-events` removes an event from other people's calendars and may notify them.

### What each change reaches

Say what a change does and whom it reaches before you make it. Each change reaches people: everyone with access to the
page or database; colleagues a comment mentions, who are notified; the people whose access changes when a page moves;
and the attendees a calendar event may notify. `notion-write` says so before each call.

**A permission rule matches a tool's name, not its arguments.** `notion-update-page` is the commonest change, and it also
carries `replace_content`, which replaces a page's whole body. No rule can tell the two apart, so the guard is
`notion-write`'s: edit through `update_content` with text copied from a fetch, and never send `replace_content` unless
the user explicitly asked to replace the whole page. With `ask-changes` or `read-only` a rule cannot see the argument
either, so read the input shown in the prompt before you answer yes, or deny the tool entirely:

```json
{ "permissions": [{ "action": "notion_notion-update-page", "resource": "*", "effect": "deny" }] }
```

Everything that comes later than these rules still wins: an agent's own stricter rules (Explore cannot use Notion),
your `permissions` in `opencode.json`, and your saved "Always allow" answers. A saved "Always allow" beats an `ask` but
never a `deny`. In an unattended run such as `opencode run`, a tool that asks is refused.

Agents that exist only in your own config, and agents added by plugins that load later, are created after the plugin
adds its rules, so they get no block. With `access: "all"` that changes nothing; with `ask-changes` or `read-only` they
stay unrestricted, and `/notion-status` and `/notion` name them with the block to put first in each one's own
`permissions`. Do not put an `ask` or an `allow` in the top-level `permissions`, which would reach every agent, Explore
included. [Configuration](https://github.com/joe-broadhead/opencode-notion/blob/HEAD/docs/configuration.md#permissions)
has a worked example and permission recipes.

## Configure

Set options with the object form of the plugin entry:

```json
{
  "plugins": [{ "package": "@joe-broadhead/opencode-notion", "options": { "allowUntestedHost": true } }]
}
```

| Option | Values | Default | Effect |
| --- | --- | --- | --- |
| `access` | `"all"`, `"ask-changes"` or `"read-only"` | `"all"` | How much the default rules restrict; see [Permissions](#permissions). |
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
| Connection: sign-in required | Run `/connect` and choose Notion, then press `o` or Enter to open the link. In a terminal, `opencode mcp auth notion` opens it automatically. Run it from the project folder where the plugin is installed, or remove the account in `/connect` → **Notion**. If it answers `MCP server not found: notion`, OpenCode is still opening that folder: wait a few seconds and run it again. |
| Connection: sign-in required, and it worked earlier | Its grant may have been revoked: Notion revokes the whole grant when a refresh token is reused, which two OpenCode processes sharing one sign-in do. Run `opencode mcp logout notion`, close the other OpenCode process, then sign in once. Run it from the project folder where the plugin is installed, or remove the account in `/connect` → **Notion**. If it answers `MCP server not found: notion`, OpenCode is still opening that folder: wait a few seconds and run it again. |
| Connection: connecting | Wait a few seconds, then run `/notion-status` again. |
| Connection: failed | Check your network, then run `/notion-status` again. With your own `mcp.servers.notion` that carries an MCP token, check the token in its headers. |
| Connection: disabled | Enable `notion` in `/mcps`, or remove `"disabled": true` from `mcp.servers.notion` in `opencode.json`. |
| Connection: not configured | An organisation policy (`mcp.use`) or another plugin removes the `notion` server. Ask your administrator, then restart OpenCode. |
| Connection: conflict | Your config has an `mcp.servers.notion` entry with a URL other than `https://mcp.notion.com/mcp`. Point it at `https://mcp.notion.com/mcp` or remove it, then restart OpenCode. |
| Notion refuses the sign-in | Guests cannot connect. An Enterprise workspace may restrict AI apps to an approved list: ask an admin to add OpenCode under `Settings` → `Connections` → `Permissions` → **AI apps**. |
| Tools: none listed yet | Notion connected moments ago and is still listing its tools. Run `/notion-status` again, or press `r` in the dialog, in a few seconds. |
| Tools: 0 available | Notion lists no tools for this connection. Ask an admin whether AI apps are restricted to an approved list, then sign in again. |
| Tools: allowed like everything else, ask or denied | The listed tools are the destructive class. What happens to them follows the `access` value. See [Permissions](#permissions). |
| Tools: unknown | Notion added tools the plugin does not know yet. Under `access: "all"` they run at once, `ask-changes` asks, and `read-only` denies them. A known tool missing from the count is normal: a plan or an admin-chosen tool list may leave it out. |
| Access: default rules missing or not added | Some agents lack the default rules (see the agents row), or OpenCode could not add them (see the OpenCode row). Follow the next step. |
| Account: not read yet | Nothing is wrong: the row fills in after the first `notion-get-self` call the model or a script makes. The plugin makes no call of its own. |
| A tool says it needs an upgrade | That tool needs a higher plan, or Notion AI: connected-source search and SQL across data sources need Business or Enterprise with Notion AI, and meeting notes need Business with Notion AI. |
| An edit did nothing | Read the result's `warnings`. The old text must match the page exactly once; fetch the page again and copy it. |
| A page came back truncated | The page has more blocks than one answer carries. Fetch the subtrees it names. |
| A download link expired | Notion's file URLs last minutes. Ask again. |
| Rate limited | Wait the `retry_after_seconds` Notion reports, and make fewer calls at once. A Free, Plus or Education workspace allows 180 requests a minute per connection; Business and Enterprise 600. |
| Agents without default rules | Put the default rules shown by `/notion-status` first in each listed agent's own permissions, in `opencode.json` or the agent's Markdown file, followed by your top-level rules for Notion tools. |
| OpenCode: untested | OpenCode is not 2.2.3, 2.2.4, 2.2.5 or 2.2.6. Inside `>=2.2.3 <2.3.0` the plugin runs normally; outside it, it runs only because `allowUntestedHost` is set. If Notion misbehaves, use a tested release. |
| Signed in to the wrong workspace | Run `opencode mcp logout notion` (or remove the account in `/connect` → Notion), then sign in again. Run it from the project folder where the plugin is installed, or remove the account in `/connect` → **Notion**. If it answers `MCP server not found: notion`, OpenCode is still opening that folder: wait a few seconds and run it again. |
| A Notion tool is refused in `opencode run` | Nobody could answer its prompt. Add an `allow` rule for that tool to the agent's own `permissions`, or use `access: "all"`. |
| A skill seems ignored, and status names a skill to rename or move | A skill of yours with the same id, such as `notion`, replaces the plugin's. Rename or move it. |
| `/notion` is missing | The plugin did not start. Run `/plugins` to see the error. |
| `OPTIONS_INVALID` | An option is unknown or has a wrong value. The message names the option and the accepted values. |
| `HOST_UNTESTED` | Your OpenCode is outside `>=2.2.3 <2.3.0`, so the plugin did not start. Use OpenCode `>=2.2.3 <2.3.0`, or set `"allowUntestedHost": true` to run anyway. |
| `STATUS_UNAVAILABLE` | The status could not be read, or the plugin is not running. Follow the next step in the message. |
| `SKILLS_INVALID` | A skill file in the package is missing or broken. Reinstall the plugin. |
| `SERVER_NOT_REGISTERED` | The plugin could not register the `notion` server. Restart OpenCode. |
| `RULES_NOT_ADDED` | The default permission rules could not be added. Restart OpenCode. |

A script's errors from the tools RPC have their own codes, listed in
[Scripting](https://github.com/joe-broadhead/opencode-notion/blob/HEAD/docs/scripting.md#errors).

## Errors

Every error reads `CODE: What happened. Next step: What to do.` The codes are the plugin's own one table. `setup` and
`status` codes come from the plugin; `rpc` codes are a refusal from the tools RPC for scripts, which
[Scripting](https://github.com/joe-broadhead/opencode-notion/blob/HEAD/docs/scripting.md#errors) explains in detail.

| Code | Surface | When |
| --- | --- | --- |
| `HOST_UNTESTED` | setup | OpenCode is outside the supported range and `allowUntestedHost` is not set. |
| `OPTIONS_INVALID` | setup | An option is unknown or has a wrong value. |
| `SKILLS_INVALID` | setup | A skill file is missing or broken; the plugin still starts. |
| `SERVER_NOT_REGISTERED` | setup | The `notion` server could not be registered. |
| `RULES_NOT_ADDED` | setup | The default permission rules could not be added. |
| `STATUS_UNAVAILABLE` | status | The status could not be read, or the plugin is not running. |
| `SESSION_UNKNOWN` | rpc | The session does not exist in this location. |
| `SESSION_AGENT_REQUIRED` | rpc | The session names no agent, or one that does not exist. |
| `PERMISSION_DENIED` | rpc | The last matching rule is an `ask` or a `deny`; refused before dispatch. |
| `SERVER_CONFLICT` | rpc | `mcp.servers.notion` is defined at another URL. |
| `AUTH_REQUIRED` | rpc | The `notion` server needs a sign-in. |
| `CONNECTING` | rpc | The `notion` server is still connecting. |
| `CONNECTION_FAILED` | rpc | The `notion` server could not connect. |
| `DISABLED` | rpc | The `notion` server is disabled. |
| `NOT_REGISTERED` | rpc | The `notion` server is not registered. |
| `TOOL_UNAVAILABLE` | rpc | The server is connected but OpenCode does not list the tool. |
| `UPSTREAM_ERROR` | rpc | Notion answered with an error, such as an invalid input or a rate limit. |
| `CANCELLED` | rpc | The request was cancelled. |

The status RPC's own error is `unavailable`, with a next step, when the status cannot be read.

## Known limits

- **The permission prompt is the only guard for a whole-page replacement.** A rule matches the tool name, not its
  arguments, so `notion-update-page` asks the same way for a property edit and for `replace_content`, which replaces the
  page's body. Read the input in the prompt before saying yes, or deny the tool as [Permissions](#permissions) shows.
- **The tool table comes from Notion's documentation.** Notion publishes no input schemas and names only three
  annotations, so the tool classes and the parameter names the skills use come from its documentation too. A tool
  Notion adds is allowed at once and counted as unknown; a tool Notion changes to change data can run here as a read
  until a release knows it. `test/unit/notion-live-tools.json` is a raw `tools/list` response, and `npm run drift` is
  the check that reconciles the table with a saved one: replace the file and run `npm run drift -- --strict`.
  The table has not been checked against a signed-in server's tool list yet. `CONTRIBUTING.md` has the work.
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
  undeclared tool, a write included, runs with the plugin's own default. A Jelly admin can set it to ask.

## Uninstall

Sign out while the plugin is still installed: once it is removed, OpenCode no longer knows the `notion` server, so
`opencode mcp logout notion` fails with `MCP server not found: notion` and the sign-in stays in OpenCode's credential
store.

1. Sign out from the project folder where the plugin is installed: `opencode mcp logout notion`, or remove the account in
   `/connect` → **Notion**. If it answers `MCP server not found: notion`, OpenCode is still opening that folder: wait a
   few seconds and run it again.
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
