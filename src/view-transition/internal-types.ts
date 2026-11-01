import type { UpdateCallback } from "./types";

/**
 * Host that can start a view transition.
 *
 * The DOM typings differ across browser and TypeScript versions, so the
 * wrapper relies on this minimal structural shape.
 *
 * @internal
 */
export interface StartTransitionHost {
	/**
	 * Starts a transition with either an update callback or an
	 * `{ update, types }` options object.
	 */
	startViewTransition(arg?: unknown): unknown;
}

/**
 * Host that exposes the currently active transition.
 *
 * @internal
 */
export interface ActiveTransitionHost {
	/** Native property available in browsers with view transition support. */
	readonly activeViewTransition?: unknown;
}

/**
 * Options object passed to browsers that support transition types.
 *
 * @internal
 */
export interface StartTransitionWithTypes {
	/** DOM update callback. */
	readonly update: UpdateCallback;

	/** Transition types for CSS selectors. */
	readonly types: readonly string[];
}

/**
 * Reason why a real animation is not started.
 *
 * The string values are used verbatim in the `AbortError` message exposed by
 * the fallback transition.
 *
 * @internal
 */
export enum FallbackReason {
	/** Document-scoped view transitions are unavailable. */
	UnsupportedDocument = "view transitions are not supported",

	/** Element-scoped view transitions are unavailable. */
	UnsupportedElement = "element-scoped view transitions are not supported",

	/** The user prefers reduced motion. */
	ReducedMotion = "the user prefers reduced motion",

	/** The browser threw while starting the transition. */
	BrowserStartFailure = "the browser could not start the transition",

	/** A defensive fallback for an unexpected state. */
	Unknown = "unknown",
}

/**
 * Error captured while trying to start a native transition.
 *
 * @internal
 */
export interface InitialTransitionError {
	/** Original error thrown by the browser. */
	readonly error: unknown;
}
