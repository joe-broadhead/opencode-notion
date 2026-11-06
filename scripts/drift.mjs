// Maintainer-run drift check for the tool table. Nothing at runtime depends on it, and it never reads a credential or
// calls Notion.
//
//   npm run drift                 # compare the committed fixture with src/notion-tools.ts
//   npm run drift -- <tools.json> [--strict]   # compare a tools/list saved from a signed-in server
//
// The post-sign-in reconcile is: save the server's tools/list (or ctx.tool.list()) to test/unit/notion-live-tools.json,
// run `npm run drift -- --strict`, and update src/notion-tools.ts, PARAMETERS, package.json's jelly.tools and the skills
// until it reports no drift.
//
// A list may be an MCP client's tools/list result ({ "tools": [{ name, description, annotations, inputSchema }] }) or the
// fixture's form ({ "tools": [{ name, class, annotations, inputs }] }), where annotations and inputs may be missing.
// Names are accepted with the server prefix (`notion_notion-search`), the MCP name (`notion-search`) or a dotted path.
// Exit codes: 0 no drift, or drift without --strict; 1 drift with --strict; 2 usage or file error.
// Needs Node 22.18 or later, which loads the TypeScript file by stripping its types.
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

const USAGE = "Usage: npm run drift [-- <tools.json>] [--strict]"
const DEFAULT_LIST = fileURLToPath(new URL("../test/unit/notion-live-tools.json", import.meta.url))

let strict = false
let file = DEFAULT_LIST
for (const arg of process.argv.slice(2)) {
  if (arg === "--strict") strict = true
  else if (!arg.startsWith("--") && file === DEFAULT_LIST) file = arg
  else fail(`unknown argument "${arg}". ${USAGE}`)
}
if (!process.features.typescript) fail(`Node ${process.versions.node} cannot load TypeScript files. Use Node 22.18 or later.`)

const effectOf = (kind) => (kind === "read" ? "allow" : kind === "write" ? "ask" : "deny")

const known = await loadKnown()
const live = readToolList(file)

const added = [...live.keys()].filter((name) => !known.classOf.has(name)).sort()
const removed = [...known.classOf.keys()].filter((name) => !live.has(name)).sort()
const reclassified = [...live]
  .filter(([name, { annotations: hints = {} }]) => {
    const kind = known.classOf.get(name)
    return (kind === "read" && (hints.readOnlyHint === false || hints.destructiveHint === true)) || (kind !== undefined && kind !== "read" && hints.readOnlyHint === true)
  })
  .map(([name]) => name)
  .sort()
const classes = [...live]
  .filter(([name, { class: listed }]) => listed !== undefined && known.classOf.get(name) !== undefined && listed !== effectOf(known.classOf.get(name)))
  .map(([name, { class: listed }]) => `${name}: listed ${listed}, rule ${effectOf(known.classOf.get(name))}`)
  .sort()
const parameters = [...live]
  .filter(([name, tool]) => known.classOf.has(name) && !known.parameters[name] && tool.params !== null)
  .map(([name, tool]) => `${name}: ${tool.params.map(describe).join(" ") || "(no parameters)"}`)
  .sort()

const count = (kind) => [...live.keys()].filter((name) => known.classOf.get(name) === kind).length
console.log(`The list holds ${live.size} tools: ${count("read")} read, ${count("write")} write, ${count("denied")} denied, ${added.length} with no rule.`)
section("Added: in the list, in no list of src/notion-tools.ts", added, true)
section("Removed: in src/notion-tools.ts, not in this list (a plan or an Enterprise tool list may omit tools)", removed, false)
section("Reclassified: the rule disagrees with the list's annotations", reclassified, true)
section("Rule mismatch: the list's class differs from the tool's rule", classes, true)
section("Parameters to record: the list gives this known tool's input, which PARAMETERS does not have yet", parameters, false)
if (![...live.values()].some((tool) => tool.params !== null)) console.log("\nNot checked: this list gives no input schemas.")

const drift = added.length + reclassified.length + classes.length + parameters.length
if (!drift) {
  console.log(removed.length ? "\nNo drift apart from the removed tools above." : "\nNo drift.")
  process.exit(0)
}
console.log(`\nDrift: ${drift} item(s). Update src/notion-tools.ts, PARAMETERS, package.json's jelly.tools and the skills.`)
process.exit(strict ? 1 : 0)

