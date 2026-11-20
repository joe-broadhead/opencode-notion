# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.6] - 2026-11-20

### Fixed

- **`events_list` works after any restart of OpenCode, with no `probe` before it.** Until now the plugin kept who is
  signed in only in memory, and only `probe` filled it. A consumer that probes once, at bind, such as Memory, found
  every later listing `UNAVAILABLE` ("no probe has named this sign-in's workspace") after OpenCode started again, a
  plugin reload, or a second OpenCode process, for good. Now a listing that does not know the sign-in yet makes the one
  identity read `probe` makes (`notion-get-self`, the declared identity operation), once, keeps the answer for the
  sign-in as `probe` does, and then runs. The workspace check is as strict as before: another workspace than the
  signed-in one is `ACCOUNT_MISMATCH`, before any search. An identity read that fails, or answers without a workspace and
  user, is `UNAVAILABLE`, and nothing is kept. An invalid request or another source is still refused before any read.
- **A credential update forgets who is signed in, as a credential switch does.** A new sign-in may keep its credential
  id and be another person or workspace, so a listing that follows one reads who is signed in again instead of naming
  the workspace read before it.
- **Listings that start together make one identity read**, and a read that is in flight across a sign-out or a
  credential change keeps nothing: a listing whose read crossed one is `UNAVAILABLE` rather than name a sign-in that
  may no longer be current.
- **A rate limit in one of a call's searches no longer fails the whole call.** What the searches read is answered, with
  the cursor the call was given and `more: true`, so the next call reads the window again and no edit is skipped; the
  call makes no further search once Notion rate-limits it, so nothing is retried before the retry-after. A call that
  read nothing is still `RATE_LIMITED`, with that wait.

### Changed

- **`notion.pages` lists only the pages Notion's search returns for you, not every page the sign-in can reach.** Until
  now `events_list` listed the whole workspace by last edit, other people's documents included. Every search now carries
  one of Notion's own author filters for your user (`filters.edited_by_user_ids`, then `filters.created_by_user_ids`,
  each `["me"]`), and a listing is the union of the two, each page once: the pages you created, and the pages its edited-by
  filter returns. Notion's documentation does not say which edits that filter matches, so a listed page's latest edit may
  be someone else's, and the method descriptions, README and architecture guide claim only what the filters return.
  Notion applies these filters only on the Business and Enterprise plans, as it does the sort; if its search answers
  with a notice that it left out any option, the listing is `UNAVAILABLE`, never a wider list. One call now makes up to 60
  searches (30 for each filter), where it made up to 30. The descriptor has no place for a consent sentence (a `scope`
  needs at least one key to choose, and this source has none), so `package.json`'s `sources` gains no `scope`, and it
  carries no key a consumer on source-contract 0.1 refuses.
- source-contract is pinned at v0.3.0 (`github:we-the-rebel-alliance/source-contract#v0.3.0`), still bundled into
  `dist/index.js` with no runtime dependency. The declaration and both methods are unchanged and carry none of the keys
  v0.3.0 adds (`facts`, `hints`, `routines`, an actor's `kind`, an event's `sections` and `parts`), so jelly, Memory and
  Artifacts on v0.2.x read them as before.
- The pin itself changes no behaviour, and no host-support change: still tested on 2.2.3, 2.2.4, 2.2.5, 2.2.6, 2.2.7, 2.3.0, 2.3.1 and 2.3.2, with the supported range unchanged (`>=2.2.3 <2.4.0`).

## [0.0.5] - 2026-11-18

### Changed

- The tested releases now include OpenCode 2.3.1 and 2.3.2, so the host and pack stages and CI run on each: tested on 2.2.3, 2.2.4, 2.2.5, 2.2.6, 2.2.7, 2.3.0, 2.3.1 and 2.3.2. The supported range is unchanged
  (`>=2.2.3 <2.4.0`), and so are the host devDependencies the checks compile against (2.2.3).

## [0.0.4] - 2026-11-17

### Added

