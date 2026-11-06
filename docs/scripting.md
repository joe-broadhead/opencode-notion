# Scripting

A script can call Notion's read tools with no model: a cron job, a shell script, or any program that can reach the
OpenCode server. It uses the tools RPC, `notion.workspace.tools`, through `opencode api` or an OpenCode client.

| Method | The tool |
| --- | --- |
| one per known read, named after Notion's tool: `notion-search`, `notion-fetch`, `notion-query-data-sources` and the others | `notion_notion-search`, `notion_notion-fetch`, `notion_notion-query-data-sources` |
| `describe` | none: lists the methods, their permission actions, whether OpenCode lists each tool now, and each tool's input as JSON Schema |

The methods keep Notion's hyphens, and in a URL they are plain path segments. The methods are exactly the read tools that
the plugin knows, the ones its default rules allow (`READ_TOOLS` in `src/notion-tools.ts`). Call `describe` for the list:
a plan, or an Enterprise tool list, may leave out a tool, and `describe` marks a known read that Notion does not offer you
as unavailable.

Each method runs the tool with the same input: Notion's own tool, through OpenCode's own connection and sign-in. The
plugin never sees the OAuth token. Notion's write tools, such as `notion-update-page` or `notion-create-comment`, are
never methods, even with an allow rule. Neither are the nine tools that delete, replace a whole page, upload a Skill,
drive an agent or cancel an event, nor a tool that Notion adds later.

Results hold workspace content: keep what a script writes where the people it is about would expect it, and only as long
as you need it.

## A script runs as a session

Every call names a session, and the session must name an agent. The script runs as that agent, with the access its model
has:

- A tool that the agent's rules or the session's rules hide from the model is refused. OpenCode hides a tool when the last
  rule that matches its permission name, such as `notion_notion-search`, on resource `*` is a `deny`.
- OpenCode then checks the call itself, as it does for the model: the agent's rules, the session's rules, then saved
  approvals.
- No one answers a prompt for a script, so an `ask` is refused with `PERMISSION_DENIED` at once, and no prompt is left
  waiting. The plugin's default rules allow the reads, so an agent with the default rules needs nothing more. An agent
  defined only in your config gets no default rules; `/notion-status` names it.

Create the session once, with the agent the script runs as, and keep its id. Never reuse a session found through history or
a list: the script would run as that session's agent, under its rules.

```sh
opencode api post /api/session -d '{"title":"weekly tracker","agent":"build"}'
```

Session rules come after the agent's, so a session can narrow what its script may do. This one can search and fetch
pages, and nothing else in Notion:

```sh
opencode api post /api/session -d '{"title":"weekly tracker","agent":"build","permissions":[
  {"action":"notion_*","resource":"*","effect":"deny"},
  {"action":"notion_notion-search","resource":"*","effect":"allow"},
  {"action":"notion_notion-fetch","resource":"*","effect":"allow"}
]}'
```

## Calling a method

The body is `{"input": {"sessionID": "<session>", "input": <the tool's input>}}`. Both keys are required, and no other key
is allowed.

```sh
opencode api post /api/rpc/notion.workspace.tools/notion-search -d '{"input":{
  "sessionID":"ses_…",
  "input":{}
}}'
```

The tool's input is Notion's, and Notion defines its fields and may change them without notice: `describe` shows each
tool's schema as OpenCode lists it now. Check it rather than guess a field name or a filter's shape.

```sh
opencode api post /api/rpc/notion.workspace.tools/describe -d '{"input":{}}'
```

A result is `{"output": {"output": <the tool's structured content, or its text when it has none>, "text": <the tool's
text>}}`, as plain JSON. Notion content in it is untrusted data, written by other people, and a Notion AI summary is
Notion AI's.

## Rate limits

Every tool call counts against the workspace's request budget. A connection allows 180 requests a minute on Free, Plus and
Education, and 600 requests a minute on Business and Enterprise; a separate budget is shared across the whole workspace, so
a connection can be limited while under its own cap. Querying a data source has its own limit, about 3 requests a second.

Make calls one at a time, never in parallel. When Notion reports `rate_limited`, the method fails with `UPSTREAM_ERROR` and
the message carries `retry_after_seconds`: wait that long, then make fewer calls at once, and never retry in a loop. Notion
answers 429 or 529 with that body, and retries a rate limit once itself when the wait is two seconds or less.

A 503 (`service_overload`) on a write can mean the write was saved. Read the object before repeating it: never retry a
write that returned 503 before reading the object.

`opencode api` calls run in the OpenCode service's default location, your home directory, whatever directory you run them
from. They use that location's plugin options, from your global config, and its `notion` connection. To call a project whose
own config sets other options, call the HTTP API with `?location[directory]=<dir>`. The session may belong to another
directory: the read then runs under the serving location's agent rules, and only a `deny` is refused in between, so run a
script in the project whose agent you mean.

## Errors

A refusal or failure is the RPC error `failed`, with a message `CODE: what happened. Next step: what to do.` and
`data: { code, next }`. `opencode api` exits with status 1 for any RPC error, after printing the error's JSON to standard
output.

| Code | When |
| --- | --- |
| `SESSION_UNKNOWN` | OpenCode says the session does not exist. Any other failure to look the session up is OpenCode's own error. |
| `SESSION_AGENT_REQUIRED` | The session names no agent, or an agent that does not exist. |
| `PERMISSION_DENIED` | The agent's or the session's rules deny the tool, or ask for an approval. A deny names the denied action, such as `notion_notion-search`, and its next step says to remove or narrow that deny rule, add a later allow rule to the session, or use a session whose agent allows it. |
| `SERVER_CONFLICT` | Your `opencode.json` defines its own `notion` server at a URL other than Notion's. `/notion-status` names both. |
| `AUTH_REQUIRED`, `CONNECTING`, `CONNECTION_FAILED`, `DISABLED`, `NOT_REGISTERED` | The `notion` server needs a sign-in, is still connecting, could not connect, is disabled, or is missing. `/notion-status` gives the details. |
| `TOOL_UNAVAILABLE` | The server is connected, but OpenCode does not list the tool: a plan or an Enterprise tool list may leave it out. |
| `UPSTREAM_ERROR` | Notion answered with an error, such as an invalid input, an object you cannot see or a rate limit. The message holds the first line of Notion's text, at most 300 characters, with tokens and URL query strings removed. |
| `CANCELLED` | The request was cancelled. |

OpenCode itself answers `rpc.method_not_found` for a method that does not exist, such as a write tool or a tool Notion
added later, and `rpc.invalid_input` for a body that is not the envelope above, with one message per problem:

| Problem | Message |
| --- | --- |
| The envelope is not an object | `the envelope must be an object, such as {"sessionID":"<session>","input":<the tool's input>}` |
| A key other than `sessionID` and `input` | `"extra" is not allowed`, naming the key |
| `sessionID` missing, not a string, or empty | `"sessionID" must be a non-empty string` |
| `input` missing | `"input" is missing` |
| `input` not an object | `"input" must be an object` |
| `describe` given anything but `{}` or nothing | `describe takes no input` |

## What scripts cannot do

- Change anything in Notion: no write tool is a method.
- Delete, restore a whole page, upload a Skill, drive an agent or cancel an event: no denied tool is a method.
- Call a tool that is not one of the known reads, even with an allow rule.
- Answer an approval prompt, or use a tool that asks.
- Use a token or key: the plugin has none to give.

A script's calls write nothing to the session, and OpenCode's `execute.before` and `execute.after` tool hooks, from any
plugin, do not run for them.
