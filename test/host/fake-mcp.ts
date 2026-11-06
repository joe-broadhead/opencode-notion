// A loopback Streamable-HTTP MCP server. By default it lists one known read, one known write, every denied tool and one
// tool the plugin has never seen. With `catalog: "notion"` it lists every tool in src/notion-tools.ts and the new tool.
// It answers JSON-RPC POSTs with plain JSON (no SSE stream) and records every tool call, its path and every request
// header. A `tools/call` answers with the tool's name, the path and its arguments as structured content; for a `query`
// that starts with "text", with text alone; or, for a `query` that starts with "fail", with an upstream error
// (`isError`) whose first line holds a signed URL.
//
// While `challenge` is set, every MCP request gets 401 with the bearer challenge Notion's server sends, and the same
// server plays Notion's sign-in server: protected-resource metadata, and an authorization server that advertises a
// client ID metadata document, so OpenCode signs in with its own client URL and registers nothing. It is also an
// LM Studio-compatible model API for a scripted model (`model.script`), so a host test can run a real session turn that
// calls Notion's tools.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import type { AddressInfo } from "node:net"
import { DENY_TOOLS, READ_TOOLS, WRITE_TOOLS } from "../../src/notion-tools.js"

const schema = { type: "object", properties: { query: { type: "string" } } }
/** A tool the plugin has never seen. */
export const NEW_TOOL = { name: "shiny_new_tool", description: "A tool added upstream after the tool lists were written", annotations: {} }
const tool = (name: string, readOnlyHint: boolean) => ({ name, description: `Notion ${name}`, annotations: { readOnlyHint }, inputSchema: schema })
/** The read and write the default list offers. */
export const SAMPLE_READ = "notion-search"
export const SAMPLE_WRITE = "notion-create-comment"
/** The account read the plugin captures status from. */
export const ACCOUNT_READ = "notion-get-self"
const TOOLS = [tool(SAMPLE_READ, true), tool(ACCOUNT_READ, true), ...WRITE_TOOLS.map((name) => tool(name, false)), ...DENY_TOOLS.map((name) => tool(name, false)), { ...NEW_TOOL, inputSchema: schema }]
const CATALOG = [...READ_TOOLS.map((name) => tool(name, true)), ...[...WRITE_TOOLS, ...DENY_TOOLS].map((name) => tool(name, false)), { ...NEW_TOOL, inputSchema: schema }]

/** The upstream error a "fail" query gets: two lines, the first with a signed URL. */
export const UPSTREAM_FAILURE = "Notion refused https://www.notion.so/files/a.pdf?signature=fake-signature-123 for this input\nTraceback: second line"

/** The scope Notion's challenge names, and the only one this plugin ever asks for. */
export const CHALLENGE_SCOPE = "default"
/**
 * Notion's protected-resource metadata advertises both its resource scope and its enterprise-managed authorization
 * scope. OpenCode falls back to this whole list only when the challenge names no scope: see docs/architecture.md.
 */
export const METADATA_SCOPES = [CHALLENGE_SCOPE, "ema_issuer:manage"] as const
/** The account read's invented answer: a workspace and a person. */
export const SELF = { object: "user", workspace: { id: "1111", name: "Acme Robotics" }, user: { object: "user", type: "person", id: "2222", name: "Jane Doe" } }
/**
 * The client ID metadata document OpenCode sends as its client ID when it registers nothing. Pinned here only to check
 * the request; the plugin never sets it.
 */
export const CLIENT_URL = "https://opencode.ai/oauth/opencode/client.json"

export interface FakeMcpOptions {
  /** `notion` lists every tool the plugin knows, and the new tool. */
  readonly catalog?: "notion"
  /** List no tools at all, as a server does for its first seconds after connecting. */
  readonly emptyTools?: boolean
  /**
   * Whether the token endpoint issues a refresh token. Without one, a 401 later needs a new sign-in and leaves the
   * credential in place.
   */
  readonly refreshTokens?: boolean
  /** Whether the 401 names a scope. Notion's does; without it OpenCode falls back to every advertised scope. */
  readonly challengeScope?: boolean
}

/** The scripted model's id, as the fake's model API lists it. */
export const MODEL_ID = "fake-model"

/** A tool call the scripted model makes: the n-th call follows n tool results. */
interface ScriptedCall {
  readonly tool: string
  readonly arguments: Record<string, unknown>
}

