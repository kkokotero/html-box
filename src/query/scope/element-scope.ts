import { type ElementType, type HTMLTags, type SVGTags } from "../types";
import {
	executeWithSelectorHandling,
	validateSelector,
	filterElementByType,
} from "../utils";
import { QueryScope } from "./query-scope";

/**
 * Query scope bound to a specific element.
 *
 * In addition to the selector queries inherited from {@link QueryScope}, this
 * scope exposes element-relative traversal methods such as
 * {@link ElementScope.closest}, {@link ElementScope.parent}, and
 * {@link ElementScope.matches}.
 *
 * @example
 * ```ts
 * const scope = Query.from(document.querySelector("#app"));
 * const item = scope.closest("li");
 * ```
 */
export class ElementScope extends QueryScope {
	/**
	 * Creates a scope bound to an element.
	 *
	 * @param element - Element used as the query root, or `undefined` when no
	 * element is available.
	 */
	constructor(private readonly element: Element | undefined) {
		super(() => element);
	}

	/**
	 * Returns the closest matching element in the scoped element's ancestor
	 * chain.
	 *
	 * The search starts at the scoped element itself and continues through its
	 * ancestors. When a known HTML or SVG tag name is passed, the return type is
	 * narrowed to the corresponding element interface. An optional constructor
	 * can be supplied to perform a runtime type check.
	 *
	 * @template K - Known HTML or SVG tag name.
	 * @template E - Element type returned when a constructor is supplied.
	 * @param selector - CSS selector or known tag name.
	 * @param type - Optional constructor used for the runtime type check.
	 * @returns The closest match, or `undefined` when no match exists or the
	 * scope has no element.
	 * @throws {QueryError} If the selector is empty, not a string, or invalid
	 * CSS.
	 */
	closest<K extends keyof HTMLTags>(selector: K): HTMLTags[K] | undefined;
	closest<K extends keyof SVGTags>(selector: K): SVGTags[K] | undefined;
	closest<E extends Element>(
		selector: string,
		type: ElementType<E>,
	): E | undefined;
	closest<E extends Element = Element>(selector: string): E | undefined;
	closest(selector: string, type?: ElementType<Element>): Element | undefined {
		const el = this.element;

		if (!el) {
			validateSelector(selector);
			return undefined;
		}

		return filterElementByType(
			executeWithSelectorHandling(selector, () => el.closest(selector)),
			type,
		);
	}

	/**
	 * Returns the parent element of the scoped element.
	 *
	 * @template E - Element type to return.
	 * @returns The parent element, or `undefined` when the scope has no element
	 * or the element has no parent.
	 */
	parent<E extends Element = Element>(): E | undefined {
		return (this.element?.parentElement as E | undefined) ?? undefined;
	}

	/**
	 * Tests whether a node is the scoped element or one of its descendants.
	 *
	 * @param node - Node to test.
	 * @returns `true` when the node belongs to the scoped subtree, otherwise
	 * `false`.
	 */
	contains(node: Node | null | undefined): boolean {
		return !!node && !!this.element && this.element.contains(node);
	}

	/**
	 * Tests whether the scoped element matches a selector.
	 *
	 * @param selector - CSS selector.
	 * @returns `true` when the element matches, otherwise `false`.
	 * @throws {QueryError} If the selector is empty, not a string, or invalid
	 * CSS.
	 */
	matches(selector: string): boolean {
		const el = this.element;

		if (!el) {
			validateSelector(selector);
			return false;
		}

		return executeWithSelectorHandling(selector, () => el.matches(selector));
	}
}
