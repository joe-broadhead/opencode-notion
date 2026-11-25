import { existsSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { createHost } from "@we-the-rebel-alliance/plugin-contract/kit"

const root = join(import.meta.dirname, "..", "..")

describe("the built plugin on the real OpenCode 2.4.1 host", () => {
  test("registers two aliases, refuses a missing and an unknown account, and answers status", async () => {
    expect(existsSync(join(root, "dist", "index.js")), "run npm run bundle before the host test").toBe(true)
    const run = await createHost({
      directory: root,
      version: "2.4.1",
      pluginId: "notion",
      options: { access: "all", accounts: { work: {}, personal: {} } },
    })
    try {
      expect(run.failure).toBeUndefined()
      expect(run.refusal).toBeUndefined()
      expect(run.definition?.id).toBe("notion")
      expect(run.namespace?.name).toBe("notion")
      expect(run.rpc?.id).toBe("notion")
      expect(run.rpc?.events).toEqual(["account"])
      expect(run.tools.map((tool) => tool.name).sort()).toEqual(["events_list", "probe", "status"])

      const missing = await run.call("events_list", {}, {})
      expect(missing).toMatchObject({ ok: false, code: "ACCOUNT_REQUIRED" })

      const unknown = await run.call("events_list", { account: "nobodyhere" }, {})
      expect(unknown).toMatchObject({ ok: false, code: "ACCOUNT_UNKNOWN" })

      const status = await run.call("status", {}, {})
      expect(status.ok).toBe(true)
      if (!status.ok) return
      const answer = status.output as { name: string; version: string; host: { version: string; range: string }; accounts: { alias: string }[]; state: string }
      expect(answer.name).toBe("notion")
      expect(answer.version).toBe("0.0.0")
      expect(answer.host).toMatchObject({ version: "2.4.1", range: ">=2.4.1 <2.5.0" })
      expect(answer.accounts.map((account) => account.alias)).toEqual(["work", "personal"])
    } finally {
      await run.close()
    }
  }, 120_000)
})
