import { QueryError } from "./query-error";
import { QueryErrorCode, type ElementType } from "./types";

/**
 * Validates that a selector is a non-empty string.
 *
 * @param selector - Selector to validate.
 * @throws {QueryError} If the selector is not a string, is empty, or contains
 * only whitespace.
 */
export function validateSelector(selector: string): void {
	if (typeof selector !== "string" || selector.trim() === "") {
		throw new QueryError(
			QueryErrorCode.InvalidSelector,
			"Selector must be a non-empty string.",
			selector,
		);
	}
}

/**
 * Executes a DOM query and normalizes selector-related failures.
 *
 * The selector is validated before the query runs. If the underlying DOM API
 * throws a `SyntaxError` `DOMException`, it is converted into a
 * {@link QueryError} with code {@link QueryErrorCode.InvalidSelector}. Other
 * errors are rethrown unchanged.
 *
 * @template T - Result type produced by the query.
 * @param selector - Selector used by the query.
 * @param queryFn - Query operation to execute.
 * @returns The value returned by `queryFn`.
 * @throws {QueryError} If the selector is invalid or not a non-empty string.
 */
export function executeWithSelectorHandling<T>(
	selector: string,
	queryFn: () => T,
): T {
	validateSelector(selector);
	try {
		return queryFn();
	} catch (error) {
		if (error instanceof DOMException && error.name === "SyntaxError") {
			throw new QueryError(
				QueryErrorCode.InvalidSelector,
				`Invalid selector: "${selector}"`,
				selector,
				error,
			);
		}
		throw error;
	}
}

/**
 * Filters a nullable element by an optional constructor type.
 *
 * When `elementType` is supplied, the element is checked with `instanceof`.
 * When it is omitted, the element is returned as `E` without a runtime type
 * check.
 *
 * @template E - Expected element type.
 * @param element - Candidate element, or `null` when no element was found.
 * @param elementType - Optional constructor used for the runtime type check.
 * @returns The element cast to `E` when it matches, or `undefined` otherwise.
 */
export function filterElementByType<E extends Element>(
	element: Element | null,
	elementType?: ElementType<E>,
): E | undefined {
	if (!element) return undefined;
	if (!elementType) return element as E;
	return element instanceof elementType ? (element as E) : undefined;
}
