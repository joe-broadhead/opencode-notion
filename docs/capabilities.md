# Capabilities

Every method, source, action and bus event the manifest declares.

<!-- generated:capabilities -->
### Methods

| Method | Class | Accounts | Operations |
|---|---|---|---|
| `status` | read | none | — |
| `probe` | read | optional | `notion-get-self` |
| `events_list` | read | optional | `notion-get-self`, `notion-search` |
| `mcp:notion-ai-search` | read | none | — |
| `mcp:notion-connector-search` | read | none | — |
| `mcp:notion-calendar-cancel-events` | delete | none | — |
| `mcp:notion-calendar-create-events` | send | none | — |
| `mcp:notion-calendar-list-calendar-resources` | read | none | — |
| `mcp:notion-calendar-list-calendars` | read | none | — |
| `mcp:notion-calendar-list-contacts` | read | none | — |
| `mcp:notion-calendar-list-coworkers-events` | read | none | — |
| `mcp:notion-calendar-list-events` | read | none | — |
| `mcp:notion-calendar-update-events` | send | none | — |
| `mcp:notion-complete-mcp-setup` | admin | none | — |
| `mcp:notion-convert-page-to-skill` | admin | none | — |
| `mcp:notion-convert-to-meetings-database` | write | none | — |
| `mcp:notion-create-attachment` | write | none | — |
| `mcp:notion-create-comment` | send | none | — |
| `mcp:notion-create-database` | write | none | — |
| `mcp:notion-create-file-upload` | write | none | — |
| `mcp:notion-create-folder` | write | none | — |
| `mcp:notion-create-meeting-note` | write | none | — |
| `mcp:notion-create-pages` | write | none | — |
| `mcp:notion-create-suggested-edit` | send | none | — |
| `mcp:notion-create-view` | write | none | — |
| `mcp:notion-delete-comment` | delete | none | — |
| `mcp:notion-delete-databases` | delete | none | — |
| `mcp:notion-delete-pages` | delete | none | — |
| `mcp:notion-download-attachment` | export | none | — |
| `mcp:notion-download-skill` | export | none | — |
| `mcp:notion-duplicate-page` | write | none | — |
| `mcp:notion-fetch` | read | none | — |
| `mcp:notion-get-async-task` | read | none | — |
| `mcp:notion-get-comments` | read | none | — |
| `mcp:notion-get-enabled-skills` | read | none | — |
| `mcp:notion-get-file-download-urls` | export | none | — |
| `mcp:notion-get-groups` | read | none | — |
| `mcp:notion-get-self` | read | none | — |
| `mcp:notion-get-session-status` | read | none | — |
| `mcp:notion-get-setup-guide` | read | none | — |
| `mcp:notion-get-sidebar-tabs` | read | none | — |
| `mcp:notion-get-suggested-edit` | read | none | — |
| `mcp:notion-get-teams` | read | none | — |
| `mcp:notion-get-tool-access` | read | none | — |
| `mcp:notion-get-users` | read | none | — |
| `mcp:notion-get-version-changes` | read | none | — |
| `mcp:notion-link-meeting-note-to-calendar-event` | write | none | — |
| `mcp:notion-list-favorite-pages` | read | none | — |
| `mcp:notion-list-page-backlinks` | read | none | — |
| `mcp:notion-list-private-pages` | read | none | — |
| `mcp:notion-list-recent-pages` | read | none | — |
| `mcp:notion-list-session-events` | read | none | — |
| `mcp:notion-list-shared-pages` | read | none | — |
| `mcp:notion-memory-search` | read | none | — |
| `mcp:notion-move-pages` | share | none | — |
| `mcp:notion-query-data-sources` | read | none | — |
| `mcp:notion-query-meeting-notes` | read | none | — |
| `mcp:notion-query-multiple-data-sources` | read | none | — |
| `mcp:notion-query-sessions` | read | none | — |
| `mcp:notion-read-session-event` | read | none | — |
| `mcp:notion-resolve-suggested-edit` | write | none | — |
| `mcp:notion-restore-pages` | write | none | — |
| `mcp:notion-restore-version` | delete | none | — |
| `mcp:notion-search` | read | none | — |
| `mcp:notion-search-agents` | read | none | — |
| `mcp:notion-search-sessions` | read | none | — |
| `mcp:notion-send-message-to-session` | send | none | — |
| `mcp:notion-set-comment-reaction` | send | none | — |
| `mcp:notion-set-discussion-resolved` | write | none | — |
| `mcp:notion-spawn-session` | admin | none | — |
| `mcp:notion-stop-session` | admin | none | — |
| `mcp:notion-update-comment` | send | none | — |
| `mcp:notion-update-data-source` | write | none | — |
| `mcp:notion-update-folder` | write | none | — |
| `mcp:notion-update-page` | write | none | — |
| `mcp:notion-update-page-favorites` | write | none | — |
| `mcp:notion-update-sidebar-tabs` | write | none | — |
| `mcp:notion-update-skill-settings` | admin | none | — |
| `mcp:notion-update-view` | write | none | — |
| `mcp:notion-upload-skill` | admin | none | — |
| `mcp:notion-view-version` | read | none | — |
| `mcp:notion-wait-session` | read | none | — |

### Sources

| Source | Kind | Reads or output | Method | Cost |
|---|---|---|---|---|
| `notion.pages` | events | `doc` | `events_list` | free |

### Actions

None.

### Bus events

`rpc.notion.account`
<!-- /generated:capabilities -->

## Notes

`status` answers with the plugin's name, version, host range, state, one entry per alias, the agents that lack the
generated access rules, and one next step. It takes no account and makes no provider call. The `/notion` command shows
the same answer.

`probe` reads `notion-get-self` through one alias's MCP server and answers the signed-in owner and the workspace as an
organization, with `trust: "untrusted"`. It reads no page, database or comment.

`events_list` reads `notion.pages`: the pages and databases the account edited or created, by their last edit. It
searches with an empty query, `sort: "last_edited"`, a last-edited date range and one author filter
(`edited_by_user_ids` or `created_by_user_ids`, each `"me"`), walks once with each filter and lists the union once per
page. Notion applies that sort and those filters only on Business and Enterprise workspaces; when a notice says an
option was dropped, the read is refused with `UNAVAILABLE` rather than listing pages in another order.

Each event is one page at one edit time: `external_id` is the page id and that time, `thread` is the page id, `kind` is
`doc`, `actors` is empty because search names no editor, `text` is empty because no content is read, and `url` is kept
only on `app.notion.com`, `notion.so` or `www.notion.so`, without its query or fragment. An edit is listed ten minutes
after its minute ends, so search's index has caught up. A 50-result search that fills a day leaves a hole: the page
carries `gap: { reason: "window-truncated", since }` once, and the next page moves past it. The cursor is bound to the
plugin, the source and the account alias, so another alias's cursor is `CURSOR_INVALID`.

Every `mcp:<tool>` row is a pass-through tool of Notion's own MCP server. The plugin neither registers nor proxies it:
OpenCode names it `<server>_<tool>`, and the alias selects the server. All of them take no `account`; use the server
name, or sign in with the account whose tools you want. `notion-connector-search` searches the sources connected in
Notion, not Notion pages, so it asks even at `all`.

No action is declared. Every write is one of Notion's pass-through tools, so the plugin has no preview or commit of its
own; the vendor's server and OpenCode's rules own the call.
