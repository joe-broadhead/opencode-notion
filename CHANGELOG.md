# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.0] - Unreleased

### Changed

- The tool table follows Notion's live tool list: two reads and seven writes are added, and the Skills tool that enables and disables Skills is now `notion-update-skill-settings`. `notion-ai-search` and `notion-connector-search` stay declared as reads, because Notion lists them only on some connections and plans.
- Both skills explain how to connect Notion when its tools are absent, including possible Enterprise approval.

- Default permission rules after each agent's base allow: every Notion tool is allowed, reads, writes, the nine
  destructive tools and the Custom Agent sessions alike, and the namespace pattern covers a tool Notion adds later. The
  `access` option restricts them: `all` (the default), `ask-changes` allows a read and asks for everything else, and
  `read-only` denies everything but a read.
- The tools RPC is v2: every known tool is scriptable under a prior explicit allow, each method carries its class,
  `describe` takes a session and reports each method's permission, and `shapeInput` runs beside `shapeResult` so a
  script's call reaches Notion with the model path's arguments. A saved "Always allow" no longer authorises an ad-hoc
  script: a grant is a rule in config, or a Jobs run session.

### Added

- Jelly shows an `access` setting (`all`, `ask-changes` or `read-only`; `all` by default), the option the plugin already reads.
- Registers Notion's official MCP server, `https://mcp.notion.com/mcp`, as `notion`, signed in with OpenCode's own MCP
  OAuth. OpenCode signs in with its client ID metadata document and asks the one scope Notion names, `default`, so there
  is no client ID or key to configure.
- Names the server's `/connect` entry "Notion", and marks its account "Sign in required" while the server needs a new
  sign-in.
- Adopts your own `mcp.servers.notion` at Notion's URL unchanged, including an entry that carries an MCP token in its
  headers. The plugin never reads those headers. Any other URL, or a local command, is a conflict that status explains.
- The workspace name and connection type in status, from the last `notion-get-self` call the model or a script made. The
  plugin makes no call of its own, and reads nothing else of the result.
- `/notion-status` and the `/notion` dialog ("Notion: Status" in the palette): connection, account, access, tools, agents
  without the default rules, the OpenCode check and one next step. A next step for a sign-in that worked and then needed a
  new one explains a revoked grant, which reusing a rotated refresh token causes. A skill of yours with one of the
  plugin's ids is named, with a next step.
- The status RPC `notion.workspace/status`, with the fields this family of plugins shares.
- The tools RPC `notion.workspace.tools`, which lets scripts call Notion's tools with no model, each under a prior
  explicit allow, as a session and its agent. Its method names keep Notion's hyphens.
- Two skills: `notion` (searching and reading pages and databases, citing them, meeting notes, Notion's connected sources,
  and the rules for other people's content) and `notion-write` (whom each change reaches, said before the call, and never
  replacing a whole page unless the user asked for that).
- The options `access` and `allowUntestedHost`, and a host check for OpenCode `>=2.2.3 <2.3.0`, tested on 2.2.3, 2.2.4, 2.2.5 and 2.2.6.
- A `jelly` declaration for Jelly: the tools with their default effects, the skills, the sign-in, a summary and an icon.
- The family icon kit's mark and its 128 and 256 pixel rasters, declared in `opencode.icons` and exported from the
  package, with `opencode.vendor` naming Notion's domain: a display app may show Notion's own logo from Notion's site,
  and the package carries no vendor marks.
