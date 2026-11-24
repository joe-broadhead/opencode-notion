# Configuration

Every option is optional. Install from a release tag; the first release on plugin-contract is v0.0.0 (phase 4b). The
smallest setup is one entry in `plugins`:

```json
{
  "plugins": [{ "package": "github:we-the-rebel-alliance/notion-plugin#v<version>" }]
}
```

To set options, use the object form:

```json
{
  "plugins": [{ "package": "github:we-the-rebel-alliance/notion-plugin#v<version>", "options": { "access": "ask-changes" } }]
}
```

## Options

### `access`

- Type: `"all"`, `"ask-changes"` or `"read-only"`.
- Default: `"all"`.

How much the default rules restrict. `all` allows every Notion tool; `ask-changes` allows a read and asks for every other
tool; `read-only` allows a read and denies every other tool, which also hides it from the model. The classes come from
`src/notion-tools.ts`, so the value decides a tool Notion adds later too. [Permissions](#permissions) has the three
generated blocks.

### `allowUntestedHost`

- Type: `true` or `false`.
- Default: `false`.

The plugin supports OpenCode `>=2.4.1 <2.5.0`, the range `opencode.host` in `package.json` declares, and every check runs
on 2.4.1, the tested release. Status shows the version, whether it is tested and the supported range in its `OpenCode`
row, for example `2.4.1 (tested; supported range >=2.4.1 <2.5.0)`.

- **A tested release:** the plugin starts.
- **Another release inside the range, such as 2.4.99:** the plugin starts too. Status marks the version `untested`, and
  the status RPC's `host.tested` is `false`. The next step is the same as on a tested release.
- **Outside the range, including 2.5.0, prereleases and development builds:** the plugin refuses to start, and `/plugins`
  shows:

  ```text
  HOST_UNTESTED: This plugin supports OpenCode >=2.4.1 <2.5.0, found 2.5.0. Next step: Use OpenCode >=2.4.1 <2.5.0, or set the plugin option "allowUntestedHost": true to run anyway.
  ```

- **Outside the range with `"allowUntestedHost": true`:** it starts anyway, and `/notion-status` and `/notion` show a
  warning.

There is no other option. To narrow what the model may do in Notion per agent or per tool, use permission rules; see
[Permissions](#permissions).

## Your own `mcp.servers.notion`

If your config defines no server named `notion`, the plugin registers one:

```json
{ "type": "remote", "url": "https://mcp.notion.com/mcp", "oauth": { "scope": "default" } }
```

The scope is pinned to `default`, the one scope a Notion sign-in needs. Notion's 401 names it, but its metadata also
advertises `ema_issuer:manage`, its enterprise-managed auth scope, and OpenCode falls back to every advertised scope when
a challenge names none: the pin keeps that fallback from ever asking for more. A pinned `oauth.client_id` or
`oauth.redirect_uri` would be different, and wrong: either stops OpenCode signing in with its client metadata document,
`https://opencode.ai/oauth/opencode/client.json`, which Notion advertises that it accepts. So there is no client ID to
set and nothing is registered. Notion's server signs in with OAuth; no integration token or API key is used.

To change anything else, define `mcp.servers.notion` yourself at Notion's URL. The plugin then **adopts** your entry
unchanged, and `/notion-status` shows "Connection: connected (…, your own mcp.servers.notion, used unchanged)". Keep the
`"scope": "default"` it carries: an entry without a scope gets the fallback described above. The permission rules and
skills still apply. Of your entry the plugin reads only its type, its URL and whether `oauth` is `false`; it never reads,
copies or reports its `headers`.

### An MCP token, for a headless machine

A Business or Enterprise workspace owner can create an MCP token in Notion's developer portal (**New MCP token**), and a
client can send it as a bearer token with no browser sign-in. Keep it in an environment variable, never in the file:

```json
{
  "mcp": {
    "servers": {
      "notion": {
        "type": "remote",
        "url": "https://mcp.notion.com/mcp",
        "oauth": false,
        "headers": { "Authorization": "Bearer {env:NOTION_MCP_TOKEN}" }
      }
    }
  }
}
```

The plugin adopts that entry unchanged, and `/notion-status` names it "your own mcp.servers.notion without OAuth". There
is no `/connect` sign-in for it, and the plugin never reads the token. If it stops working, status's next step asks you
to check the token.

### A conflict

The plugin compares origin and path, so a trailing slash or a query string still matches. Any other URL, or a local
command, is a **conflict**: the plugin leaves your entry alone, adds nothing, status shows "Connection: conflict", and
gives the next step:

```text
- Next step: Your OpenCode config defines mcp.servers.notion with https://notion-mcp.example.com/mcp, but the plugin uses https://mcp.notion.com/mcp. Point it at https://mcp.notion.com/mcp or remove it, then restart OpenCode.
```

## Permissions

**Every tool is allowed by default.** The plugin inserts one block after each agent's base `* * allow`, and the last
matching rule wins. The blocks are generated from `src/notion-tools.ts` and the `access` option; these are the blocks for
the three values.

`access: "all"`:

```json
[
  {
    "action": "notion_*",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-ai-search",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-calendar-list-calendar-resources",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-calendar-list-calendars",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-calendar-list-contacts",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-calendar-list-coworkers-events",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-calendar-list-events",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-connector-search",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-download-attachment",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-download-skill",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-fetch",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-get-async-task",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-get-comments",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-get-enabled-skills",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-get-file-download-urls",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-get-groups",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-get-self",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-get-session-status",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-get-setup-guide",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-get-sidebar-tabs",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-get-suggested-edit",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-get-teams",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-get-tool-access",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-get-users",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-get-version-changes",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-list-favorite-pages",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-list-page-backlinks",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-list-private-pages",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-list-recent-pages",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-list-session-events",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-list-shared-pages",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-memory-search",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-query-data-sources",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-query-meeting-notes",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-query-multiple-data-sources",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-query-sessions",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-read-session-event",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-search",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-search-agents",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-search-sessions",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-view-version",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-wait-session",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-calendar-create-events",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-calendar-update-events",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-complete-mcp-setup",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-convert-page-to-skill",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-convert-to-meetings-database",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-create-attachment",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-create-comment",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-create-database",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-create-file-upload",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-create-folder",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-create-meeting-note",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-create-pages",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-create-suggested-edit",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-create-view",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-duplicate-page",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-link-meeting-note-to-calendar-event",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-move-pages",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-resolve-suggested-edit",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-restore-pages",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-set-comment-reaction",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-set-discussion-resolved",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-update-comment",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-update-data-source",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-update-folder",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-update-page",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-update-page-favorites",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-update-sidebar-tabs",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-update-skill-settings",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-update-view",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-calendar-cancel-events",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-delete-comment",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-delete-databases",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-delete-pages",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-restore-version",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-send-message-to-session",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-spawn-session",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-stop-session",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-upload-skill",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_events_list",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_probe",
    "resource": "*",
    "effect": "allow"
  }
]
```

`access: "ask-changes"`:

```json
[
  {
    "action": "notion_*",
    "resource": "*",
    "effect": "ask"
  },
  {
    "action": "notion_notion-ai-search",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-calendar-list-calendar-resources",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-calendar-list-calendars",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-calendar-list-contacts",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-calendar-list-coworkers-events",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-calendar-list-events",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-connector-search",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-download-attachment",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-download-skill",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-fetch",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-get-async-task",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-get-comments",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-get-enabled-skills",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-get-file-download-urls",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-get-groups",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-get-self",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-get-session-status",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-get-setup-guide",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-get-sidebar-tabs",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-get-suggested-edit",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-get-teams",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-get-tool-access",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-get-users",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-get-version-changes",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-list-favorite-pages",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-list-page-backlinks",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-list-private-pages",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-list-recent-pages",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-list-session-events",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-list-shared-pages",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-memory-search",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-query-data-sources",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-query-meeting-notes",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-query-multiple-data-sources",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-query-sessions",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-read-session-event",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-search",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-search-agents",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-search-sessions",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-view-version",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-wait-session",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-calendar-create-events",
    "resource": "*",
    "effect": "ask"
  },
  {
    "action": "notion_notion-calendar-update-events",
    "resource": "*",
    "effect": "ask"
  },
  {
    "action": "notion_notion-complete-mcp-setup",
    "resource": "*",
    "effect": "ask"
  },
  {
    "action": "notion_notion-convert-page-to-skill",
    "resource": "*",
    "effect": "ask"
  },
  {
    "action": "notion_notion-convert-to-meetings-database",
    "resource": "*",
    "effect": "ask"
  },
  {
    "action": "notion_notion-create-attachment",
    "resource": "*",
    "effect": "ask"
  },
  {
    "action": "notion_notion-create-comment",
    "resource": "*",
    "effect": "ask"
  },
  {
    "action": "notion_notion-create-database",
    "resource": "*",
    "effect": "ask"
  },
  {
    "action": "notion_notion-create-file-upload",
    "resource": "*",
    "effect": "ask"
  },
  {
    "action": "notion_notion-create-folder",
    "resource": "*",
    "effect": "ask"
  },
  {
    "action": "notion_notion-create-meeting-note",
    "resource": "*",
    "effect": "ask"
  },
  {
    "action": "notion_notion-create-pages",
    "resource": "*",
    "effect": "ask"
  },
  {
    "action": "notion_notion-create-suggested-edit",
    "resource": "*",
    "effect": "ask"
  },
  {
    "action": "notion_notion-create-view",
    "resource": "*",
    "effect": "ask"
  },
  {
    "action": "notion_notion-duplicate-page",
    "resource": "*",
    "effect": "ask"
  },
  {
    "action": "notion_notion-link-meeting-note-to-calendar-event",
    "resource": "*",
    "effect": "ask"
  },
  {
    "action": "notion_notion-move-pages",
    "resource": "*",
    "effect": "ask"
  },
  {
    "action": "notion_notion-resolve-suggested-edit",
    "resource": "*",
    "effect": "ask"
  },
  {
    "action": "notion_notion-restore-pages",
    "resource": "*",
    "effect": "ask"
  },
  {
    "action": "notion_notion-set-comment-reaction",
    "resource": "*",
    "effect": "ask"
  },
  {
    "action": "notion_notion-set-discussion-resolved",
    "resource": "*",
    "effect": "ask"
  },
  {
    "action": "notion_notion-update-comment",
    "resource": "*",
    "effect": "ask"
  },
  {
    "action": "notion_notion-update-data-source",
    "resource": "*",
    "effect": "ask"
  },
  {
    "action": "notion_notion-update-folder",
    "resource": "*",
    "effect": "ask"
  },
  {
    "action": "notion_notion-update-page",
    "resource": "*",
    "effect": "ask"
  },
  {
    "action": "notion_notion-update-page-favorites",
    "resource": "*",
    "effect": "ask"
  },
  {
    "action": "notion_notion-update-sidebar-tabs",
    "resource": "*",
    "effect": "ask"
  },
  {
    "action": "notion_notion-update-skill-settings",
    "resource": "*",
    "effect": "ask"
  },
  {
    "action": "notion_notion-update-view",
    "resource": "*",
    "effect": "ask"
  },
  {
    "action": "notion_notion-calendar-cancel-events",
    "resource": "*",
    "effect": "ask"
  },
  {
    "action": "notion_notion-delete-comment",
    "resource": "*",
    "effect": "ask"
  },
  {
    "action": "notion_notion-delete-databases",
    "resource": "*",
    "effect": "ask"
  },
  {
    "action": "notion_notion-delete-pages",
    "resource": "*",
    "effect": "ask"
  },
  {
    "action": "notion_notion-restore-version",
    "resource": "*",
    "effect": "ask"
  },
  {
    "action": "notion_notion-send-message-to-session",
    "resource": "*",
    "effect": "ask"
  },
  {
    "action": "notion_notion-spawn-session",
    "resource": "*",
    "effect": "ask"
  },
  {
    "action": "notion_notion-stop-session",
    "resource": "*",
    "effect": "ask"
  },
  {
    "action": "notion_notion-upload-skill",
    "resource": "*",
    "effect": "ask"
  },
  {
    "action": "notion_events_list",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_probe",
    "resource": "*",
    "effect": "allow"
  }
]
```

`access: "read-only"`:

```json
[
  {
    "action": "notion_*",
    "resource": "*",
    "effect": "deny"
  },
  {
    "action": "notion_notion-ai-search",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-calendar-list-calendar-resources",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-calendar-list-calendars",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-calendar-list-contacts",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-calendar-list-coworkers-events",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-calendar-list-events",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-connector-search",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-download-attachment",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-download-skill",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-fetch",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-get-async-task",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-get-comments",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-get-enabled-skills",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-get-file-download-urls",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-get-groups",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-get-self",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-get-session-status",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-get-setup-guide",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-get-sidebar-tabs",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-get-suggested-edit",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-get-teams",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-get-tool-access",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-get-users",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-get-version-changes",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-list-favorite-pages",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-list-page-backlinks",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-list-private-pages",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-list-recent-pages",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-list-session-events",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-list-shared-pages",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-memory-search",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-query-data-sources",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-query-meeting-notes",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-query-multiple-data-sources",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-query-sessions",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-read-session-event",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-search",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-search-agents",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-search-sessions",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-view-version",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-wait-session",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_notion-calendar-create-events",
    "resource": "*",
    "effect": "deny"
  },
  {
    "action": "notion_notion-calendar-update-events",
    "resource": "*",
    "effect": "deny"
  },
  {
    "action": "notion_notion-complete-mcp-setup",
    "resource": "*",
    "effect": "deny"
  },
  {
    "action": "notion_notion-convert-page-to-skill",
    "resource": "*",
    "effect": "deny"
  },
  {
    "action": "notion_notion-convert-to-meetings-database",
    "resource": "*",
    "effect": "deny"
  },
  {
    "action": "notion_notion-create-attachment",
    "resource": "*",
    "effect": "deny"
  },
  {
    "action": "notion_notion-create-comment",
    "resource": "*",
    "effect": "deny"
  },
  {
    "action": "notion_notion-create-database",
    "resource": "*",
    "effect": "deny"
  },
  {
    "action": "notion_notion-create-file-upload",
    "resource": "*",
    "effect": "deny"
  },
  {
    "action": "notion_notion-create-folder",
    "resource": "*",
    "effect": "deny"
  },
  {
    "action": "notion_notion-create-meeting-note",
    "resource": "*",
    "effect": "deny"
  },
  {
    "action": "notion_notion-create-pages",
    "resource": "*",
    "effect": "deny"
  },
  {
    "action": "notion_notion-create-suggested-edit",
    "resource": "*",
    "effect": "deny"
  },
  {
    "action": "notion_notion-create-view",
    "resource": "*",
    "effect": "deny"
  },
  {
    "action": "notion_notion-duplicate-page",
    "resource": "*",
    "effect": "deny"
  },
  {
    "action": "notion_notion-link-meeting-note-to-calendar-event",
    "resource": "*",
    "effect": "deny"
  },
  {
    "action": "notion_notion-move-pages",
    "resource": "*",
    "effect": "deny"
  },
  {
    "action": "notion_notion-resolve-suggested-edit",
    "resource": "*",
    "effect": "deny"
  },
  {
    "action": "notion_notion-restore-pages",
    "resource": "*",
    "effect": "deny"
  },
  {
    "action": "notion_notion-set-comment-reaction",
    "resource": "*",
    "effect": "deny"
  },
  {
    "action": "notion_notion-set-discussion-resolved",
    "resource": "*",
    "effect": "deny"
  },
  {
    "action": "notion_notion-update-comment",
    "resource": "*",
    "effect": "deny"
  },
  {
    "action": "notion_notion-update-data-source",
    "resource": "*",
    "effect": "deny"
  },
  {
    "action": "notion_notion-update-folder",
    "resource": "*",
    "effect": "deny"
  },
  {
    "action": "notion_notion-update-page",
    "resource": "*",
    "effect": "deny"
  },
  {
    "action": "notion_notion-update-page-favorites",
    "resource": "*",
    "effect": "deny"
  },
  {
    "action": "notion_notion-update-sidebar-tabs",
    "resource": "*",
    "effect": "deny"
  },
  {
    "action": "notion_notion-update-skill-settings",
    "resource": "*",
    "effect": "deny"
  },
  {
    "action": "notion_notion-update-view",
    "resource": "*",
    "effect": "deny"
  },
  {
    "action": "notion_notion-calendar-cancel-events",
    "resource": "*",
    "effect": "deny"
  },
  {
    "action": "notion_notion-delete-comment",
    "resource": "*",
    "effect": "deny"
  },
  {
    "action": "notion_notion-delete-databases",
    "resource": "*",
    "effect": "deny"
  },
  {
    "action": "notion_notion-delete-pages",
    "resource": "*",
    "effect": "deny"
  },
  {
    "action": "notion_notion-restore-version",
    "resource": "*",
    "effect": "deny"
  },
  {
    "action": "notion_notion-send-message-to-session",
    "resource": "*",
    "effect": "deny"
  },
  {
    "action": "notion_notion-spawn-session",
    "resource": "*",
    "effect": "deny"
  },
  {
    "action": "notion_notion-stop-session",
    "resource": "*",
    "effect": "deny"
  },
  {
    "action": "notion_notion-upload-skill",
    "resource": "*",
    "effect": "deny"
  },
  {
    "action": "notion_events_list",
    "resource": "*",
    "effect": "allow"
  },
  {
    "action": "notion_probe",
    "resource": "*",
    "effect": "allow"
  }
]
```

Rules in your own `permissions` come after the plugin's. A saved "Always allow" beats an `ask` but never a `deny`. Under
`ask-changes` or `read-only`, an agent without a base allow, or an agent added by a plugin that loads after this one,
gets no block; `/notion-status` names it and prints the rules to paste into that agent, followed by your top-level rules
for Notion tools. Under the default `all` the block would add nothing, so no agent is named. Do not put an `ask` or an
`allow` in the top-level `permissions`, which would loosen Explore.

The plugin's own reads, `notion_events_list` and `notion_probe`, are allowed by the last two rules of every block,
whatever `access` says.

## Status

`/notion-status` and the `notion.workspace/status` RPC method report the same model:

| Field | Meaning |
| --- | --- |
| `version` | The plugin's version. |
| `state` | `connected`, `sign_in_required`, `connecting`, `failed`, `disabled`, `not_configured` or `conflict`. |
| `access` | The option's value. |
| `source` | The server's owner and URL: `plugin`, `adopted` or `conflict`. |
| `workspace`, `connection` | The workspace name and whether the sign-in is a person or a workspace connection, or null before an `events_list` or `probe` read. |
| `tools`, `destructiveTools`, `unknownCount`, `unknownTools` | Notion's own tools that OpenCode lists, the destructive class, and the tools the plugin does not know. The plugin's own `notion_events_list` is not counted. |
| `unguardedAgents` | Agents where a new Notion tool would run without asking. |
| `host` | `version`, `range` and `tested` (true only for 2.4.1). |
| `problems` | Setup problems, each `CODE: What happened. Next step: What to do.` |
| `nextStep` | The one next step, or `Nothing to do.` |

## Errors

| Code | When |
| --- | --- |
| `HOST_UNTESTED` | Setup: OpenCode is outside `>=2.4.1 <2.5.0`, and `allowUntestedHost` is not set. |
| `OPTIONS_INVALID` | Setup: an option is unknown or has a wrong value. |
| `SKILLS_INVALID` | Setup: a skill file is missing or broken; the plugin still starts. |
| `SERVER_NOT_REGISTERED` | Setup: the `notion` server could not be registered. |
| `RULES_NOT_ADDED` | Setup: the default permission rules could not be added. |
| `STATUS_UNAVAILABLE` | Status: the status could not be read, or the plugin is not running. |

The script-facing codes are in [Scripting](scripting.md#errors).
