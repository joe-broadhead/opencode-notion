// One self-contained server bundle: `src/index.ts` -> `dist/index.js`.
//
// Only the host module and Node built-ins stay external; the contract library is inlined. A bare import that is
// neither the host's nor the contract's fails the bundle, so the published entry imports nothing else.
import { rm } from "node:fs/promises"
import { build } from "esbuild"

const HOST = "@opencode/plugin"
const CONTRACT = "@we-the-rebel-alliance/plugin-contract"

await rm("dist", { recursive: true, force: true })
await build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/index.js",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  sourcemap: false,
  external: [HOST, "node:*"],
  plugins: [
    {
      name: "host-and-contract-only",
      setup(builder) {
        builder.onResolve({ filter: /^[^./]/ }, (args) => {
          if (args.path.startsWith("node:")) return
          if (args.path === HOST || args.path.startsWith(`${HOST}/`)) return
          if (args.path === CONTRACT || args.path.startsWith(`${CONTRACT}/`)) return
          throw new Error(`the plugin may import only ${HOST}, node: built-ins and the contract, not ${args.path}`)
        })
      },
    },
  ],
})
console.log("bundle: dist/index.js")
