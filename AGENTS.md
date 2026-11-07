# Repository rules

This repository builds `@joe-broadhead/opencode-notion`, an OpenCode plugin that registers Notion's official MCP server
and adds default permission rules, a status command, a status dialog, two skills and a tools RPC for scripts. It has no
tool of its own. Read [docs/architecture.md](docs/architecture.md) before you change code, and [CONTRIBUTING.md](CONTRIBUTING.md)
for the checks and the release steps.

## Rules

- **Public API only.** Use only the public `@opencode/plugin` 2.2.3 API. `opencode.host` in `package.json` and
  `SUPPORTED_HOST` in `src/constants.ts` both say exactly `>=2.2.3 <2.3.0`, never `^2.2.3`. `TESTED_HOSTS` in
  `src/constants.ts` is the one list of tested releases (2.2.3, 2.2.4 and 2.2.5): status calls only those tested, and the
  host and pack stages and CI run on each. Inside the range an untested release still starts.
- **Greenfield.** No legacy, migration code, compatibility shim, dual path or deprecated alias, and nothing dead. Delete
  rather than deprecate.
- **No peers, no runtime dependencies, no lifecycle scripts.** `@opencode/plugin`, `@opencode/sdk` and `@opencode/client`
  (whose types the host tests use) are devDependencies pinned to exactly `2.2.3`. Do not add another host version to the
  lockfile: the host stage installs the other tested SDKs into a temp folder.
- **Ship prebuilt, one file per entry.** `scripts/build.mjs` bundles `src/index.ts` and `src/tui.ts` with esbuild into the
  self-contained `dist/index.js` and `dist/tui.js`: no chunks, no relative imports, and only host-provided modules
  external. `tsc` only typechecks. No declaration files, `.tsx` or JSX.
- **One endpoint string.** `ENDPOINT` in `src/constants.ts` is the only place Notion's URL is written in code; the pack
  test points the built plugin at a fake by replacing its one occurrence in `dist/index.js`.
- **Default rules, not hooks.** Permissions come from rules inserted through `ctx.agent.transform` directly after each
  agent's base allow. A stricter agent is never weakened. An agent counts as guarded only with the whole block after its
  base allow. Agents that miss the rules are named in status with the per-agent fix, never patched, and the fix never goes
  in the top-level `permissions`.
- **Transforms are cheap, synchronous and never throw.** Record failures for status instead.
- **Errors** read `CODE: What happened. Next step: What to do.`, built by `notionError` or `errorText`. Codes have no
  service prefix; shared failures use the shared names (`HOST_UNTESTED`, `OPTIONS_INVALID`, `STATUS_UNAVAILABLE`,
  `SKILLS_INVALID`).
- **Status.** `src/status.ts` builds one model for `/notion-status`, the `/notion` dialog and the status RPC. The RPC keeps
  the fields every plugin of this family shares, `version`, `host` (`version`, `range`, `tested`), `state`,
  `unguardedAgents` and `nextStep`, under those names. It never shows OpenCode's text for a needed sign-in, cuts a failure's
  reason to one line of 160 characters with `src/redact.ts` (no credentials, URL queries or tokens), and names at most 20
  unknown tools, plain names only. A status it cannot read is the declared RPC error `unavailable`, with a next step.
  Status makes no Notion call: the workspace name and connection type come only from `notion-get-self` results the model or
  a script asked for.
- **One pinned scope, no client.** The registered server is `{ type, url, oauth: { scope: "default" } }`: the 401 names
  that scope, but OpenCode falls back to every advertised scope when a challenge names none, and Notion's metadata also
  lists the enterprise-managed `ema_issuer:manage`. A pinned `client_id` or `redirect_uri` would disable OpenCode's client
  ID metadata document. Only the tests' seam sets `oauth: false`.
- **A user's own server entry** is read for its type, URL and whether `oauth` is `false`, never its `headers`, which may
  hold an MCP token.
- **`src/notion-tools.ts` is the one record of Notion's tools**, and has no runtime imports. Everything else derives from
  it; `jelly.tools` and the skills are checked against it. Its names come from Notion's documentation, which gives no
  schemas, so `PARAMETERS` stays empty until a tool list from a signed-in server is recorded. `src/constants.ts` has no
  imports at all: `scripts/check.mjs` loads it with Node's type stripping.
