# Contributing

Read [AGENTS.md](AGENTS.md) first: it lists the rules for this repository and the APIs that must never appear in it.
[docs/architecture.md](docs/architecture.md) explains how the plugin works.

## Set up

You need Node.js 24, npm and [Bun](https://bun.sh). CI uses Node 24 and Bun 1.4.4, the Bun inside OpenCode 2.4.1.

```sh
npm ci --ignore-scripts
```

### Run your checkout in OpenCode

```sh
npm run build
```

Then list the folder in `plugins`, as an absolute path or a path relative to the config file that contains it, and restart
OpenCode. One entry loads both the server part and the terminal UI part. Run `npm run build` again after you pull changes.

```json
{
  "plugins": ["/path/to/notion-plugin"]
}
```

## Check

One command runs every check, in order, and stops at the first failure:

```sh
npm run check
```

| Stage | What it does |
| --- | --- |
| `typecheck` | `tsc --noEmit` over `src/` and `test/`, strict, with unused names as errors |
| `unit` | `bun test ./test/unit`: every module in `src/`, the docs' counts and error table, the model-text budgets and the legacy declaration |
| `conformance` | `npm run conformance`: the source contract's conformance kit over the pages source, against the fake Notion in `test/support/fake-notion.ts`; writes `reports/conformance-report.json` and fails unless it is ok |
| `kit` | `node --test scripts/release-kit.test.mjs`: the copied release kit's own tests |
| `build` | `node scripts/build.mjs`: deletes `dist/` and bundles `src/index.ts` and `src/tui.ts` with esbuild into the self-contained `dist/index.js` and `dist/tui.js` |
| `icons` | `node scripts/check-icons.mjs`: the SVG is clean and exact, the 128 and 256 rasters exist, and `exports` and `files` agree |
| `host` | builds, then `bun test ./test/host`: the plugin inside an embedded OpenCode 2.4.1 host from the locked `@opencode/sdk` |
| `pack` | `bun test ./test/pack`: builds, packs and installs the package, imports both entry points, and loads it in stock OpenCode 2.4.1 |
| `forbidden` | `node scripts/check-forbidden.mjs`: scans `src/`, `test/`, `scripts/` and `dist/` for forbidden APIs and machine-local paths |
| `copies` | `node scripts/check-copies.mjs`: the declaration test kit, the legacy setting rules and the release kit's files match the copies every plugin carries |
| `lint:actions` | `actionlint` over the workflows, when it is on PATH |
| `whitelist` | Checks `package.json` against the approved package shape, and that `dist/` holds exactly `index.js` and `tui.js` |

To run some stages only, name them; they run in the order given:

```sh
node scripts/check.mjs typecheck unit
```

Shortcuts: `npm run typecheck`, `npm run build`, `npm test` (the `unit` stage), `npm run test:host`, `npm run test:pack`,
`npm run lint` (the `forbidden` stage) and `npm run drift` (the tool-table reconcile).

`TESTED_HOSTS` in `src/constants.ts` is the one list of tested OpenCode releases: 2.4.1. The host and pack stages, status
and CI all take their versions from it. Add a release there, and to the README's requirements, when every check passes on
it.

The host stage starts an embedded OpenCode host in a temporary home folder, with a local fake of Notion's MCP server and
sign-in server. A request to any address other than the local machine fails the test. It runs on the locked
`@opencode/sdk`; to try another SDK, install it in a separate folder and point `HOST_SDK_DIR` at it:

```sh
mkdir ../sdk-next && cd ../sdk-next && npm init -y && npm install @opencode/sdk@2.4.2 --ignore-scripts && cd -
HOST_SDK_DIR=../sdk-next node scripts/check.mjs host
```

Every temporary folder of the host and pack stages is a git repository under the system's `/tmp`, never under `TMPDIR` or
your home folder.

The pack stage needs network access to the npm registry. It checks that the tarball contains exactly the `files` whitelist,
installs it with scripts disabled, and loads it in stock OpenCode.

## Reconcile Notion's tool list

Notion adds and changes tools without notice. The tool table in `src/notion-tools.ts` comes from Notion's documentation
and a live capture; the fake server and `test/unit/notion-live-tools.json` mirror it.

1. Save the server's `tools/list` from a signed-in connection to `test/unit/notion-live-tools.json`.
2. Run `npm run drift -- --strict`. It reports a tool in the list with no class, one in the table the list does not serve,
   and input parameters the table does not record.
3. Classify each new tool in `READ_TOOLS`, `WRITE_TOOLS` or `DESTRUCTIVE_TOOLS`, update `PARAMETERS`, `jelly.tools` in
   `package.json`, and any skill text that names a changed tool.
4. Run `npm run check`.

A plan or an Enterprise tool list legitimately omits tools; `drift` reports those separately and does not fail them.

## Release

Releases are cut from a `master` commit whose CI passed, by the workflow in `.github/workflows/release.yml`, with the
owner's approval. Do not tag or publish by hand. The plugin restarts at `0.0.0`; the plugin-contract release will replace
this release kit and the `jelly` and `sources` package keys.
