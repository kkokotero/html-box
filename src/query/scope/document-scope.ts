import { hasDocument } from "../../constants";
import { QueryError } from "../query-error";
import { QueryErrorCode, type ElementType, type QueryRoot } from "../types";
import { filterElementByType } from "../utils";
import { ElementScope } from "./element-scope";
import { QueryScope } from "./query-scope";

/**
 * Query scope bound to the global `document`.
 *
 * This is the scope exposed by the {@link Query} singleton. Operations are safe
 * to call in environments without a DOM: when `document` is unavailable,
 * non-throwing lookups return `undefined`, `false`, or an empty array as
 * appropriate.
 *
 * @example
 * ```ts
 * const title = Query.byId("title");
 * const buttons = Query.all("button");
 * ```
 */
export class DocumentScope extends QueryScope {
	/**
	 * Creates a document-backed query scope.
	 */
	constructor() {
		super(() => (hasDocument ? document : undefined));
	}

	/**
	 * Returns an element by ID.
	 *
	 * An optional constructor can be supplied to perform a runtime type check.
	 * When the element is not found, has a different type, or no DOM is
	 * available, the method returns `undefined`.
	 *
	 * @template E - Element type returned when a constructor is supplied.
	 * @param id - Element ID without the leading `#`.
	 * @param type - Optional constructor used for the runtime type check.
	 * @returns The matching element, or `undefined` when it does not exist.
	 * @throws {QueryError} If `id` is not a non-empty string.
	 * @example
	 * ```ts
	 * const title = Query.byId("title");
	 * const input = Query.byId("email", HTMLInputElement);
	 * ```
	 */
	byId(id: string, type?: undefined): HTMLElement | undefined;
	byId<E extends Element>(id: string, type: ElementType<E>): E | undefined;
	byId<E extends HTMLElement = HTMLElement>(id: string): E | undefined;
	byId(id: string, type?: ElementType<Element>): Element | undefined {
		if (typeof id !== "string" || id === "") {
			throw new QueryError(
				QueryErrorCode.InvalidSelector,
				"Id must be a non-empty string.",
				id,
			);
		}

		if (!hasDocument) return undefined;
		return filterElementByType(document.getElementById(id), type);
	}

	/**
	 * Checks whether an element with the given ID exists.
	 *
	 * @param id - Element ID without the leading `#`.
	 * @returns `true` when the element exists, otherwise `false`.
	 * @throws {QueryError} If `id` is not a non-empty string.
	 */
	existsById(id: string): boolean {
		return this.byId(id) !== undefined;
	}

	/**
	 * Returns an element by ID and throws when it does not exist.
	 *
	 * This method is intended for cases where the element is required. Use
	 * {@link DocumentScope.byId} when a missing element is an expected outcome.
	 *
	 * @template E - Element type returned when a constructor is supplied.
	 * @param id - Element ID without the leading `#`.
	 * @param type - Optional constructor used for the runtime type check.
	 * @returns The matching element.
	 * @throws {QueryError} If `id` is not a non-empty string, no matching element
	 * exists, or no DOM is available.
	 */
	mustById<E extends Element>(id: string, type: ElementType<E>): E;
	mustById<E extends HTMLElement = HTMLElement>(id: string): E;
	mustById(id: string, type?: ElementType<Element>): Element {
		const el = this.byId(id, type as ElementType<Element>);
		if (!el)
			throw new QueryError(
				QueryErrorCode.NotFound,
				`No element found with id "${id}".`,
				`#${id}`,
			);

		return el;
	}

	/**
	 * Creates a query scope from a DOM root.
	 *
	 * Elements produce an {@link ElementScope}; documents and document fragments
	 * produce a {@link QueryScope}. A `null` or `undefined` root produces an
	 * empty {@link ElementScope}.
	 *
	 * @param root - Element, document, document fragment, or empty value.
	 * @returns A scope bound to the supplied root.
	 * @example
	 * ```ts
	 * const documentScope = Query.from(document);
	 * const formScope = Query.from(document.querySelector("form"));
	 * ```
	 */
	from(root: Element | null | undefined): ElementScope;
	from(root: Document | DocumentFragment): QueryScope;
	from(root: QueryRoot | null | undefined): QueryScope | ElementScope {
		if (root == null || root instanceof Element)
			return new ElementScope(root ?? undefined);
		return new QueryScope(() => root);
	}
}
