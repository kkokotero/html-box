/**
 * View Transition public types and enums.
 *
 * @module
 */

/**
 * Machine-readable error codes emitted by {@link ViewTransitionError}.
 */
export enum ViewTransitionErrorCode {
	/** The call arguments do not match any supported signature. */
	InvalidArgument = "INVALID_ARGUMENT",

	/** An option has an unsupported value or type. */
	InvalidOption = "INVALID_OPTION",
}

/**
 * Scope in which a view transition runs.
 *
 * Document-scoped transitions animate the whole page. Element-scoped
 * transitions only animate the subtree of the provided element.
 */
export enum TransitionScope {
	/** Transition the whole document. */
	Document = "document",

	/** Transition the subtree of one element. */
	Element = "element",
}

/**
 * Policy for the user's `prefers-reduced-motion` setting.
 */
export enum ReducedMotion {
	/** Do not animate when the user prefers reduced motion. */
	Respect = "respect",

	/** Always animate and let the page CSS decide what to disable. */
	Ignore = "ignore",
}

/**
 * Named scope argument accepted by {@link ViewTransition.supported}.
 *
 * The method also accepts an `Element` to check support for that element.
 * Raw string literals remain accepted so callers do not need to import the
 * enum in order to use the API.
 */
export type TransitionScopeInput = TransitionScope | "document" | "element";

/**
 * Reduced-motion policy accepted by {@link ViewTransitionOptions}.
 *
 * Raw string literals remain accepted for convenience.
 */
export type ReducedMotionInput = ReducedMotion | "respect" | "ignore";

/**
 * DOM update callback run inside a view transition.
 *
 * The callback may return a value or a promise. The browser waits for the
 * returned promise before capturing the new state.
 */
export type UpdateCallback = () => unknown;

/**
 * Transition type set exposed by browsers that support view transition types.
 *
 * The shape mirrors the native `ViewTransitionTypeSet`, which behaves like a
 * `Set<string>`.
 */
export interface ViewTransitionTypes extends Iterable<string> {
	/** Adds a type to the active transition. */
	add(type: string): unknown;

	/** Removes a type and reports whether it was present. */
	delete(type: string): boolean;

	/** Reports whether the set contains a type. */
	has(type: string): boolean;

	/** Removes every type from the set. */
	clear(): void;

	/** Number of types in the set. */
	readonly size: number;
}

/**
 * Structural shape of a native `ViewTransition`.
 *
 * Describing the shape locally keeps the public API independent of the
 * TypeScript DOM library version. When the browser starts a real transition,
 * the returned object is the unmodified native instance.
 */
export interface NativeViewTransition {
	/** Resolves when the update callback finishes, or rejects with its error. */
	readonly updateCallbackDone: Promise<void>;

	/** Resolves when the transition is ready to animate. */
	readonly ready: Promise<void>;

	/** Resolves when the transition finishes, including skipped transitions. */
	readonly finished: Promise<void>;

	/** Transition types, only available in browsers with type support. */
	readonly types?: ViewTransitionTypes;

	/** Skips the animation while keeping the DOM update. */
	skipTransition(): void;
}

/**
 * Options for {@link ViewTransition.start}.
 */
export interface ViewTransitionOptions {
	/**
	 * Transition types used by `:active-view-transition-type(...)` selectors.
	 *
	 * Duplicate values are removed. Browsers without type support ignore them
	 * and still run the transition.
	 */
	types?: readonly string[];

	/**
	 * Runs synchronously when the library starts the operation, before the
	 * browser is called.
	 */
	onStart?: () => void;

	/**
	 * Runs when the native `ready` promise resolves, meaning the
	 * pseudo-elements exist and the animation is about to start.
	 */
	onReady?: () => void;

	/**
	 * Runs when the native `finished` promise resolves. This also runs when
	 * the animation was skipped, after the DOM update completes.
	 */
	onFinish?: () => void;

	/**
	 * Runs once per transition for update errors, or for `ready`/`finished`
	 * failures that are not intentional aborts.
	 *
	 * When omitted, update errors are reported as uncaught errors instead of
	 * being silently swallowed.
	 */
	onError?: (error: unknown) => void;

	/**
	 * Policy for `prefers-reduced-motion`.
	 *
	 * Defaults to {@link ReducedMotion.Respect}, which applies the update
	 * without animating. Use {@link ReducedMotion.Ignore} when the page CSS
	 * already handles reduced motion.
	 */
	reducedMotion?: ReducedMotionInput;
}
