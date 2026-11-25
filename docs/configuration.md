# Configuration

The options and their defaults, generated from `capabilities.options`.

<!-- generated:configuration -->
| Option | Type | Default | Description |
|---|---|---|---|
| `access` | `all` \| `ask-changes` \| `read-only` | `"all"` | How much the plugin's methods may do. |
| `accounts` | object | — | One empty profile per account alias; the vendor's MCP server holds each alias's sign-in. |
| `allowUntestedHost` | boolean | `false` | Start outside the tested OpenCode range. |
<!-- /generated:configuration -->

## Examples

One account, the default:

```json
{ "access": "ask-changes" }
```

Two aliases, each empty because the vendor's MCP server holds the sign-in:

```json
{ "accounts": { "work": {}, "personal": {} } }
```

An alias map only names the accounts; it never holds a token. Sign each alias in with `/connect` or
`opencode mcp auth notion-work`, and the vendor's server keeps the credential.

`allowUntestedHost` starts the plugin outside `>=2.4.1 <2.5.0` and marks the host untested in status. It does not
change what the plugin may do.
