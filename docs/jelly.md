# In Jelly

[Jelly](https://heyjelly.ai) runs OpenCode agents. It reads the `jelly` section of this
package's `package.json` as JSON, without loading the plugin, when a person reviews the exact
version, and uses it as follows.

Jelly names the plugin **Notion** (`jelly.title`), with the package name and version beneath. Under
that name it shows the one line in `jelly.summary`, and beside it the mark in `jelly.icon`
(`assets/icon.svg`, shipped in the package): Jelly reads that file once, when it records the
plugin, and keeps it only if it is a clean SVG of drawing elements, with no script, style, link
or outside reference. The mark is a neutral page with three text lines on a graphite tile, not
Notion's logo. Jelly's declaration contracts drop a top-level key they don't know, and refuse an
unknown key inside a tool, sign-in or `contributes` entry, so the section uses only the keys Jelly
reads.

## Tools and permissions

71 tools are declared (39 read-only), every tool in `src/notion-tools.ts`: each read tool as read-only with `allow`, each
write tool with `ask`, and each denied tool with `deny`. Jelly's agents have no base "allow everything" rule, so this
plugin's own default rules, which it puts after that rule, never reach them. Jelly writes each declared `ask` or `deny` as
that tool's default instead (the person's own choice replaces it), and denies a read-only helper every tool not marked
`readOnly`. A declared `allow` changes nothing in Jelly.

- Ask: the 23 changes, such as `notion_notion-update-page` (a property or content change everyone with access sees),
  `notion_notion-create-comment` (a comment, whose mention notifies someone) and `notion_notion-move-pages` (access can
  change with the new parent).
- Off: `notion_notion-delete-pages`, `notion_notion-delete-databases`, `notion_notion-delete-comment` (trash),
  `notion_notion-restore-version` (replaces a whole page), `notion_notion-upload-skill` (replaces a Skill page),
  `notion_notion-spawn-session`, `notion_notion-send-message-to-session`, `notion_notion-stop-session` (a Custom Agent) and
  `notion_notion-calendar-cancel-events` (an event others see).
- Everything else runs, as the plugin's own rules let it.

A tool Notion adds later, a write included, is not declared, so in Jelly it is not asked about: it runs without asking,
even if it changes something such as a page's whole content, until a new version of this plugin declares it. Notion adds
tools over time, write actions included. A Jelly admin can set such a tool to ask. Keep `jelly.tools` in step with
`src/notion-tools.ts`; `test/unit/jelly.test.ts` checks the list against it, and each declared effect against the plugin's
own default rules.

## Skills

Declared: `notion`, `notion-write`. Jelly refuses an install whose skill ids collide with another plugin's or the agent's
own; they differ from the Google Workspace, Slack, Granola, Linear and Metaview plugins' skills, which share such
questions with them.

## Views

None: `jelly.views` and `jelly.rpc` are empty, and the plugin contributes no Home feed or widget. A feed of recent pages
would put workspace content on a dashboard and call Notion unasked.

## Signing in

`jelly.signIns` declares one sign-in, `notion`, for Notion's MCP server `notion`, which signs in with OpenCode's MCP OAuth.

Jelly folds the declared sign-in into this plugin's one card, which shows it as Connected, Not signed in or Sign in again
(expired or revoked), and starts, renews and signs out of it. An agent's `jelly_connection_request`, or a tool result that
names this plugin's "Run /connect and choose …" next step, opens the same card. The plugin still signs in through OpenCode,
as it does without Jelly; the declaration only tells Jelly which of the engine's integrations and servers are this plugin's.

## Versions

Jelly's curated catalogue pins an exact version, so publish each release under a new version: a review in Jelly can then
tell the two apart.
