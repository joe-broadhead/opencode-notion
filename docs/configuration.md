# Configuration

Every option is optional. The smallest setup is one entry in `plugins`:

```json
{
  "plugins": ["@joe-broadhead/opencode-notion"]
}
```

To set options, use the object form:

```json
{
  "plugins": [{ "package": "@joe-broadhead/opencode-notion", "options": { "allowUntestedHost": true } }]
}
```

## Options

### `allowUntestedHost`

- Type: `true` or `false`.
- Default: `false`.

The plugin supports OpenCode `>=2.2.3 <2.3.0`, the range `opencode.host` in `package.json` declares, and every check runs
on 2.2.3, 2.2.4, 2.2.5 and 2.2.6, the tested releases. Status shows the version, whether it is tested and the supported range in
its `OpenCode` row, for example `2.2.5 (tested; supported range >=2.2.3 <2.3.0)`.

- **A tested release:** the plugin starts.
- **Another release inside the range, such as 2.2.99:** the plugin starts too. Status marks the version `untested`, and the
  status RPC's `host.tested` is `false`. The next step is the same as on a tested release.
- **Outside the range, including 2.3.0, prereleases and development builds:** the plugin refuses to start, and `/plugins`
  shows:

  ```text
  HOST_UNTESTED: This plugin supports OpenCode >=2.2.3 <2.3.0, found 2.3.0. Next step: Use OpenCode >=2.2.3 <2.3.0, or set the plugin option "allowUntestedHost": true to run anyway.
  ```

- **Outside the range with `"allowUntestedHost": true`:** it starts anyway, and `/notion-status` and `/notion` show a
  warning.

There is no other option. To narrow what the model may do in Notion, use permission rules; see
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
skills still apply. Of your entry the plugin reads only its type, its URL and whether `oauth` is
`false`; it never reads, copies or reports its `headers`.

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

OpenCode asserts every MCP call itself, with the action `notion_<tool>` and the resource `*`. Notion's own tool names
start `notion-`, so each action is double-prefixed: `notion-search` becomes `notion_notion-search`. The plugin adds these
rules to every agent that starts with the base rule `{ "action": "*", "resource": "*", "effect": "allow" }`, directly
after that rule:

```json
[
  { "action": "notion_*", "resource": "*", "effect": "ask" },
  { "action": "notion_notion-search", "resource": "*", "effect": "allow" },
  { "action": "notion_notion-fetch", "resource": "*", "effect": "allow" },
  { "action": "notion_notion-delete-pages", "resource": "*", "effect": "deny" },
  { "action": "notion_notion-update-page", "resource": "*", "effect": "ask" }
]
```

That sample leaves out the other read allows, which sit between the two shown, and the other deny rules; `/notion-status`
prints the whole block, and its `Agents without default rules` row prints it as a list to paste.

`READ_TOOLS` in `src/notion-tools.ts` lists Notion's read tools, `WRITE_TOOLS` its write tools, and `DENY_TOOLS` the nine
that are off. Writes and tools that Notion adds later match only `notion_*`, so they ask. `/notion-status` names the tools
in no list. A plan or an Enterprise tool list can leave out tools the plugin knows, so a known tool missing from one
connection is normal.

`notion_notion-update-page` is the routine change and stays at `ask`, although it also carries the command that replaces a
whole page's content. No permission rule can see an argument, so the guard is a rule: `notion-write` never sends that
command unless the user asked to replace the whole page, and says in one line what will be removed first. An owner who
wants it stricter can deny the tool and edit in Notion instead:

```json
{ "permissions": [{ "action": "notion_notion-update-page", "resource": "*", "effect": "deny" }] }
```

The write tools, which ask:

- `notion-create-pages`, `notion-duplicate-page` and `notion-move-pages` add or move pages that others see. A new page in
  a teamspace inherits its permissions, and a moved page inherits access from its new parent, so people can gain or lose
  access.
- `notion-create-comment`, `notion-update-comment`, `notion-create-suggested-edit`, `notion-set-comment-reaction`,
  `notion-set-discussion-resolved` and `notion-resolve-suggested-edit` write on a page others read; a mention notifies the
  person, and a suggestion opens a discussion thread.
