import { FallbackTransition } from "./fallback-transition";
import { FallbackReason, type StartTransitionHost } from "./internal-types";
import { getActiveTransition, setActiveTransition } from "./registry";
import {
	documentKey,
	prefersReducedMotion,
	supportsDocumentTransition,
	supportsElementTransition,
	supportsTransitionTypes,
} from "./support";
import {
	ReducedMotion,
	TransitionScope,
	ViewTransitionErrorCode,
	type NativeViewTransition,
	type TransitionScopeInput,
	type UpdateCallback,
	type ViewTransitionOptions,
} from "./types";
import { isElement, safely } from "./utils";
import { normalizeTypes, validateOptions } from "./validation";
import { ViewTransitionError } from "./view-transition-error";
import { wireTransition } from "./wire";

/**
 * Static, lightweight wrapper around the View Transition API.
 *
 * The wrapper is standalone and returns the unmodified native transition
 * instance (`updateCallbackDone`, `ready`, `finished`, `types`, and
 * `skipTransition()`). Its promises and errors behave exactly like the
 * browser's.
 *
 * Document and element scopes are independent: `start(update)` uses
 * `document.startViewTransition`, while `start(element, update)` uses
 * `element.startViewTransition`. Each scope has its own support check and its
 * own active transition. When the requested scope is unsupported, the update
 * still runs without animation; the wrapper never silently switches scopes.
 *
 * When no animation can run (unsupported API or reduced motion), the update is
 * still executed asynchronously and a transition-shaped fallback is returned.
 * Its `ready` promise rejects with an `AbortError`, just like a skipped native
 * transition. Animate pseudo-elements with:
 *
 * ```ts
 * await transition.ready.then(animatePseudoElements, () => {});
 * ```
 *
 * Lifecycle callbacks run in this order: `onStart` synchronously before the
 * browser is called, `onReady` when the native `ready` resolves, `onFinish`
 * when `finished` resolves, and `onError` at most once for update errors or
 * non-abort failures of `ready`/`finished`. If `onError` is omitted, update
 * errors are reported as uncaught errors. Callback errors never block the DOM
 * update.
 *
 * Transition types are passed to `:active-view-transition-type(...)`
 * selectors. Browsers without type support ignore them. With
 * {@link ReducedMotion.Respect}, no transition starts when the user prefers
 * reduced motion; use {@link ReducedMotion.Ignore} when the page CSS already
 * handles that preference.
 *
 * Style the generated pseudo-element tree with CSS:
 *
 * ```css
 * ::view-transition-old(root) {
 *   animation: fade-out 160ms ease-out;
 * }
 *
 * ::view-transition-new(root) {
 *   animation: fade-in 220ms ease-in;
 * }
 * ```
 *
 * Named elements use `view-transition-name`, and transition types scope
 * selectors through `html:active-view-transition-type(...)`.
 *
 * @example
 * ```ts
 * // Document scope.
 * const transition = ViewTransition.start(() => renderPage());
 *
 * // With types and lifecycle callbacks.
 * ViewTransition.start(update, {
 *   types: ["navigation"],
 *   onReady: () => {},
 *   onFinish: () => {},
 * });
 *
 * // Element scope (browser support permitting).
 * ViewTransition.start(element, () => renderElement());
 *
 * ViewTransition.supported();
 * ViewTransition.supported(element);
 * ViewTransition.current();
 * ViewTransition.current(element);
 * ViewTransition.skip();
 * ```
 */
export class ViewTransition {
	private constructor() {
		throw new ViewTransitionError(
			ViewTransitionErrorCode.InvalidArgument,
			"ViewTransition is a static API: use ViewTransition.start().",
		);
	}

	/**
	 * Starts a document-scoped transition and runs the DOM update.
	 *
	 * @param update - DOM update callback.
	 * @param options - Transition options.
	 * @returns The native transition, or a transition-shaped fallback when no
	 * animation can run.
	 */
	static start(
		update: UpdateCallback,
		options?: ViewTransitionOptions,
	): NativeViewTransition;

	/**
	 * Starts an element-scoped transition that only animates the subtree of the
	 * provided element.
	 *
	 * @param element - Element that scopes the transition.
	 * @param update - DOM update callback.
	 * @param options - Transition options.
	 * @returns The native transition, or a transition-shaped fallback when no
	 * animation can run.
	 */
	static start(
		element: Element,
		update: UpdateCallback,
		options?: ViewTransitionOptions,
	): NativeViewTransition;