export interface FakeMcp {
  readonly url: string
  /**
   * While true, every MCP request gets 401 with a bearer challenge, as Notion's server answers before a sign-in or
   * after its tokens are revoked. The sign-in server and the model API keep answering.
   */
  challenge: boolean
  /** The server's origin; `${origin}/v1` is the model API and `${origin}/oauth` the authorization server. */
  readonly origin: string
  readonly model: {
    /** The calls the model makes, one per turn, before it answers with text. */
    script: ScriptedCall[]
    /** Every chat request body, in order. */
    readonly requests: unknown[]
  }
  /** Every token request's form, in order. */
  readonly tokens: Record<string, string>[]
  /** Tool names called, in order. */
  readonly calls: string[]
  /** Each tool call with the path it was sent to, in order. */
  readonly called: { readonly tool: string; readonly path: string }[]
  /** The `x-notion-test` header of every MCP request, to tell whose server config the host used. */
  readonly markers: (string | undefined)[]
  /** The `authorization` header of every MCP request. */
  readonly authorizations: (string | undefined)[]
  /** Every authorization endpoint request's query, in order. */
  readonly authorizeRequests: Record<string, string>[]
  close(): Promise<void>
}

type Message = { jsonrpc: "2.0"; id?: number | string; method: string; params?: { protocolVersion?: string; name?: string; arguments?: { query?: unknown } } }

