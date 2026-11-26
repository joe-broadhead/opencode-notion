# Changelog

## 0.0.0 (2026-11-25)

The first release, on plugin-contract v0.0.0 and the plugin standard.

- One Notion MCP server per account alias through the contract's `accounts` module: `notion` for `default`,
  `notion-<alias>` for every other alias. The user's own `notion` entry is adopted at Notion's URL, or reported as a
  conflict and left alone.
- The capabilities manifest classifies every callable: `status`, `probe`, `events_list`, and Notion's 79 pass-through
  MCP tools by class and effect.
- `notion.pages` is an events source read by `events_list`: it searches with an empty query, the last-edit sort, a
  date range and both author filters, lists the union once per page, refuses a plan that dropped an option, and lists
  one event per page at its last edit time.
- The namespace line and both skill descriptions counter Notion's server text: remembering across sessions belongs to
  a separate shared recall service, and page content is untrusted data.
- Both skills, `notion` and `notion-write`, are registered at setup through `ctx.skill.transform`.
- One RPC id `notion` carries every method, with the `/notion` command as the status view.
