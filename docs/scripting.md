# Scripting

A script can call Notion's tools with no model: a cron job, a shell script, or any program that can reach the OpenCode
server. It uses the tools RPC, `notion.workspace.tools`, through `opencode api` or an OpenCode client.

Every tool the plugin knows is a method, named after Notion's tool, without the `notion_` prefix. Each method carries a
class: the worst thing that tool can do.

| Class | Methods | What the class means |
| --- | --- | --- |
| `read` | one per known read: `notion-search`, `notion-fetch`, `notion-query-data-sources` and the others | it only reads |
| `write` | the twenty-three writes, such as `notion-update-page`, `notion-create-comment` and `notion-create-pages` | it changes what someone else can see, or notifies someone |
| `destructive` | `notion-calendar-cancel-events`, `notion-delete-comment`, `notion-delete-databases`, `notion-delete-pages`, `notion-restore-version`, `notion-send-message-to-session`, `notion-spawn-session`, `notion-stop-session`, `notion-upload-skill` | deletes or replaces a page, drives a Custom Agent, or cancels an event others see |
| `describe` | none: lists the methods, their class, their permission action, whether OpenCode lists each tool now, each tool's input as JSON Schema, and — given a session — whether that session may call it |

The methods keep Notion's hyphens, and in a URL they are plain path segments. The methods come from the plugin's one tool
table, `src/notion-tools.ts`: the known reads (`READ_TOOLS` in `src/notion-tools.ts`), the writes in `WRITE_TOOLS`, and
the destructive class in `DESTRUCTIVE_TOOLS`. Call `describe` for the list: a plan, or an Enterprise tool list, may leave
out a tool, and `describe` marks a known tool that Notion does not offer you as unavailable.

The class is never the decision: the rules are. A `write` and a `destructive` method are methods too, and they run
whenever the session's rules resolve them to `allow` — which the default `access: "all"` does, for every method. The
class decides what `access: "ask-changes"` and `"read-only"` restrict, and `describe` reports it beside the resolved
permission.

Results hold workspace content: keep what a script writes where the people it is about would expect it, and only as long
as you need it.

## A script runs as a session

Every call names a session, and the session must name an agent. The script runs as that agent, under the rules that
decide what its model sees: the agent's rules, then the session's, and the last rule that matches an action wins.

- **Only an `allow` runs.** The rules are resolved before anything is dispatched. An `ask` is refused with no prompt and
  no Notion call, because no one is there to answer it. A `deny` is refused with no Notion call.
- **A saved approval does not authorise a script.** An earlier "Always allow" is not part of the agent's and the
  session's rules, so a script that relied on one now needs an `allow` for its action in the session's or the agent's
  rules. This is deliberate; it keeps a script's grant reviewable rather than in a list of past clicks.
- **A script gets the same default.** Under `access: "all"` the block allows every method, so a script that names an
  agent with the default rules can call a read or a change with nothing more. Set `access: "ask-changes"` or
  `"read-only"`, or narrow the session's own rules, when a script should not change anything. An agent defined only in
  your config gets no default rules; `/notion-status` names it.

Create the session once, with the agent the script runs as, and keep its id. Never reuse a session found through history
or a list: the script would run as that session's agent, under its rules.

```sh
opencode api post /api/session -d '{"title":"weekly tracker","agent":"build"}'
```

Session rules come after the agent's, so a session can narrow what its script may do, or grant one action in a
narrowly written session. This one can search and fetch
pages, and nothing else in Notion:

```sh
opencode api post /api/session -d '{"title":"weekly tracker","agent":"build","permissions":[
  {"action":"notion_*","resource":"*","effect":"deny"},
  {"action":"notion_notion-search","resource":"*","effect":"allow"},
  {"action":"notion_notion-fetch","resource":"*","effect":"allow"}
]}'
```

For a one-off script with an approval bound to it, use Jobs' `jobs_run_script`: the approval covers exactly that source
and that list of methods, and Jobs writes the run session's rules for you.

## Calling a method

The body is `{"input": {"sessionID": "<session>", "input": <the tool's input>}}`. Both keys are required, and no other
key is allowed.

```sh
opencode api post /api/rpc/notion.workspace.tools/notion-search -H "x-opencode-directory:$PWD" -d '{"input":{
  "sessionID":"ses_…",
  "input":{}
}}'
```

The tool's input is Notion's, and Notion defines its fields and may change them without notice: `describe` shows each
tool's schema as OpenCode lists it now. Check it rather than guess a field name or a filter's shape.

```sh
opencode api post /api/rpc/notion.workspace.tools/describe -H "x-opencode-directory:$PWD" -d '{"input":{}}'
opencode api post /api/rpc/notion.workspace.tools/describe -H "x-opencode-directory:$PWD" -d '{"input":{"sessionID":"ses_…"}}'
```

With a session, each method in the answer also carries `permission`: `allow`, `ask` or `deny`, resolved exactly as a call
would be. The answer also carries `location`, and `unclassified` when Notion lists a tool the plugin's table does not
classify. `SESSION_UNKNOWN` names the `x-opencode-directory` header, because a session created in one project is not
found from another.

