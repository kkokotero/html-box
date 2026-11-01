import { REDUCED_MOTION_QUERY, SERVER_KEY } from "./constants";
import type { StartTransitionHost } from "./internal-types";

/**
 * Checks whether the document supports view transitions.
 *
 * @returns `true` when `document.startViewTransition` is available.
 */
export function supportsDocumentTransition(): boolean {
	return (
		typeof document !== "undefined" &&
		typeof (document as unknown as Partial<StartTransitionHost>)
			.startViewTransition === "function"
	);
}

/**
 * Checks whether an element supports scoped view transitions.
 *
 * When no element is provided, the check is performed against
 * `Element.prototype`, which answers whether the browser supports the API for
 * any element.
 *
 * @param element - Optional element to check.
 * @returns `true` when the element or the `Element` prototype exposes
 * `startViewTransition`.
 */
export function supportsElementTransition(element?: Element): boolean {
	if (element) {
		return (
			typeof (element as unknown as Partial<StartTransitionHost>)
				.startViewTransition === "function"
		);
	}
	return (
		typeof Element !== "undefined" &&
		typeof (Element.prototype as unknown as Partial<StartTransitionHost>)
			.startViewTransition === "function"
	);
}

/**
 * Checks whether the browser supports view transition types.
 *
 * The `{ update, types }` signature is only available when the native
 * `ViewTransition` prototype exposes `types`.
 *
 * @returns `true` when transition types are supported.
 */
export function supportsTransitionTypes(): boolean {
	const prototype = (
		globalThis as {
			ViewTransition?: { prototype?: object };
		}
	).ViewTransition?.prototype;
	return !!prototype && "types" in prototype;
}

/**
 * Checks whether the user prefers reduced motion.
 *
 * @returns `true` when `(prefers-reduced-motion: reduce)` matches.
 */
export function prefersReducedMotion(): boolean {
	return (
		typeof matchMedia === "function" && matchMedia(REDUCED_MOTION_QUERY).matches
	);
}

/**
 * Returns the key used to track the active document transition.
 *
 * A stable server-side sentinel is used when `document` is unavailable, so
 * calls never throw in non-DOM environments.
 *
 * @returns The global `document` or the server sentinel.
 */
export function documentKey(): object {
	return typeof document !== "undefined" ? document : SERVER_KEY;
}
