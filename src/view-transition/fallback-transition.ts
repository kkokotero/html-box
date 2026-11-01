import { NOOP } from "./constants";
import type { NativeViewTransition, UpdateCallback } from "./types";
import { abortError } from "./utils";

/**
 * Synthetic transition used when no animation can run.
 *
 * The update is still executed asynchronously, matching the native timing so
 * callers observe the same execution order across browsers. The object has
 * the same shape as a native transition and reflects the update result:
 *
 * - `updateCallbackDone` resolves with the update, or rejects with its error.
 * - `finished` mirrors `updateCallbackDone`.
 * - `ready` rejects with an `AbortError`, as a skipped native transition does.
 * - `skipTransition()` does nothing.
 *
 * @internal
 */
export class FallbackTransition implements NativeViewTransition {
	/** Resolves when the DOM update finishes. */
	readonly updateCallbackDone: Promise<void>;

	/** Always rejects with an `AbortError`, because no animation starts. */
	readonly ready: Promise<void>;

	/** Mirrors {@link FallbackTransition.updateCallbackDone}. */
	readonly finished: Promise<void>;

	/** Types requested for the transition, retained for inspection. */
	readonly types: Set<string>;

	/**
	 * Creates a non-animating transition.
	 *
	 * @param update - DOM update callback.
	 * @param types - Requested transition types.
	 * @param reason - Why no animation runs, included in the abort message.
	 */
	constructor(
		update: UpdateCallback,
		types: readonly string[],
		reason: string,
	) {
		this.types = new Set(types);

		// Asynchronous, like the browser: the callback never runs before
		// `start()` returns.
		this.updateCallbackDone = Promise.resolve()
			.then(() => update())
			.then(() => undefined);
		this.finished = this.updateCallbackDone.then(() => undefined);

		this.ready = Promise.reject(abortError(`No animation was run: ${reason}.`));
		// Like the native API, a rejected `ready` is not an unhandled rejection.
		this.ready.catch(NOOP);
	}

	/** Does nothing, because there is no animation to skip. */
	skipTransition(): void {
		// No animation to skip.
	}
}
