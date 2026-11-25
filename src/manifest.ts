import { readFileSync } from "node:fs"
import type { Manifest } from "@we-the-rebel-alliance/plugin-contract/manifest"

interface PackageFile {
  readonly version: string
  readonly capabilities: Manifest
}

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as PackageFile

/** The package name every page, probe and status answer names. */
export const PACKAGE = "@we-the-rebel-alliance/notion-plugin"

/** The installed capabilities manifest, as `package.json` carries it. */
export const manifest = pkg.capabilities

/** The installed package version. */
export const version = pkg.version
