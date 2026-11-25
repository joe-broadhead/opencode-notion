# Accounts

Accounts are held by the **mcp** mechanism: the vendor's MCP server holds each alias's sign-in, and OpenCode keys the
OAuth per server.

<!-- generated:accounts -->
Accounts are held by the **mcp** mechanism: the vendor's MCP server holds them.

The profile has no fields.
<!-- /generated:accounts -->

## One server per alias

| Alias | MCP server |
| --- | --- |
| `default` | `notion` |
| `work` | `notion-work` |
| `personal` | `notion-personal` |

The name is derived once from the plugin's name and the alias, so the same name is the server a person signs in to and
the server a pass-through tool belongs to. `opencode mcp auth notion-work` signs in the `work` alias.

Your own `mcp.servers.notion` is adopted unchanged when it points at Notion's URL; an entry at another URL, or a local
command, is reported in status and not replaced. The plugin reads only the entry's type, URL and whether `oauth` is
`false`; it never reads its headers.

## Picking an account

Pass `account: "<alias>"` on `probe` or `events_list`. With two aliases and none named, the call is refused with
`ACCOUNT_REQUIRED`, whose next step lists them; an alias the plugin does not serve is `ACCOUNT_UNKNOWN`. `status` takes
no account and lists every alias.

A cursor issued for one alias is refused for another with `CURSOR_INVALID`. A pass-through MCP tool takes no `account`:
the alias is the server (`notion-work_notion-search`), so the tool is reached through that alias's own sign-in and rules.
