// src/tui.ts
import { Plugin } from "@opencode/plugin/tui";

// src/redact.ts
var SECRETS = [
  [/\b(bearer|basic|token)\s+[\w.~+/=-]{8,}/gi, "$1 [redacted]"],
  [/\b([\w-]*(?:api[_-]?key|access[_-]?key|private[_-]?key|token|secret|password|signature|credential)["']?\s*[:=]\s*)["']?[^\s"'&,;]+["']?/gi, "$1[redacted]"],
  [/\beyJ[\w-]{4,}\.[\w-]{4,}\.[\w-]{4,}/g, "[redacted]"],
  [/\b(?:tvly|sk|pk|rk|ghp|gho|ghu|ghs|ghr|github_pat|glpat|xox[abposr]|lin_api|lin_oauth)[-_][\w-]{8,}/gi, "[redacted]"],
  [/[\w+=-]{40,}/g, "[redacted]"]
];
var REASON_LIMIT = 160;
var CONTROLS = /[\u0000-\u001f\u007f-\u009f]+/g;
var BIDI = /[‎‏‪-‮⁦-⁩]/g;
var withoutUrlSecrets = (text) => text.replace(/\bhttps?:\/\/[^\s"'<>]+/gi, (url) => url.replace(/^(https?:\/\/)[^/?#@]*@/i, "$1").replace(/[?#].*$/s, ""));
var oneLine = (text) => text.replace(BIDI, "").replace(CONTROLS, " ").replace(/\s+/g, " ").trim();
function cut(text, limit) {
  const characters = Array.from(text);
  return characters.length > limit ? `${characters.slice(0, limit - 1).join("")}\u2026` : text;
}
function shortReason(text) {
  const reason = oneLine(SECRETS.reduce((value, [pattern, replacement]) => value.replace(pattern, replacement), withoutUrlSecrets(text))).replace(/[.\s]+$/, "");
  if (reason === "") return void 0;
  return cut(reason, REASON_LIMIT);
}

// src/tui.ts
import { createSignal } from "solid-js";

// src/constants.ts
var PLUGIN_ID = "notion.workspace";
var SERVER_NAME = "notion";
var SUPPORTED_HOST = ">=2.2.3 <2.3.0";
var TESTED_HOSTS = ["2.2.3", "2.2.4", "2.2.5", "2.2.6"];
var errorText = (code, message, nextStep) => `${code}: ${message} Next step: ${nextStep}`;

// src/host-version.ts
var RELEASE = /^(\d+)\.(\d+)\.(\d+)$/;
var parse = (version) => RELEASE.exec(version)?.slice(1).map(Number);
var [LOWEST, ABOVE] = SUPPORTED_HOST.split(" ").map((bound) => parse(bound.replace(/^[<>]=?/, "")));
var compare = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
function isSupportedHost(version) {
  const parts = parse(version);
  return parts !== void 0 && compare(parts, LOWEST) >= 0 && compare(parts, ABOVE) < 0;
}

// src/notion-tools.ts
var READ_TOOLS = [
  "notion-ai-search",
  "notion-calendar-list-calendar-resources",
  "notion-calendar-list-calendars",
  "notion-calendar-list-contacts",
  "notion-calendar-list-coworkers-events",
  "notion-calendar-list-events",
  "notion-connector-search",
  "notion-download-attachment",
  "notion-download-skill",
  "notion-fetch",
  "notion-get-async-task",
  "notion-get-comments",
  "notion-get-enabled-skills",
  "notion-get-file-download-urls",
  "notion-get-groups",
  "notion-get-self",
  "notion-get-session-status",
  "notion-get-setup-guide",
  "notion-get-sidebar-tabs",
  "notion-get-suggested-edit",
  "notion-get-teams",
  "notion-get-tool-access",
  "notion-get-users",
  "notion-get-version-changes",
  "notion-list-favorite-pages",
  "notion-list-page-backlinks",
  "notion-list-private-pages",
  "notion-list-recent-pages",
  "notion-list-session-events",
  "notion-list-shared-pages",
  "notion-memory-search",
  "notion-query-data-sources",
  "notion-query-meeting-notes",
  "notion-query-multiple-data-sources",
  "notion-query-sessions",
  "notion-read-session-event",
  "notion-search",
  "notion-search-agents",
  "notion-search-sessions",
  "notion-view-version",
  "notion-wait-session"
];
var WRITE_TOOLS = [
  "notion-calendar-create-events",
  "notion-calendar-update-events",
  "notion-complete-mcp-setup",
  "notion-convert-page-to-skill",
  "notion-convert-to-meetings-database",
  "notion-create-attachment",
  "notion-create-comment",
  "notion-create-database",
  "notion-create-file-upload",
  "notion-create-folder",
  "notion-create-meeting-note",
  "notion-create-pages",
  "notion-create-suggested-edit",
  "notion-create-view",
  "notion-duplicate-page",
  "notion-link-meeting-note-to-calendar-event",
  "notion-move-pages",
  "notion-resolve-suggested-edit",
  "notion-restore-pages",
  "notion-set-comment-reaction",
  "notion-set-discussion-resolved",
  "notion-update-comment",
  "notion-update-data-source",
  "notion-update-folder",
  "notion-update-page",
  "notion-update-page-favorites",
  "notion-update-sidebar-tabs",
  "notion-update-skill-settings",
  "notion-update-view"
];
var DESTRUCTIVE_TOOLS = [
  "notion-calendar-cancel-events",
  "notion-delete-comment",
  "notion-delete-databases",
  "notion-delete-pages",
  "notion-restore-version",
  "notion-send-message-to-session",
  "notion-spawn-session",
  "notion-stop-session",
  "notion-upload-skill"
];
var ALL_TOOLS = [...READ_TOOLS, ...WRITE_TOOLS, ...DESTRUCTIVE_TOOLS];
function classify(name) {
  if (READ_TOOLS.includes(name)) return "read";
  if (WRITE_TOOLS.includes(name)) return "write";
  if (DESTRUCTIVE_TOOLS.includes(name)) return "destructive";
  return "unknown";
}

// src/permissions.ts
var ACCESS = ["all", "ask-changes", "read-only"];
var effectOf = (name, access) => classify(name) === "read" ? "allow" : access === "all" ? "allow" : access === "ask-changes" ? "ask" : "deny";
var actionOf = (tool) => `${SERVER_NAME}_${tool}`;
var rule = (tool, effect) => ({ action: actionOf(tool), resource: "*", effect });
var defaultRules = (access = "all") => [
  rule("*", access === "all" ? "allow" : access === "ask-changes" ? "ask" : "deny"),
  ...ALL_TOOLS.map((tool) => rule(tool, effectOf(tool, access)))
];

// src/status.ts
var SIGN_IN = `Run /connect and choose Notion, then press o or Enter to open the link (in a terminal, opencode mcp auth ${SERVER_NAME} opens it automatically: run it from the project folder where the plugin is installed, and if it answers MCP server not found: ${SERVER_NAME}, wait a few seconds and run it again).`;
var REVOKED = `If this sign-in worked earlier, its grant may have been revoked: Notion revokes the whole grant when a refresh token is reused, which two OpenCode processes sharing one sign-in do. Run opencode mcp logout ${SERVER_NAME} from the project folder where the plugin is installed, or remove the account in /connect \u2192 Notion; if it answers MCP server not found: ${SERVER_NAME}, wait a few seconds and run it again, then sign in once.`;
var agentRules = (access) => defaultRules(access).map((rule2, index, rules) => `  ${JSON.stringify(rule2)}${index < rules.length - 1 ? "," : ""}`).join("\n");
var TESTED_TEXT = `${TESTED_HOSTS.slice(0, -1).join(", ")} or ${TESTED_HOSTS.at(-1)}`;
var STATE_TEXT = {
  connected: "connected",
  connecting: "connecting",
  sign_in_required: "sign-in required",
  failed: "failed",
  disabled: "disabled",
  not_configured: "not configured",
  conflict: "conflict"
};
var RULES_NOT_ADDED = "RULES_NOT_ADDED:";
function serverText(source) {
  if (source.type === "plugin") return `${source.url}, registered by this plugin`;
  if (source.type === "adopted") return `${source.url}, your own mcp.servers.${SERVER_NAME}${source.signIn === "own" ? " without OAuth" : ""}, used unchanged`;
  return `your mcp.servers.${SERVER_NAME} points at ${source.url}`;
}
function toolsText({ tools, unknownCount, unknownTools, destructiveTools, listing, access }) {
  if (listing) return "none listed yet (Notion is still listing them)";
  const posture = destructiveTools.length ? `; ${list(destructiveTools)} ${access === "all" ? "allowed like everything else" : access === "ask-changes" ? "ask" : "denied"}` : "";
  if (unknownCount === 0) return `${tools} available, 0 unknown${posture}`;
  const more = unknownCount - unknownTools.length;
  const names = unknownTools.length ? `: ${unknownTools.join(", ")}${more > 0 ? ` and ${more} more` : ""}` : "";
  return `${tools} available, ${unknownCount} unknown${names} (a tool Notion adds is ${access === "all" ? "allowed at once" : access === "ask-changes" ? "asked about" : "denied"})${posture}`;
}
var list = (names) => names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
var postureOf = (access) => access === "all" ? "every Notion tool is allowed, reads and changes alike" : access === "ask-changes" ? `reads run without asking; the ${WRITE_TOOLS.length} writes and the ${DESTRUCTIVE_TOOLS.length} destructive tools ask first` : `reads run without asking; the ${WRITE_TOOLS.length} writes and the ${DESTRUCTIVE_TOOLS.length} destructive tools are denied`;
function accessText({ access, problems, unguardedAgents: unguardedAgents2, connection }) {
  const who = connection === "person" ? "your Notion account" : connection === "bot" ? "a workspace connection with an admin-chosen tool list" : "";
  const rules = problems.some((problem) => problem.startsWith(RULES_NOT_ADDED)) ? "default rules not added (see the OpenCode row)" : unguardedAgents2.length ? "default rules missing in the agents listed below" : "every agent has the block";
  return [`access ${access}: ${postureOf(access)}`, who, rules].filter(Boolean).join("; ");
}
function hostText({ host, problems }) {
  const { version, range, tested } = host;
  const outside = version === null || !isSupportedHost(version);
  const notes = [
    ...outside ? [`It is outside the supported range; the plugin runs because allowUntestedHost is true. If Notion misbehaves, use OpenCode ${TESTED_TEXT}.`] : [],
    ...problems
  ];
  return `${version ?? "unknown version"} (${tested ? "tested" : "untested"}; supported range ${range})${notes.length ? `. ${notes.join(" ")}` : ""}`;
}
function formatStatus(status) {
  const { source, unguardedAgents: agents } = status;
  const details = [status.error, source && serverText(source), status.listing && "still listing its tools"].filter(Boolean).join("; ");
  return [
    "Notion status",
    `- Connection: ${STATE_TEXT[status.state]}${details ? ` (${details})` : ""}`,
    `- Account: ${status.workspace ?? "not read yet: it appears after a notion-get-self call"}`,
    `- Access: ${accessText(status)}`,
    `- Server: ${status.beta ? "Notion MCP (Beta): Notion may change its tools and behaviour" : "Notion MCP"}`,
    `- Tools: ${toolsText(status)}`,
    `- Agents without default rules: ${agents.length ? `${agents.join(", ")}
${agentRules(status.access)}` : "none"}`,
    `- OpenCode: ${hostText(status)}`,
    `- Next step: ${status.nextStep}`
  ].join("\n");
}
var strings = { type: "array", items: { type: "string" } };
var count = { type: "integer", minimum: 0 };
var nullableString = { type: ["string", "null"] };
var StatusRpc = {
  id: PLUGIN_ID,
  methods: {
    status: {
      input: { type: "object" },
      output: {
        type: "object",
        required: ["version", "access", "state", "workspace", "connection", "beta", "tools", "deniedTools", "listing", "unknownCount", "unknownTools", "unguardedAgents", "host", "problems", "nextStep"],
        properties: {
          version: { type: "string" },
          access: { enum: [...ACCESS] },
          state: { enum: ["connected", "sign_in_required", "connecting", "disabled", "failed", "not_configured", "conflict"] },
          error: { type: "string" },
          source: {
            type: "object",
            required: ["type", "url"],
            properties: { type: { enum: ["plugin", "adopted", "conflict"] }, url: { type: "string" }, expected: { type: "string" }, signIn: { enum: ["oauth", "own"] } }
          },
          workspace: nullableString,
          connection: { enum: ["person", "bot", null] },
          beta: { type: "boolean" },
          tools: count,
          destructiveTools: strings,
          deniedTools: strings,
          listing: { type: "boolean" },
          unknownCount: count,
          unknownTools: strings,
          unguardedAgents: strings,
          shadowedSkills: {
            type: "array",
            items: { type: "object", required: ["id", "path"], properties: { id: { type: "string" }, path: { type: "string" } } }
          },
          host: {
            type: "object",
            required: ["version", "range", "tested"],
            properties: { version: nullableString, range: { type: "string" }, tested: { type: "boolean" } }
          },
          problems: strings,
          nextStep: { type: "string" }
        }
      },
      errors: { unavailable: { type: "object", required: ["nextStep"], properties: { nextStep: { type: "string" } } } }
    }
  },
  events: {}
};

// src/tui.ts
var TUI_ID = "notion.workspace.tui";
var TITLE = "Notion status";
var KEYS = "r refresh \xB7 esc close";
function viewMessage(result) {
  return `${reportOf(result)}

${KEYS}`;
}
function reportOf(result) {
  if ("status" in result) return formatStatus(result.status).split("\n").slice(1).join("\n");
  const { error } = result;
  const type = typeof error === "object" && error !== null && "type" in error ? error.type : void 0;
  if (type === "unavailable") {
    const { message, data } = error;
    if (typeof message === "string" && typeof data?.nextStep === "string") return `${message} Next step: ${data.nextStep}`;
  }
  if (type === "rpc.unavailable" || type === "rpc.method_not_found") {
    return errorText("STATUS_UNAVAILABLE", "The Notion plugin is not running on this OpenCode server.", "Run /plugins to see why it did not start.");
  }
  const reason = shortReason(typeof error === "object" && error !== null && "message" in error ? String(error.message) : String(error));
  return errorText("STATUS_UNAVAILABLE", `Could not read Notion's status${reason ? ` (${reason})` : ""}.`, "Restart OpenCode, then run /notion again.");
}
function setupView(context) {
  let open;
  let latest = 0;
  let stops = [];
  const unsubscribe = () => {
    for (const stop of stops.splice(0)) stop();
  };
  const subscribe = () => {
    if (stops.length) return;
    stops = [
      context.data.on("mcp.status.changed", (event) => {
        if (event.data.server === SERVER_NAME) refresh();
      }),
      // Status events can be missed while the TUI is reconnecting.
      context.data.on("server.connected", refresh),
      context.data.on("agent.updated", refresh),
      // Signing in, out or switching accounts changes the account and the sign-in state.
      context.data.on("integration.updated", refresh),
      context.data.on("credential.updated", refresh),
      context.data.on("credential.switched", refresh)
    ];
  };
  const [shown, setShown] = createSignal(false);
  const show = async (refresh2) => {
    if (refresh2 && open === void 0) return;
    const request = ++latest;
    const location = context.location;
    const result = await context.client.rpc(StatusRpc).status({}, location ? { location } : {}).then((status) => ({ status }), (error) => ({ error }));
    if (request !== latest || refresh2 && open === void 0) return;
    open = request;
    setShown(true);
    subscribe();
    void context.ui.dialog.alert({ title: TITLE, message: viewMessage(result) }).then(() => {
      if (open !== request) return;
      open = void 0;
      setShown(false);
      unsubscribe();
    });
    context.ui.dialog.set({ size: "large" });
  };
  const refresh = () => void show(true);
  context.keymap.layer(() => ({
    mode: "global",
    commands: [
      {
        id: "notion.workspace.status",
        title: "Notion: Status",
        description: "Sign-in, account, tools and the next step for Notion",
        group: "Notion",
        palette: true,
        slash: { name: "notion" },
        run: () => show(false)
      },
      { id: "notion.workspace.status.refresh", title: "Refresh Notion status", group: "Notion", bind: "r", enabled: shown, run: refresh }
    ]
  }));
  return () => {
    unsubscribe();
    if (open === void 0) return;
    open = void 0;
    setShown(false);
    context.ui.dialog.clear();
  };
}
var tui_default = Plugin.define({ id: TUI_ID, setup: setupView });
export {
  tui_default as default,
  setupView,
  viewMessage
};
