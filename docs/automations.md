# Automations

An events source is read with a cursor in OpenCode automation state. The suggested cadence is a hint for the
automation, not a schedule the plugin sets.

<!-- generated:automations -->
| Source | Method | Provider floor | Suggested | Signals |
|---|---|---|---|---|
| `notion.pages` | `tools.notion.events_list` | — | 10 min | — |
<!-- /generated:automations -->

## A timer that reads the pages source

Use an OpenCode automation with an `every` trigger and a Code Mode step. Keep the cursor in the automation's own state,
and pass it back on the next run.

```js
const saved = state.cursor
const page = await tools.notion.events_list({
  source: "pages",
  account: "work",
  ...(saved === undefined ? {} : { cursor: saved }),
})
for (const event of page.events) {
  // event.external_id, event.title, event.occurred_at, event.url; event.text is empty by design.
}
if (!page.failed?.length && page.gap === undefined) state.cursor = page.cursor
return state
```

- The cursor is opaque and bound to the source and the alias. Never move it between accounts; another alias's cursor is
  `CURSOR_INVALID`.
- A page with `failed[]` holds the cursor back: do not save `page.cursor` past it. A `gap` is the source's own
  `window-truncated` report; render it rather than inventing the edits it covers.
- `more: false` is not "done": a later run may list new edits, starting from the saved cursor.
- The first run without a cursor starts 24 hours back, or at `since`.
- The source refuses with `UNAVAILABLE` when the workspace's plan dropped the last-edit sort or the author filter. Do
  not fall back to an unsorted listing.
