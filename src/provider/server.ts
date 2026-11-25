import type { Mcp } from "@opencode/plugin"

/**
 * Notion's one MCP endpoint. This module is the only place the URL is written; `src/accounts.ts` passes the config to
 * `registerAccounts`, whose `server` factory is the only place a server is registered.
 */
export const NOTION_MCP_URL = "https://mcp.notion.com/mcp"

/**
 * The one OAuth scope a sign-in asks for. Pinned: Notion's protected-resource metadata also advertises
 * `ema_issuer:manage`, its enterprise-managed authorization scope, and OpenCode falls back to every advertised scope
 * when a challenge names none.
 */
export const OAUTH_SCOPE = "default"

/**
 * The remote MCP server config for one account's server name. No `client_id` or `redirect_uri`: either would stop
 * OpenCode signing in with its client ID metadata document.
 */
export function serverConfig(_name: string): Mcp.ServerConfig {
  return { type: "remote", url: NOTION_MCP_URL, oauth: { scope: OAUTH_SCOPE } }
}

/** Origin and path only, so a token in a query string never reaches status. */
export function displayUrl(url: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.origin}${parsed.pathname.replace(/\/+$/, "")}`
  } catch {
    return "an invalid URL"
  }
}