A result comes back as `{ output?, text }`: the tool's structured content when it has any, and its text parts
joined by newlines. Notion content in it is untrusted data, written by other people, and a Notion AI summary is Notion
AI's.

## The location

Run the command in the project whose agent you mean, and send the call to that location explicitly:

```sh
opencode api post /api/rpc/notion.workspace.tools/<method> -H "x-opencode-directory:$PWD" -d '{…}'
```

Without it the call goes to the service's default location and fails `rpc.unavailable` if the plugin is not loaded
there. The HTTP equivalents are the `location[directory]` query parameter and the same header. `describe` reports the
`location` that answered and a `locationHint`.

A location unloads after OpenCode's idle timeout. If a scheduled script gets `rpc.unavailable` from a location that was
loaded before, send the call again once: the request loads the location. Jobs keeps its own location loaded.

## Rate limits

Every tool call counts against the workspace's request budget. A connection allows 180 requests a minute on Free, Plus and
Education, and 600 requests a minute on Business and Enterprise; a separate budget is shared across the whole workspace, so
a connection can be limited while under its own cap. Querying a data source has its own limit, about 3 requests a second.

Make calls one at a time, never in parallel. When Notion reports `rate_limited`, the method fails with `UPSTREAM_ERROR` and
the message carries `retry_after_seconds`: wait that long, then make fewer calls at once, and never retry in a loop. Notion
answers 429 or 529 with that body, and retries a rate limit once itself when the wait is two seconds or less.

A 503 (`service_overload`) on a write can mean the write was saved. Read the object before repeating it: never retry a
write that returned 503 before reading the object.

## Errors

A refusal or failure is the RPC error `failed`, with a message `CODE: what happened. Next step: what to do.` and
`data: { code, next }`. `opencode api` exits with status 1 for any RPC error, after printing the error's JSON to standard
output.

| Code | When |
| --- | --- |
| `SESSION_UNKNOWN` | OpenCode says the session does not exist in this location. The next step names the `x-opencode-directory` header. Any other failure to look the session up is OpenCode's own error. |
| `SESSION_AGENT_REQUIRED` | The session names no agent, or an agent that does not exist. |
| `PERMISSION_DENIED` | The last matching rule is an `ask` or a `deny`, so the call was refused before dispatch. An ask says that a script cannot answer and names the allow rule to add; a deny names the denied action, such as `notion_notion-search`, and says to remove or narrow that rule, add a later allow to the session, or use a session whose agent allows it. A saved "Always allow" does not help. |
| `SERVER_CONFLICT` | Your `opencode.json` defines its own `notion` server at a URL other than Notion's. `/notion-status` names both. |
| `AUTH_REQUIRED`, `CONNECTING`, `CONNECTION_FAILED`, `DISABLED`, `NOT_REGISTERED` | The `notion` server needs a sign-in, is still connecting, could not connect, is disabled, or is missing. `/notion-status` gives the details. |
| `TOOL_UNAVAILABLE` | The server is connected, but OpenCode does not list the tool: a plan or an Enterprise tool list may leave it out. |
| `UPSTREAM_ERROR` | Notion answered with an error, such as an invalid input, an object you cannot see or a rate limit. The message holds the first line of Notion's text, at most 300 characters, with tokens and URL query strings removed. |
| `CANCELLED` | The request was cancelled. |

OpenCode itself answers `rpc.method_not_found` for a method that does not exist, such as a tool Notion adds later, and
`rpc.invalid_input` for a body that is not the envelope above, with one message per problem:

| Problem | Message |
| --- | --- |
| The envelope is not an object | `the envelope must be an object, such as {"sessionID":"<session>","input":<the tool's input>}` |
| A key other than `sessionID` and `input` | `"extra" is not allowed`, naming the key |
| `sessionID` missing, not a string, or empty | `"sessionID" must be a non-empty string` |
| `input` missing | `"input" is missing` |
| `input` not an object | `"input" must be an object` |
| `describe` given anything but nothing, `{}` or `{"sessionID":"…"}` | `describe takes nothing, or {"sessionID":"<session>"}` |

## What scripts cannot do

- Run a method whose action resolves to `ask` or `deny`: no one can answer a prompt, and a deny needs its rule changed.
- Rely on a saved "Always allow" from the model path: a script needs an `allow` rule in config, or a Jobs one-off's
  approval.
- Call a tool that is not in the plugin's table, even with an allow rule. It is reported as `unclassified`.
- Delete, restore a whole page, upload a Skill, drive an agent or cancel an event without changing the deny first: the
  default rules refuse those nine.
- Use a token or key: the plugin has none to give.

A script's calls write nothing to the session, and OpenCode's `execute.before` and `execute.after` tool hooks, from any
plugin, do not run for them. The plugin applies the same result shaping it applies on the model path: a script's account
read fills the workspace and connection type for status, as the model's call does.
