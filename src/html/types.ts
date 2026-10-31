import { HtmlError, HtmlErrorCode } from "./html-error";

/** Options shared by all renders made by a configured HTML tag. */
export interface HtmlOptions {
	/** Signal that removes every event listener registered by this tag when aborted. */
	signal?: AbortSignal;
}

/** Callable HTML template tag that can return one element or a fragment. */
export interface HtmlTag {
	/**
	 * Renders a template that must contain exactly one root element.
	 *
	 * @typeParam E - Expected root element type.
	 * @param strings - Static segments supplied by the template literal.
	 * @param values - Dynamic child, attribute, property, and event values.
	 * @returns The single rendered root element.
	 * @throws {@link HtmlError} If the template is invalid or has no single root.
	 */
	<E extends Element = HTMLElement>(
		strings: TemplateStringsArray,
		...values: unknown[]
	): E;
	/**
	 * Renders a template with any number of top-level nodes.
	 *
	 * @param strings - Static segments supplied by the template literal.
	 * @param values - Dynamic child, attribute, property, and event values.
	 * @returns A fragment containing the rendered nodes.
	 */
	fragment(
		strings: TemplateStringsArray,
		...values: unknown[]
	): DocumentFragment;
}

/** Event listener forms accepted by `@event` bindings. */
export type EventHandler<E extends Event = Event> =
	| ((this: Element, event: E) => void)
	| { handleEvent(event: E): void };

/** HTML markup explicitly marked for unsanitized insertion. */
export class TrustedHtml {
	/** Raw markup explicitly approved by the caller. */
	readonly markup: string;

	/** @internal Use {@link unsafeHtml} to construct trusted markup. */
	constructor(markup: string) {
		this.markup = markup;
	}

	/** Returns the underlying markup string. */
	toString(): string {
		return this.markup;
	}
}

/**
 * Marks trusted markup for unsanitized insertion into a template.
 *
 * Only use this function with markup from a trusted source. The returned value
 * bypasses default text-node handling and can introduce executable content.
 *
 * @param markup - Trusted HTML markup.
 * @returns A wrapper recognized by the HTML renderer.
 * @throws {@link HtmlError} If `markup` is not a string.
 */
export function unsafeHtml(markup: string): TrustedHtml {
	if (typeof markup !== "string") {
		throw new HtmlError(
			HtmlErrorCode.InvalidValue,
			"unsafeHtml() expects a string.",
		);
	}
	return new TrustedHtml(markup);
}
