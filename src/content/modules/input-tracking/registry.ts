/**
 * Maps page listeners to the callback actually handed to the browser.
 *
 * The decision (wrap or register as-is) is made once per listener, on its
 * first registration for a tracked event type, so `addEventListener`
 * de-duplication and `removeEventListener` keep native semantics.
 */
export class ListenerRegistry<Listener extends object, Wrapper extends object, Tag> {
  readonly #decisions = new WeakMap<Listener, Wrapper | null>();
  readonly #originals = new WeakMap<Wrapper, Listener>();
  readonly #makeWrapper: (listener: Listener, tag: Tag) => Wrapper;

  constructor(makeWrapper: (listener: Listener, tag: Tag) => Wrapper) {
    this.#makeWrapper = makeWrapper;
  }

  /**
   * Callback to register for `listener`. `classify` runs only the first time
   * a listener is seen; returning `undefined` registers it unwrapped.
   */
  resolve(listener: Listener, classify: () => Tag | undefined): Listener | Wrapper {
    let decision = this.#decisions.get(listener);
    if (decision === undefined) {
      const tag = classify();
      decision = tag === undefined ? null : this.#makeWrapper(listener, tag);
      this.#decisions.set(listener, decision);
      if (decision !== null) this.#originals.set(decision, listener);
    }
    return decision ?? listener;
  }

  /** Callback previously registered for `listener`, without deciding anew. */
  lookup(listener: Listener): Listener | Wrapper {
    return this.#decisions.get(listener) ?? listener;
  }

  /** The page listener behind a wrapper, or `undefined` for anything else. */
  originalOf(value: unknown): Listener | undefined {
    if ((typeof value !== "object" && typeof value !== "function") || value === null) return undefined;
    return this.#originals.get(value as Wrapper);
  }
}
