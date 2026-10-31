import { QueryError } from "../query-error";
import {
	QueryErrorCode,
	type ElementType,
	type HTMLTags,
	type QueryRoot,
	type SVGTags,
} from "../types";
import {
	executeWithSelectorHandling,
	validateSelector,
	filterElementByType,
} from "../utils";

/**
 * Selector-based query operations over a lazily resolved query root.
 *
 * A scope resolves its root on every operation, allowing it to reflect changes
 * to the underlying document or element over time. Accessor and lookup methods
 * return `undefined` or an empty array when the root is unavailable, while
 * strict variants such as {@link QueryScope.must} throw a {@link QueryError}
 * instead.
 *
 * @example
 * ```ts
 * const scope = Query.from(document);
 * const button = scope.one("button");
 * const items = scope.all("li");
 * ```
 */
export class QueryScope {
	/**
	 * Creates a query scope.
	 *
	 * @param resolve - Returns the current query root, or `undefined` when the
	 * root is unavailable.
	 */
	constructor(private resolve: () => QueryRoot | undefined) {}

	/**
	 * Current query root, resolved on access.
	 *
	 * @returns The current query root, or `undefined` when the root is
	 * unavailable.
	 */
	get root(): QueryRoot | undefined {
		return this.resolve();
	}

	/**
	 * Returns the first element matching a selector.
	 *
	 * When a known HTML or SVG tag name is passed, the return type is narrowed
	 * to the corresponding element interface. An optional constructor can be
	 * supplied to perform a runtime type check.
	 *
	 * @template K - Known HTML or SVG tag name.
	 * @template E - Element type returned when a constructor is supplied.
	 * @param selector - CSS selector or known tag name.
	 * @param type - Optional constructor used for the runtime type check.
	 * @returns The first matching element, or `undefined` when no element
	 * matches or the scope has no root.
	 * @throws {QueryError} If the selector is empty, not a string, or invalid
	 * CSS.
	 * @example
	 * ```ts
	 * const button = Query.one("button");
	 * const input = Query.one("#email", HTMLInputElement);
	 * ```
	 */
	one<K extends keyof HTMLTags>(selector: K): HTMLTags[K] | undefined;
	one<K extends keyof SVGTags>(selector: K): SVGTags[K] | undefined;
	one<E extends Element>(selector: string, type: ElementType<E>): E | undefined;
	one<E extends Element = Element>(selector: string): E | undefined;
	one(selector: string, type?: ElementType<Element>): Element | undefined {
		const root = this.resolve();

		if (!root) {
			validateSelector(selector);
			return undefined;
		}

		return filterElementByType(
			executeWithSelectorHandling(selector, () => root.querySelector(selector)),
			type,
		);
	}

	/**
	 * Returns all elements matching a selector.
	 *
	 * When a known HTML or SVG tag name is passed, the return type is narrowed
	 * to an array of the corresponding element interfaces. An optional
	 * constructor can be supplied to filter the results with `instanceof`.
	 *
	 * @template K - Known HTML or SVG tag name.
	 * @template E - Element type returned when a constructor is supplied.
	 * @param selector - CSS selector or known tag name.
	 * @param type - Optional constructor used to filter the results.
	 * @returns An array of matching elements, or an empty array when no element
	 * matches or the scope has no root.
	 * @throws {QueryError} If the selector is empty, not a string, or invalid
	 * CSS.
	 * @example
	 * ```ts
	 * const items = Query.all("li");
	 * const inputs = Query.all("input", HTMLInputElement);
	 * ```
	 */
	all<K extends keyof HTMLTags>(selector: K): HTMLTags[K][];
	all<K extends keyof SVGTags>(selector: K): SVGTags[K][];
	all<E extends Element>(selector: string, type: ElementType<E>): E[];
	all<E extends Element = Element>(selector: string): E[];
	all(selector: string, type?: ElementType<Element>): Element[] {
		const root = this.resolve();

		if (!root) {
			validateSelector(selector);
			return [];
		}

		const list = executeWithSelectorHandling(selector, () =>
			root.querySelectorAll(selector),
		);
		const items = Array.from(list);
		return type ? items.filter((el) => el instanceof type) : items;
	}

	/**
	 * Returns the first element matching a selector and throws when none exists.
	 *
	 * This method is intended for cases where the element is required. Use
	 * {@link QueryScope.one} when a missing element is an expected outcome.
	 *
	 * @template K - Known HTML or SVG tag name.
	 * @template E - Element type returned when a constructor is supplied.
	 * @param selector - CSS selector or known tag name.
	 * @param type - Optional constructor used for the runtime type check.
	 * @returns The first matching element.
	 * @throws {QueryError} If the selector is invalid or no matching element
	 * exists.
	 * @example
	 * ```ts
	 * const form = Query.must("form");
	 * const input = Query.must("#email", HTMLInputElement);
	 * ```
	 */
	must<K extends keyof HTMLTags>(selector: K): HTMLTags[K];
	must<K extends keyof SVGTags>(selector: K): SVGTags[K];
	must<E extends Element>(selector: string, type: ElementType<E>): E;
	must<E extends Element = Element>(selector: string): E;
	must(selector: string, type?: ElementType<Element>): Element {
		const el = this.one(selector, type as ElementType<Element>);

		if (!el) {
			const detail = type
				? ` of type ${(type as { name?: string }).name ?? "expected"}`
				: "";
			throw new QueryError(
				QueryErrorCode.NotFound,
				`No element${detail} found for selector "${selector}".`,
				selector,
			);
		}

		return el;
	}

	/**
	 * Checks whether at least one element matches a selector.
	 *
	 * @param selector - CSS selector.
	 * @returns `true` when a matching element exists, otherwise `false`.
	 * @throws {QueryError} If the selector is empty, not a string, or invalid
	 * CSS.
	 */
	exists(selector: string): boolean {
		return this.one(selector) !== undefined;
	}

	/**
	 * Counts the elements matching a selector.
	 *
	 * @param selector - CSS selector.
	 * @returns The number of matching elements.
	 * @throws {QueryError} If the selector is empty, not a string, or invalid
	 * CSS.
	 */
	count(selector: string): number {
		return this.all(selector).length;
	}

	/**
	 * Returns the element at a specific position among the matches.
	 *
	 * @template E - Element type to return.
	 * @param selector - CSS selector.
	 * @param index - Zero-based index. Negative values count from the end, where
	 * `-1` refers to the last match.
	 * @returns The element at the requested position, or `undefined` when the
	 * index is out of bounds.
	 * @throws {QueryError} If the selector is empty, not a string, or invalid
	 * CSS.
	 */
	at<E extends Element = Element>(
		selector: string,
		index: number,
	): E | undefined {
		const items = this.all<E>(selector);
		const i = index < 0 ? items.length + index : index;
		return items[i] ?? undefined;
	}

	/**
	 * Returns the first element matching a selector.
	 *
	 * @template E - Element type to return.
	 * @param selector - CSS selector.
	 * @returns The first matching element, or `undefined` when none matches.
	 * @throws {QueryError} If the selector is empty, not a string, or invalid
	 * CSS.
	 */
	first<E extends Element = Element>(selector: string): E | undefined {
		return this.at<E>(selector, 0);
	}

	/**
	 * Returns the last element matching a selector.
	 *
	 * @template E - Element type to return.
	 * @param selector - CSS selector.
	 * @returns The last matching element, or `undefined` when none matches.
	 * @throws {QueryError} If the selector is empty, not a string, or invalid
	 * CSS.
	 */
	last<E extends Element = Element>(selector: string): E | undefined {
		return this.at<E>(selector, -1);
	}
}
