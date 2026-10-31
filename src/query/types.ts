/**
 * A constructor-like function type whose instances extend {@link Element}.
 *
 * The `prototype` property is included so values of this type can be used with
 * the `instanceof` operator and still preserve the concrete element type.
 *
 * @template E - Concrete element type produced by the constructor.
 */
export type ElementType<E extends Element> = Function & { prototype: E };

/**
 * Mapping of HTML tag names to their corresponding element interfaces.
 *
 * @see {@link HTMLElementTagNameMap}
 */
export type HTMLTags = HTMLElementTagNameMap;

/**
 * Mapping of SVG tag names to their corresponding element interfaces.
 *
 * @see {@link SVGElementTagNameMap}
 */
export type SVGTags = SVGElementTagNameMap;

/**
 * Any node that can act as the root of a DOM query.
 *
 * A query root can be a document, a document fragment, or an element.
 */
export type QueryRoot = Document | DocumentFragment | Element;

/**
 * Machine-readable error codes emitted by {@link QueryError}.
 */
export enum QueryErrorCode {
	/**
	 * The selector or ID is not a non-empty string, or the selector is not
	 * syntactically valid CSS.
	 */
	InvalidSelector = "INVALID_SELECTOR",

	/**
	 * No element matched the requested selector or ID.
	 */
	NotFound = "NOT_FOUND",

	/**
	 * Reserved for operations that require a DOM when no global `document` is
	 * available.
	 */
	NoDOM = "NO_DOM",
}
