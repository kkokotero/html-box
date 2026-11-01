import { NOOP } from "./constants";

/** CSS property used to name a captured element. */
const NAME_PROPERTY = "view-transition-name";

/** ID used to avoid injecting the interaction styles more than once. */
const INTERACTIVE_STYLE_ID = "html-box-view-transition-interactive";

/**
 * Allows pointer input to reach the page while the transition overlay exists.
 *
 * The transition pseudo-element tree normally captures pointer events for the
 * duration of the animation. Disabling pointer events on `::view-transition`
 * keeps the app usable while the snapshots animate.
 */
const INTERACTIVE_STYLE = "::view-transition { pointer-events: none; }";

/**
 * Resolves the CSS `view-transition-name` for a transition.
 *
 * An explicit `name` takes precedence. `null` disables the automatic name, and
 * otherwise the first transition type is used.
 *
 * @param name - Explicit name or `null` to opt out.
 * @param types - Normalized transition types.
 * @returns The CSS name, or `null` when no name should be applied.
 */
export function resolveTransitionName(
	name: string | null | undefined,
	types: readonly string[],
): string | null {
	if (name === null) return null;
	return name ?? types[0] ?? null;
}

/**
 * Applies a CSS `view-transition-name` to an element.
 *
 * The inline value and priority are captured so they can be restored when the
 * transition finishes. Elements without a style declaration are left
 * untouched.
 *
 * @param host - Document root or element used by the transition.
 * @param name - CSS name to apply.
 * @returns A cleanup function that restores the previous inline value.
 */
export function applyTransitionName(host: Element, name: string): () => void {
	const style = (host as Element & { style?: CSSStyleDeclaration }).style;
	if (!style) return NOOP;

	const previousValue = style.getPropertyValue(NAME_PROPERTY);
	const previousPriority = style.getPropertyPriority(NAME_PROPERTY);
	style.setProperty(NAME_PROPERTY, name);

	return () => {
		if (previousValue) {
			style.setProperty(NAME_PROPERTY, previousValue, previousPriority);
			return;
		}
		style.removeProperty(NAME_PROPERTY);
	};
}

/**
 * Injects the styles that keep the page interactive during a transition.
 *
 * The style element is idempotent and only added when a real transition starts.
 * Non-DOM environments are ignored.
 */
export function enableTransitionInteraction(): void {
	if (typeof document === "undefined") return;
	if (document.getElementById(INTERACTIVE_STYLE_ID)) return;

	const style = document.createElement("style");
	style.id = INTERACTIVE_STYLE_ID;
	style.textContent = INTERACTIVE_STYLE;
	(document.head ?? document.documentElement).append(style);
}