export async function startFakeMcp(options: FakeMcpOptions = {}): Promise<FakeMcp> {
  const calls: string[] = []
  const called: { tool: string; path: string }[] = []
  const markers: (string | undefined)[] = []
  const authorizations: (string | undefined)[] = []
  const authorizeRequests: Record<string, string>[] = []
  const tokens: Record<string, string>[] = []
  let codes = 0
  const answer = (message: Message, path: string) => {
    const reply = (result: unknown) => ({ jsonrpc: "2.0", id: message.id, result })
    switch (message.method) {
      case "initialize":
        return reply({ protocolVersion: message.params?.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: "fake-notion", version: "0.0.0" } })
      case "tools/list":
        return reply({ tools: options.emptyTools ? [] : options.catalog === "notion" ? CATALOG : TOOLS })
      case "tools/call": {
        const name = message.params?.name ?? ""
        calls.push(name)
        called.push({ tool: name, path })
        const args = message.params?.arguments ?? {}
        if (name === "notion-get-self") return reply({ content: [{ type: "text", text: JSON.stringify(SELF) }], structuredContent: SELF })
        if (String(args.query ?? "").startsWith("fail")) return reply({ content: [{ type: "text", text: UPSTREAM_FAILURE }], isError: true })
        if (String(args.query ?? "").startsWith("text")) return reply({ content: [{ type: "text", text: `text from ${name}` }] })
        return reply({ content: [{ type: "text", text: `called ${name}` }], structuredContent: { tool: name, path, arguments: args } })
      }
      case "ping":
        return reply({})
      default:
        return { jsonrpc: "2.0", id: message.id, error: { code: -32601, message: `Method not found: ${message.method}` } }
    }
  }
  const model = { script: [] as ScriptedCall[], requests: [] as unknown[] }
  // Filled once the server listens; the request handler reads `challenge`, `url` and `origin` from it.
  const fake = { challenge: false } as FakeMcp
  /**
   * One streamed chat completion. A request that offers tools is an agent turn: after n tool results the model makes
   * the n-th scripted call, then answers "Done.". Any other request, such as a title, gets text.
   */
  const chat = (response: ServerResponse, body: string) => {
    const request = JSON.parse(body) as { tools?: unknown[]; messages?: { role: string }[] }
    model.requests.push(request)
    const results = (request.messages ?? []).filter((message) => message.role === "tool").length
    const call = request.tools?.length ? model.script[results] : undefined
    const chunk = (delta: unknown, finish: string | null) =>
      `data: ${JSON.stringify({ id: "chatcmpl-fake", object: "chat.completion.chunk", created: 0, model: MODEL_ID, choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`
    const usage = `data: ${JSON.stringify({ id: "chatcmpl-fake", object: "chat.completion.chunk", created: 0, model: MODEL_ID, choices: [], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })}\n\n`
    const delta = call
      ? { role: "assistant", tool_calls: [{ index: 0, id: `call_${results + 1}`, type: "function", function: { name: call.tool, arguments: JSON.stringify(call.arguments) } }] }
      : { role: "assistant", content: "Done." }
    response.writeHead(200, { "content-type": "text/event-stream" })
    response.end(`${chunk(delta, null)}${chunk({}, call ? "tool_calls" : "stop")}${usage}data: [DONE]\n\n`)
  }
  /** Notion's sign-in server, in its shape: the resource's metadata, and an authorization server that takes CIMD. */
  const signIn = async (request: IncomingMessage, response: ServerResponse, route: string) => {
    const json = (status: number, body: unknown) => void response.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body))
    if (route.startsWith("/.well-known/oauth-protected-resource")) {
      return json(200, { resource: fake.url, authorization_servers: [fake.origin], scopes_supported: [...METADATA_SCOPES], bearer_methods_supported: ["header"] })
    }
    if (["/.well-known/oauth-authorization-server", "/.well-known/openid-configuration"].includes(route)) {
      return json(200, {
        issuer: fake.origin,
        authorization_endpoint: `${fake.origin}/oauth/authorize`,
        token_endpoint: `${fake.origin}/oauth/token`,
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code", "refresh_token"],
        code_challenge_methods_supported: ["S256"],
        token_endpoint_auth_methods_supported: ["none", "client_secret_basic", "client_secret_post"],
        scopes_supported: [...METADATA_SCOPES],
        // Notion advertises this and lists `none`, so OpenCode signs in with its client metadata document.
        client_id_metadata_document_supported: true,
      })
    }
    // Like a signed-in browser: the authorization endpoint sends the loopback callback a code, and the token endpoint
    // exchanges it for an access token and, unless this fake withholds it, a refresh token.
    if (route === "/oauth/authorize") {
      const query = Object.fromEntries(new URL(request.url ?? "/", "http://127.0.0.1").searchParams)
      authorizeRequests.push(query)
      const target = new URL(query.redirect_uri ?? `${fake.origin}/nowhere`)
      target.searchParams.set("code", `fake-code-${++codes}`)
      if (query.state) target.searchParams.set("state", query.state)
      return void response.writeHead(302, { location: target.toString() }).end()
    }
    if (route === "/oauth/token" && request.method === "POST") {
      const form = Object.fromEntries(new URLSearchParams(await read(request)))
      tokens.push(form)
      // While the server challenges, a refresh is refused like a revoked grant: the person must sign in again.
      if (fake.challenge && form.grant_type === "refresh_token") return json(400, { error: "invalid_grant" })
      return json(200, {
        access_token: `fake-access-${tokens.length}`,
        token_type: "Bearer",
        expires_in: 3600,
        ...(options.refreshTokens === false ? {} : { refresh_token: `fake-refresh-${tokens.length}` }),
        scope: CHALLENGE_SCOPE,
      })
    }
    return json(404, { error: "not_found" })
  }
  const server = createServer(async (request, response) => {
    const route = new URL(request.url ?? "/", "http://127.0.0.1").pathname
    if (route === "/api/v1/models") {
      const models = [{ type: "llm", key: MODEL_ID, display_name: "Fake model", loaded_instances: [], max_context_length: 32_000, capabilities: { vision: false, trained_for_tool_use: true } }]
      return void response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ models }))
    }
    if (route === "/v1/chat/completions") return chat(response, await read(request))
    if (route.startsWith("/.well-known/") || route.startsWith("/oauth")) return signIn(request, response, route)
    markers.push(header(request, "x-notion-test"))
    authorizations.push(header(request, "authorization"))
    if (fake.challenge) {
      const metadata = `${fake.origin}/.well-known/oauth-protected-resource/mcp`
      return void response
        .writeHead(401, { "content-type": "application/json", "www-authenticate": `Bearer resource_metadata="${metadata}"${options.challengeScope === false ? "" : `, scope="${CHALLENGE_SCOPE}"`}` })
        .end(JSON.stringify({ error: "invalid_token" }))
    }
    if (request.method !== "POST") return void response.writeHead(405, { allow: "POST" }).end()
    const body = JSON.parse(await read(request)) as Message | Message[]
    const replies = (Array.isArray(body) ? body : [body]).filter((message) => message.id !== undefined).map((message) => answer(message, route))
    if (!replies.length) return void response.writeHead(202).end()
    response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(Array.isArray(body) ? replies : replies[0]))
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const { port } = server.address() as AddressInfo
  Object.assign(fake, {
    url: `http://127.0.0.1:${port}/mcp`,
    origin: `http://127.0.0.1:${port}`,
    model,
    tokens,
    calls,
    called,
    markers,
    authorizations,
    authorizeRequests,
    close: () => new Promise<void>((resolve) => (server.closeAllConnections(), server.close(() => resolve()))),
  })
  return fake
}

const header = (request: IncomingMessage, name: string) => [request.headers[name]].flat()[0]

async function read(request: IncomingMessage) {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString("utf8")
}