- `notion-create-database`, `notion-update-data-source`, `notion-create-view` and `notion-update-view` change a database
  everyone with access uses. An update to a data source removes any select or status option it omits.
- `notion-create-file-upload`, `notion-create-attachment`, `notion-create-folder`, `notion-update-folder`,
  `notion-convert-page-to-skill` and `notion-update-enabled-skills` add or change files and the Skills a connection
  offers.
- `notion-restore-pages` takes a page out of Trash.
- `notion-calendar-create-events` and `notion-calendar-update-events` may notify attendees.

The deny rules turn nine tools off:

- `notion-delete-pages`, `notion-delete-databases` and `notion-delete-comment` trash something everyone with access can
  see. Trash is recoverable only until the workspace's retention passes.
- `notion-restore-version` replaces a whole page with a past version: every edit after that time is lost, including other
  people's, and the comments added since.
- `notion-upload-skill` replaces a Skill page's title, Description, body and Files.
- `notion-spawn-session`, `notion-send-message-to-session` and `notion-stop-session` drive a Notion Custom Agent that acts
  in the workspace with your permissions and spends AI credits.
- `notion-calendar-cancel-events` removes an event from other people's calendars and may notify them.

To turn one on, add a rule that makes it ask to the agent's own `permissions`, which come after the plugin's block in that
agent. Each call then asks. Every opt-in rule, for the build agent:

```json
{
  "agents": {
    "build": {
      "permissions": [
        { "action": "notion_notion-delete-pages", "resource": "*", "effect": "ask" },
        { "action": "notion_notion-delete-databases", "resource": "*", "effect": "ask" },
        { "action": "notion_notion-delete-comment", "resource": "*", "effect": "ask" },
        { "action": "notion_notion-restore-version", "resource": "*", "effect": "ask" },
        { "action": "notion_notion-upload-skill", "resource": "*", "effect": "ask" },
        { "action": "notion_notion-spawn-session", "resource": "*", "effect": "ask" },
        { "action": "notion_notion-send-message-to-session", "resource": "*", "effect": "ask" },
        { "action": "notion_notion-stop-session", "resource": "*", "effect": "ask" },
        { "action": "notion_notion-calendar-cancel-events", "resource": "*", "effect": "ask" }
      ]
    }
  }
}
```

Use only the rules you need.

Don't put these in the top-level `permissions`: a top-level rule comes after every agent's own rules, so it would reach
every agent, Explore included, which otherwise can't use Notion. For an agent that exists only in your config, put them
after the plugin's block (see [Agents that miss the rules](#agents-that-miss-the-rules)).

Use only the rules you need. Never make a denied tool `allow`, and don't answer "Always allow" when it asks: OpenCode would
save an allow for every agent in the project, and every later delete or whole-page restore would run unasked.

OpenCode uses the last rule that matches, so everything after the plugin's rules wins:

1. the agent's own rules, such as Explore's, which turn Notion off there;
2. your top-level `permissions`, which OpenCode adds to every agent;
3. your saved "Always allow" answers, which beat an `ask` but never a configured `deny`.

A `deny` on resource `*` also hides the tool from the model. In an unattended run such as `opencode run`, a tool that asks
is refused. An agent without the base rule gets no Notion rules and keeps its own behaviour.

### Recipes

A `deny` can go in the top-level `permissions` of `opencode.json`: it applies to every agent, and only tightens. An
`allow` or `ask` goes in the agent's own `permissions`: a top-level one would reach every agent, Explore included.

Never replace a whole page from OpenCode, in any agent (a `deny` also hides the tool):

```json
[{ "action": "notion_notion-update-page", "resource": "*", "effect": "deny" }]
```

No write tool gets an `allow` recipe here, and none should be saved: an "Always allow" answer covers every agent in the
project, and it is exactly what lets a change that reaches other people run unasked. In an unattended run such as
`opencode run`, a write that asks is refused, so run writes interactively, where the permission prompt is the yes.

