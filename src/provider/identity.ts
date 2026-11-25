import type { Identity } from "./notion.ts"

/**
 * Who each alias is, as `probe` or a listing read it: for the plugin instance, and cleared on a sign-out or a
 * credential change. Concurrent readers of one alias share one `notion-get-self`; a read that crosses a clear keeps
 * nothing, so a page never names an identity the sign-in may no longer be.
 */
export class Identities {
  readonly #known = new Map<string, Identity>()
  readonly #reads = new Map<string, Promise<Identity>>()
  #generation = 0

  get(alias: string): Identity | undefined {
    return this.#known.get(alias)
  }

  set(alias: string, identity: Identity): void {
    this.#known.set(alias, identity)
  }

  /** Forgets one alias, or every alias when none is named. A read in flight from before stores nothing. */
  clear(alias?: string): void {
    this.#generation += 1
    if (alias === undefined) this.#known.clear()
    else this.#known.delete(alias)
  }

  /** The identity kept for `alias`, else one read now. A failed read is kept by nobody. */
  async resolve(alias: string, read: () => Promise<Identity>): Promise<Identity> {
    const known = this.#known.get(alias)
    if (known !== undefined) return known
    const running = this.#reads.get(alias)
    if (running !== undefined) return running
    const generation = this.#generation
    const promise = read().then((identity) => {
      if (generation === this.#generation) this.#known.set(alias, identity)
      return identity
    })
    this.#reads.set(alias, promise)
    try {
      return await promise
    } finally {
      if (this.#reads.get(alias) === promise) this.#reads.delete(alias)
    }
  }
}

export const identities = (): Identities => new Identities()