	/**
	 * Starts a view transition.
	 *
	 * @param first - Update callback, or the element for a scoped transition.
	 * @param second - Options, or the update callback for a scoped transition.
	 * @param third - Options for a scoped transition.
	 * @returns The native transition or a fallback.
	 * @throws {ViewTransitionError} If the arguments or options are invalid.
	 */
	static start(
		first: unknown,
		second?: unknown,
		third?: unknown,
	): NativeViewTransition {
		let host: Element | null = null;
		let update: UpdateCallback;
		let rawOptions: unknown;

		if (typeof first === "function") {
			update = first as UpdateCallback;
			rawOptions = second;
		} else if (isElement(first)) {
			if (typeof second !== "function") {
				throw new ViewTransitionError(
					ViewTransitionErrorCode.InvalidArgument,
					"start(element, update): `update` must be a function.",
				);
			}
			host = first;
			update = second as UpdateCallback;
			rawOptions = third;
		} else {
			throw new ViewTransitionError(
				ViewTransitionErrorCode.InvalidArgument,
				"start() expects (update) or (element, update): the first argument must be a function or an Element.",
			);
		}

		const options = validateOptions(rawOptions);
		const types = normalizeTypes(options.types);
		const key: object = host ?? documentKey();

		safely(options.onStart);

		// Decide whether the transition can and should animate.
		let reason: FallbackReason | null = null;
		if (
			!(host ? supportsElementTransition(host) : supportsDocumentTransition())
		) {
			reason = host
				? FallbackReason.UnsupportedElement
				: FallbackReason.UnsupportedDocument;
		} else if (
			options.reducedMotion !== ReducedMotion.Ignore &&
			prefersReducedMotion()
		) {
			reason = FallbackReason.ReducedMotion;
		}

		let transition: NativeViewTransition | undefined;
		let synthetic = false;
		let initialError: { error: unknown } | undefined;

		if (reason === null) {
			try {
				const target = (host ?? document) as unknown as StartTransitionHost;
				const native =
					types.length > 0 && supportsTransitionTypes()
						? target.startViewTransition({ update, types })
						: target.startViewTransition(update);
				transition = native as NativeViewTransition;
			} catch (error) {
				// If the browser fails to start, the update must still run.
				reason = FallbackReason.BrowserStartFailure;
				initialError = { error };
			}
		}

		if (!transition) {
			transition = new FallbackTransition(
				update,
				types,
				reason ?? FallbackReason.Unknown,
			);
			synthetic = true;
		}

		setActiveTransition(key, transition);
		wireTransition(transition, key, options, synthetic, initialError);
		return transition;
	}

	/**
	 * Returns the active transition for the document, or for an element.
	 *
	 * Prefers the native `activeViewTransition` property when available, which
	 * also detects transitions started outside this library. Falls back to the
	 * transition registered by this library.
	 *
	 * @param element - Optional element whose scoped transition to inspect.
	 * @returns The active transition, or `null` when there is none.
	 * @throws {ViewTransitionError} If `element` is not an `Element`.
	 */
	static current(element?: Element): NativeViewTransition | null {
		if (element !== undefined && !isElement(element)) {
			throw new ViewTransitionError(
				ViewTransitionErrorCode.InvalidArgument,
				"current(element): `element` must be an Element.",
			);
		}

		const key: object = element ?? documentKey();
		const native = (key as { activeViewTransition?: unknown })
			.activeViewTransition;
		return (
			(native as NativeViewTransition | null | undefined) ??
			getActiveTransition(key) ??
			null
		);
	}

	/**
	 * Reports whether the browser supports view transitions.
	 *
	 * - `supported()` checks document-scoped transitions.
	 * - `supported("element")` checks element-scoped support in general.
	 * - `supported(element)` checks support for that element.
	 *
	 * @param scope - Scope to check.
	 * @returns `true` when the requested scope is supported.
	 * @throws {ViewTransitionError} If the scope is not a known name or an
	 * `Element`.
	 */
	static supported(
		scope: TransitionScopeInput | Element = TransitionScope.Document,
	): boolean {
		if (scope === TransitionScope.Document) {
			return supportsDocumentTransition();
		}
		if (scope === TransitionScope.Element) {
			return supportsElementTransition();
		}
		if (isElement(scope)) return supportsElementTransition(scope);
		throw new ViewTransitionError(
			ViewTransitionErrorCode.InvalidArgument,
			'supported() expects "document", "element" or an Element.',
		);
	}

	/**
	 * Skips the animation of the active transition.
	 *
	 * The DOM update still completes.
	 *
	 * @param element - Optional element whose scoped transition to skip.
	 * @returns `true` when an active transition was skipped.
	 */
	static skip(element?: Element): boolean {
		const current = ViewTransition.current(element);
		if (!current) return false;
		current.skipTransition();
		return true;
	}
}