- **Workspace content is other people's writing.** Tests, fixtures, docs and skills use only invented workspaces, people
  and pages. The skills label a Notion AI summary as Notion AI's, report what a meeting note says in their own words,
  route a Slack, Drive, GitHub, Linear or Granola question to that source's own plugin, treat page content as untrusted,
  and say whom a change reaches before it asks.
- **The `jelly` section** of `package.json` declares every known tool, the skills, the sign-in, a one-line `summary` and the
  `icon`, with only the keys Jelly reads: its contracts drop an unknown top-level key, and refuse an unknown key inside a
  tool, sign-in or `contributes` entry. `test/unit/jelly.test.ts` keeps it in step with the tool lists and the default
  rules.
- **The icon** is this family's own mark, from the family icon kit: `assets/icon.svg`, a neutral page with a folded
  corner on a slate tile, with the `icon-128.png` and `icon-256.png` rasters rendered from it, no Notion logo, shape or
  brand colour, because the plugin is unofficial. `opencode.icons` declares all three and `opencode.vendor` names
  Notion's domain, so a display app may fetch Notion's official logo from Notion's own site; the package carries no
  vendor marks. `scripts/check-icons.mjs` is the kit's check, copied verbatim, and is the one definition of a safe
  icon: it runs in the `icons` stage of `npm run check`.
- **TypeScript.** No enums, namespaces or parameter properties. `import type` for types, `.js` in relative imports.
- **The tools RPC.** `src/host/tools-rpc.ts` is a copy of a module shared by several plugins. Change only its block between
  the `PLUGIN-SPECIFIC` markers here; change the rest in the shared copy first. Its methods are every known tool in
  `src/notion-tools.ts`, by exact name and with its class, and never an unknown tool. A write or a denied tool is a
  method but runs only on a resolved `allow`. Keep the RPC id `notion.workspace.tools` and its method names stable,
  hyphens included: scripts call them by name.
- **Tests.** Unit tests use narrow `Pick<Plugin.Context, ...>` fakes. Host tests use the public `@opencode/sdk` with
  `OpenCode.create({ app: { version } })`, a loopback fake server and the temp root from `test/host/isolate.ts`. Every temp
  root of the host and pack tests is a git repository under the system's `/tmp`, never under `TMPDIR` or `HOME`, so OpenCode
  never finds a `.opencode` folder of whoever runs them; each stock server has its own port. Never sign in to Notion or call
  its API from a check.
- **Text.** Model-facing text and docs use plain language and describe what the code does now: no process narrative, test
  counts, machine-local paths, secrets or personal data.
- **Releases** come from a `v<version>` tag on `master`. The release workflow refuses a private package or a tag that
  differs from the version; no test or script checks `private`.
- **One check command.** `npm run check` passes before every commit. Never skip, weaken or delete a test to get green.

## Forbidden in this repository

`scripts/check-forbidden.mjs` enforces this list in `src/`, `test/`, `scripts/` and `dist/`:

- dispatch-lease, catalog-ownership and text-only markers, and tool `options.mcp` delegation;
- `Plugin.image` and profile images;
- imported OAuth grants;
- the V1 plugin API: `@opencode-ai/*` packages and hooks such as `tool.execute.before`, `chat.message` or
  `permission.ask`;
- the deprecated `ctx.generate.text` and `experimental.policies`;
- importing `@opencode/ai`;
- a permission hook, except the one `permission.hook("evaluate")` in `src/host/tools-rpc.ts` (and the bundle that inlines
  it), exactly once each: it turns an `ask` on one of the tools RPC's own script calls in flight into a deny, because no one
  can answer it, and touches nothing else;
- references to private host source or host checkouts;
- machine-local home and temp paths;
- `.tsx` or `.jsx` files in `dist/`.

The pack test also rejects anything in `dist/` other than the two bundles, any relative, dynamic or `require` import in
them, and any import of a module OpenCode does not provide.
