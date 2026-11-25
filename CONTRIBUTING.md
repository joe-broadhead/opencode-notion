# Contributing

Read [AGENTS.md](AGENTS.md) first: it lists the repository rules and the layout. The plugin follows the
[plugin standard](https://github.com/we-the-rebel-alliance/plugin-contract/blob/master/docs/plugin-standard.md).

## Set up

Node.js 24 is required; the real host test uses `@opencode/sdk` 2.4.1, which needs it.

```sh
npm ci --ignore-scripts
npm run check
```

`npm run check` runs, in order: `biome lint`, `tsc`, the build, `plugin-kit docs --check`, the unit, conformance and
host suites, `plugin-kit check` (T0/T1, the doc file set, forbidden patterns and the bundled-kit check) and the pack
suite. It stops at the first failure. Run one repository's full check at a time: the host and pack suites bind fixed
ports.

Shortcuts: `npm run typecheck`, `npm run build`, `npm test`, `npm run test:pack`, `npm run lint`, `npm run docs`.

## Try it in OpenCode

```sh
npm run build
```

Then list the folder in `plugins`, as an absolute path or a path relative to the config file, and restart OpenCode:

```json
{ "plugins": ["/path/to/notion-plugin"] }
```

## Fixtures

`fixtures/conformance.json` is computed by `test/conformance/` from a fake MCP boundary for the synthetic aliases `work`
and `personal`; it holds no real account, page or secret. `RECORD=1 npm test` writes it. Only the fixture is written:
`npm test` without `RECORD` fails on a difference instead of editing the file.

## Releases

The lead cuts releases after merge with `npx plugin-kit release 0.0.0`; CI publishes the GitHub release on the tag. Do
not tag or publish by hand.