- A source of the source contract, `notion.pages`, declared in `package.json`'s `sources`: `events_list` lists the
  workspace's pages and databases by the time they were last edited, as events with their title, edit time and link and
  no page content, and `probe` names the workspace and the signed-in user and records them for the sign-in, which
  `events_list` then lists for. Both are tools RPC methods, read only `notion-get-self` (probe) and `notion-search`
  (events_list), and are allowed by the default rules under every `access` value. Listing by last edit needs a Business
  or Enterprise workspace.
- `npm run conformance` and the `conformance` stage of `npm run check`: the source contract's conformance kit over the
  source, against a fake Notion, writing `reports/conformance-report.json` for the release to attach.

### Changed

- The tools RPC's transport is the source contract's `tools-rpc` module, bundled into `dist/index.js`, instead of a copy
  in `src/host/tools-rpc.ts`, which now holds only Notion's part. Its methods, codes and next steps are unchanged. The
  pack stage runs `probe` and `events_list` through it in stock OpenCode, tested on 2.2.3, 2.2.4, 2.2.5, 2.2.6, 2.2.7
  and 2.3.0.

## [0.0.3] - 2026-11-15

### Changed

- OpenCode 2.3 is admitted: the host range is `>=2.2.3 <2.4.0` (it was `>=2.2.3 <2.3.0`), tested on 2.2.3, 2.2.4, 2.2.5, 2.2.6, 2.2.7 and 2.3.0.
  The host and pack stages, CI and the release's install check run every one of them. A later 2.2 or 2.3 release
  starts and status calls it untested; the `HOST_UNTESTED` example host is now 2.4.0.
- Apart from the status fix below, OpenCode 2.3 needs nothing else from this plugin. It does not call the `subagent` tool or read
  `session.tool.failed`; Notion's tools are Notion's MCP tools, which OpenCode runs and stops itself when the person presses Stop; and it has no use
  for the new `session.fork` hook.
- The host test of a call that names another location waits until the plugin has loaded there: from OpenCode 2.2.7 a
  location opened by a call answers `rpc.unavailable` until its plugins have registered.

### Fixed

- Status, `/notion-status` and the `/notion` dialog read the server's source and the default rules' outcome after listing
  the servers and agents. OpenCode records them only when something reads that state, so right after start-up a status
  read could miss them.

## [0.0.2] - 2026-11-14

### Added

- The shared declaration test kit, `test/support/jelly-kit.ts`, a byte-identical copy of the one every plugin of the
  family carries, pinned in `scripts/check-copies.mjs`. `test/unit/jelly.test.ts` runs its declaration and
  `docs/jelly.md` checks.
- `test/fixtures/live-tools.json`, Notion's tool list for a signed-in user, captured live on 14 November 2026, and a
  test that fails when the declaration and that list disagree. Notion serves 77 of the 79 declared tools.
- Jelly's sign-in declares `relay: {}`, so a Jelly sign-in from a browser tab can come back through Jelly's relay:
  Notion's server registers clients dynamically and accepts a client metadata document.

### Changed

- Jelly's declaration notes the two plan-gated reads, `notion-ai-search` and `notion-connector-search`, and
  `test/fixtures/tool-registry.json` records why each may be missing from a list.
- `docs/jelly.md` says Notion rotates the refresh token on every use, so a sign-in copied to another engine or agent
  signs the person out: one sign-in per engine.
- The icon is now Notion's own logo, as notion.com's header draws it, in place of the family's page-with-a-folded-corner mark; `opencode.vendor.mark` is `true`.
- OpenCode support is unchanged: `>=2.2.3 <2.3.0`, tested on 2.2.3, 2.2.4, 2.2.5 and 2.2.6.

## [0.0.1] - 2026-11-13

### Added

- The `jelly` settings declare their choices: `access` offers Jelly's three (Allowed, Ask before changes, Read only), so
  Jelly draws it as a choice instead of free text. A test reads the settings with Jelly's setting rules and checks that
  the options parser takes every declared value and refuses one outside the set (needs a jelly that includes
  app#1301). OpenCode support is unchanged: `>=2.2.3 <2.3.0`, tested on 2.2.3, 2.2.4, 2.2.5 and 2.2.6.

## [0.0.0] - 2026-11-10
<!-- kit-release: the GitHub release v0.0.0 -->

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
