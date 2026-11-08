// The drift script is the post-sign-in reconcile: run against the committed fixture it reports no drift, and the fixture
// is a raw tools/list response, so replacing it and running the script with --strict is the whole check.
import { describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const ROOT = fileURLToPath(new URL("../..", import.meta.url))
const run = (...args: string[]) => spawnSync(process.execPath, ["scripts/drift.mjs", ...args], { cwd: ROOT, encoding: "utf8" })

describe("npm run drift", () => {
  test("finds no drift between the fixture and the tool lists", () => {
    const result = run("--strict")
    expect(result.status).toBe(0)
    expect(result.stdout).toContain("The list holds 71 tools: 39 read, 23 write, 9 destructive, 0 with no rule.")
    expect(result.stdout).toContain("No drift.")
  })

  test("refuses a file it cannot read, with a usage error", () => {
    const result = run("does-not-exist.json", "--strict")
    expect(result.status).toBe(2)
    expect(result.stderr).toContain("cannot read")
  })
})