A strict agent where every Notion tool asks, reads included: put these in that agent's own `permissions`, after the block.
The last match wins, so the `notion_*` ask alone would turn the denied tools into asks too; repeating their denies after it
keeps them off:

```json
[
  { "action": "notion_*", "resource": "*", "effect": "ask" },
  { "action": "notion_notion-delete-pages", "resource": "*", "effect": "deny" },
  { "action": "notion_notion-delete-databases", "resource": "*", "effect": "deny" },
  { "action": "notion_notion-delete-comment", "resource": "*", "effect": "deny" },
  { "action": "notion_notion-restore-version", "resource": "*", "effect": "deny" },
  { "action": "notion_notion-upload-skill", "resource": "*", "effect": "deny" },
  { "action": "notion_notion-spawn-session", "resource": "*", "effect": "deny" },
  { "action": "notion_notion-send-message-to-session", "resource": "*", "effect": "deny" },
  { "action": "notion_notion-stop-session", "resource": "*", "effect": "deny" },
  { "action": "notion_notion-calendar-cancel-events", "resource": "*", "effect": "deny" }
]
```

### Agents that miss the rules

OpenCode creates agents that exist only in your config after plugins add their rules, so those agents get no Notion rules;
agents that a later plugin adds are in the same position. An agent counts as guarded when the plugin's whole block appears
anywhere after its base allow. `/notion-status` and `/notion` list every other agent that has a base allow and where a new
Notion tool would run without asking, by name, followed by the default rules to paste. The next step reads:

```text
Put the default rules shown by /notion-status first in each listed agent's own permissions, in opencode.json or the agent's Markdown file, followed by your top-level rules for Notion tools.
```

Put the block first in that agent's own `permissions`, then repeat after it any top-level rules you have for `notion_*`
tools, so yours keep winning. Never put the block in the top-level `permissions`: top-level rules come after every agent's
own rules, so it would loosen Explore. For an agent `reviewer`, with one top-level rule of your own:

```json
{
  "permissions": [{ "action": "notion_notion-delete-pages", "resource": "*", "effect": "deny" }],
  "agents": {
    "reviewer": {
      "description": "Reviews changes",
      "mode": "subagent",
      "permissions": [
        { "action": "notion_*", "resource": "*", "effect": "ask" },
        { "action": "notion_notion-search", "resource": "*", "effect": "allow" },
        { "action": "notion_notion-fetch", "resource": "*", "effect": "allow" },
        { "action": "notion_notion-delete-pages", "resource": "*", "effect": "deny" }
      ]
    }
  }
}
```

Copy the full block from your own `/notion-status` output: the sample above keeps the first two read allows and your own
rule, and leaves out the other 37.

## Errors

Every error from the plugin reads `CODE: What happened. Next step: What to do.`

| Code | When | Next step |
| --- | --- | --- |
| `OPTIONS_INVALID` | Setup: an option is unknown or has a wrong value. `/plugins` shows the message, which names the option and the accepted values. | Fix the plugin options in `opencode.json`. |
| `HOST_UNTESTED` | Setup: OpenCode is outside `>=2.2.3 <2.3.0`, and `allowUntestedHost` is not set. | Use OpenCode `>=2.2.3 <2.3.0`, or set `"allowUntestedHost": true`. |
| `STATUS_UNAVAILABLE` | `/notion-status`, `/notion` or the status RPC: the status could not be read, or the plugin is not running on the server. The RPC answers with its error `unavailable`. | The message's own next step: restart OpenCode and run the command again, or, when the plugin is not running, run `/plugins` to see why. |
| `SKILLS_INVALID` | Setup: a skill file is missing or broken. The plugin still starts; status shows the problem. | Reinstall the plugin. |
| `SERVER_NOT_REGISTERED` | Setup: the `notion` server could not be registered. Status shows the problem. | Restart OpenCode. |
| `RULES_NOT_ADDED` | Setup: the default permission rules could not be added, so Notion tools may run without asking. Status shows the problem. | Restart OpenCode. |

For example:

