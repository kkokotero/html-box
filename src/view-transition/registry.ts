import type { NativeViewTransition } from "./types";

/**
 * Transitions started by this wrapper, keyed by document or element.
 *
 * A `WeakMap` avoids retaining elements and does not keep the document alive.
 *
 * @internal
 */
const activeTransitions = new WeakMap<object, NativeViewTransition>();

/**
 * Registers the most recent transition for a scope.
 *
 * @param key - Document or element that owns the transition.
 * @param transition - Native or fallback transition.
 */
export function setActiveTransition(
	key: object,
	transition: NativeViewTransition,
): void {
	activeTransitions.set(key, transition);
}

/**
 * Returns the transition registered for a scope.
 *
 * @param key - Document or element to inspect.
 * @returns The registered transition, or `null`.
 */
export function getActiveTransition(key: object): NativeViewTransition | null {
	return activeTransitions.get(key) ?? null;
}

/**
 * Removes a transition from the registry when it is still the current one.
 *
 * The identity check prevents an older transition from clearing a newer one
 * that started before the older one finished.
 *
 * @param key - Document or element that owns the transition.
 * @param transition - Transition that finished.
 */
export function clearActiveTransition(
	key: object,
	transition: NativeViewTransition,
): void {
	if (activeTransitions.get(key) === transition) {
		activeTransitions.delete(key);
	}
}