function section(title, names, withHints) {
  if (!names.length) return
  console.log(`\n${title}:`)
  for (const name of names) console.log(`  ${printable(name)}${withHints && live.get(name)?.annotations ? `  ${hints(live.get(name).annotations)}` : ""}`)
}

function hints(annotations) {
  const show = (value) => (typeof value === "boolean" ? String(value) : "unset")
  return `readOnlyHint=${show(annotations.readOnlyHint)} destructiveHint=${show(annotations.destructiveHint)}`
}

function describe(param) {
  return `${param.name}${param.required ? "*" : ""}${param.type ? `:${param.type}` : ""}`
}

// Names come from the server: print plain text as is and quote anything else.
function printable(text) {
  return /^[A-Za-z0-9_.\-:+<>|*() ]{1,300}$/.test(text) ? text : JSON.stringify(text.slice(0, 300))
}

function readToolList(path) {
  let parsed
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"))
  } catch (error) {
    fail(`cannot read ${JSON.stringify(path)} as JSON (${clean(error?.code ?? error?.message ?? error)}).`)
  }
  if (!Array.isArray(parsed?.tools)) fail(`${JSON.stringify(path)} has no "tools" array. ${USAGE}`)
  const tools = new Map()
  for (const tool of parsed.tools) {
    if (typeof tool?.name !== "string") continue
    tools.set(normalise(tool.name), {
      ...(typeof tool.class === "string" ? { class: tool.class } : {}),
      params: paramsOf(tool),
      ...(tool.annotations && typeof tool.annotations === "object" ? { annotations: tool.annotations } : {}),
    })
  }
  return tools
}

/** `notion_notion-search` and `notion.notion-search` both become `notion-search`. */
function normalise(name) {
  for (const prefix of ["notion_", "notion."]) if (name.startsWith(prefix)) return name.slice(prefix.length)
  return name
}

/** A tool's parameters from its JSON Schema, or from the fixture's `inputs`; null when the list gives neither. */
function paramsOf(tool) {
  if (Array.isArray(tool.inputs)) {
    return tool.inputs.map((entry) => {
      const [head, type] = String(entry).split(":")
      const required = head.endsWith("*")
      return { name: required ? head.slice(0, -1) : head, required, ...(type ? { type } : {}) }
    })
  }
  if (!tool.inputSchema || typeof tool.inputSchema !== "object") return null
  const schema = tool.inputSchema
  const properties = schema.properties && typeof schema.properties === "object" ? schema.properties : {}
  const required = new Set(Array.isArray(schema.required) ? schema.required : [])
  return Object.entries(properties).map(([name, property]) => ({ name, required: required.has(name), type: shape(property) }))
}

/** A JSON Schema property's type, as PARAMETERS records it: `string`, `array<object>|null` and so on. */
function shape(property) {
  if (!property || typeof property !== "object") return "any"
  if (Array.isArray(property.anyOf)) return property.anyOf.map(shape).join("|")
  if (Array.isArray(property.type)) return property.type.join("|")
  if (property.type === "array") return `array<${shape(property.items)}>`
  if (typeof property.type === "string") return property.type
  return "any"
}

async function loadKnown() {
  let module
  try {
    module = await import(new URL("../src/notion-tools.ts", import.meta.url).href)
  } catch (error) {
    fail(`cannot load src/notion-tools.ts (${error?.code ?? error?.message ?? error}). Keep it free of runtime imports so Node can strip its types.`)
  }
  const classOf = new Map()
  for (const [list, kind] of [["READ_TOOLS", "read"], ["WRITE_TOOLS", "write"], ["DENY_TOOLS", "denied"]]) {
    if (!Array.isArray(module[list])) fail(`src/notion-tools.ts must export ${list} as an array of tool names.`)
    for (const name of module[list]) classOf.set(name, kind)
  }
  if (!module.PARAMETERS || typeof module.PARAMETERS !== "object") fail("src/notion-tools.ts must export PARAMETERS, each tool's parameters.")
  return { classOf, parameters: module.PARAMETERS }
}

function clean(text) {
  return String(text ?? "no message").replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 200)
}

function fail(message) {
  console.error(`drift: ${message}`)
  process.exit(2)
}