```text
OPTIONS_INVALID: Unknown option "apiKey". Accepted options: "allowUntestedHost". Next step: Fix the plugin options in opencode.json, for example "plugins": [{ "package": "@joe-broadhead/opencode-notion", "options": { "allowUntestedHost": true } }].
```

Errors from Notion's server and from OpenCode pass through unchanged, except in the tools RPC for scripts, whose codes are
in [Scripting](scripting.md#errors). Notion's own errors name what happened: `validation_error`, whose
`additional_data.tool_error_code` can be `page_not_found` or `suggested_edit_stale`; `object_not_found`, which can mean no
access; `rate_limited`, with `retry_after_seconds` and `rate_limit_reason`; `service_overload`; and
`public_api_request_blocked`, which retrying will not change.

## Status and RPC

`/notion-status`, the `/notion` dialog and the RPC method `status` (RPC ID `notion.workspace`) share one status model. It
holds no token, no header and no URL query, and makes no Notion call. `version`, `host`, `state`, `unguardedAgents` and
`nextStep` are the fields every plugin of this family shares, with the same names and meanings:

| Field | Content |
| --- | --- |
| `version` | The plugin's version |
| `state` | `connected`, `sign_in_required`, `connecting`, `disabled`, `failed`, `not_configured` or `conflict`. The `Connection` row shows the same states as `connected`, `sign-in required`, `connecting`, `disabled`, `failed`, `not configured` and `conflict`. |
| `error` | For a failed connection only: OpenCode's reason, on one line of at most 160 characters, with any URL cut before its query. The text for a needed sign-in can hold an authorization URL, so it is never shown. |
| `source` | `type` (`plugin`, `adopted` or `conflict`), `url`, `signIn` (`oauth`, or `own` for an entry with `"oauth": false`, such as an MCP token), and for a conflict the `expected` URL |
| `workspace` | The workspace's name from the last `notion-get-self` call since OpenCode started, or `null` before one. The plugin makes no call of its own. |
| `connection` | `person` for your own sign-in, `bot` for a workspace connection whose admin chose its tool list, or `null` before an account read. |
| `tools` | How many Notion tools OpenCode lists that the default rules let run or ask: the listed ones, without the denied ones |
| `deniedTools` | The listed tools that the default rules deny. The `Tools` row shows them as "off by default"; your own later `ask` rule may have turned one on. |
| `listing` | True while a server that connected moments ago lists no tools yet. The next step is then to run `/notion-status` again in a few seconds, not to ask an admin. |
| `unknownCount`, `unknownTools` | How many of them the plugin does not know, and at most 20 of their names, only those made of lowercase letters, digits, `_` and `-` |
| `unguardedAgents` | Agents where a new Notion tool would run without asking; empty when there are none. An agent whose own rules already ask or deny for every Notion tool is not listed. |
| `shadowedSkills` | Present only when a skill with one of the plugin's ids, such as your own `notion` skill, replaces the plugin's: each `id` and the `path` OpenCode loads instead |
| `host` | `version` (`null` if OpenCode reports none), `range` (the supported range) and `tested` (true only for 2.2.3, 2.2.4, 2.2.5 and 2.2.6) |
| `problems` | Setup problems, each `CODE: What happened. Next step: What to do.` |
| `nextStep` | Exactly one next step: the `Next step` row, `Nothing to do.` when nothing is needed |

The `Access` row states the posture the default rules fix, from the tool lists: reads run without asking; every change and
any new tool ask first; and the tools that delete, replace a whole page, upload a Skill, drive a Notion agent or cancel an
event are off. Then it says whether that connection is a person's or a workspace connection's, when an account read has
said so, and whether those rules are in place: "no agent runs new Notion tools unasked", "default rules missing in the
agents listed below", or "default rules not added (see the OpenCode row)".

A sign-in that worked and then needed a new one adds a sentence to the next step: Notion revokes the whole grant when a
refresh token is reused, which two OpenCode processes sharing one sign-in do, so signing out and in again once is the fix.

When the status cannot be read, the method answers with its error `unavailable`: the message
`STATUS_UNAVAILABLE: Could not read Notion's status (…).` and `data: { nextStep }`.
