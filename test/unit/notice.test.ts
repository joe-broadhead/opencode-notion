// The release tarball ships NOTICE next to a bundle that inlines third-party code. Build the server entry with the
// same externals as scripts/build.mjs, collect the packages that actually end up in the bundle (including
// plugin-contract and the zod it pre-bundles in its dist), and require each package's verbatim licence in NOTICE.
import { build } from "esbuild"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

const root = fileURLToPath(new URL("../../", import.meta.url))
const HOST = ["@opencode/*"]
const PLUGIN = "@we-the-rebel-alliance/notion-plugin"

/** A package name from an esbuild input path, or undefined for the plugin's own sources. */
function packageOf(path: string): string | undefined {
  return /^node_modules\/((?:@[^/]+\/)?[^/]+)\//.exec(path)?.[1]
}

function keep(name: string | undefined): name is string {
  return name !== undefined && name !== PLUGIN && !name.startsWith("@opencode/") && !name.startsWith(".")
}

/** Every package esbuild actually inlines into the server bundle. */
async function bundledPackages(): Promise<string[]> {
  const result = await build({
    absWorkingDir: root,
    entryPoints: ["src/index.ts"],
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    target: "node24",
    external: HOST,
    legalComments: "none",
    metafile: true,
    logLevel: "silent",
  })
  const inputs = Object.keys(result.metafile.inputs)
  const found = new Set<string>()
  for (const path of inputs) {
    const name = packageOf(path)
    if (keep(name)) found.add(name)
  }
  // plugin-contract's dist inlines its own dependencies; the original module path survives in a comment.
  for (const path of inputs) {
    if (!path.startsWith("node_modules/")) continue
    const text = readFileSync(join(root, path), "utf8")
    for (const match of text.matchAll(/\/\/\s*node_modules\/((?:@[^/\s]+\/)?[^/\s]+)\//g)) {
      if (keep(match[1])) found.add(match[1])
    }
  }
  // plugin-contract is always inlined (no runtime dependencies are allowed), and the contract's dist carries zod
  // pre-bundled, so zod can be absent from the metafile by name. Detect it from the emitted code itself.
  found.add("@we-the-rebel-alliance/plugin-contract")
  const bundle = result.outputFiles?.[0]?.text ?? ""
  if (/\$ZodType|ZodError/.test(bundle)) found.add("zod")
  return [...found].sort()
}

interface Package {
  readonly name: string
  readonly version: string
  readonly license: string
  readonly text: string
}

function packageInfo(name: string): Package {
  const directory = join(root, "node_modules", name)
  const pkg = JSON.parse(readFileSync(join(directory, "package.json"), "utf8")) as { version: string; license?: string }
  return {
    name,
    version: pkg.version,
    license: pkg.license ?? "UNKNOWN",
    text: readFileSync(join(directory, "LICENSE"), "utf8").trim(),
  }
}

function section(pkg: Package): string {
  return `## ${pkg.name} ${pkg.version} (${pkg.license})`
}

function missingNoticeSections(notice: string, packages: readonly Package[]): string[] {
  return packages.filter((pkg) => !notice.includes(section(pkg)) || !notice.includes(pkg.text)).map((pkg) => pkg.name)
}

describe("the bundled third-party notices", () => {
  test("every bundled package has its verbatim licence in NOTICE", async () => {
    const names = await bundledPackages()
    expect(names).toContain("yaml")
    expect(names).toContain("@we-the-rebel-alliance/plugin-contract")
    expect(names).toContain("zod")
    const packages = names.map(packageInfo)
    const notice = readFileSync(join(root, "NOTICE"), "utf8")
    expect(missingNoticeSections(notice, packages)).toEqual([])
  })

  test("a missing zod section is reported", () => {
    const notice = readFileSync(join(root, "NOTICE"), "utf8")
    const withoutZod = notice.replace(/^## zod[\s\S]*?(?=^## |\s*$)/m, "")
    expect(missingNoticeSections(withoutZod, [packageInfo("zod")])).toEqual(["zod"])
  })
})
