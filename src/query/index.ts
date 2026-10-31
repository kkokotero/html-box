/**
 * DOM query utilities.
 *
 * @module
 */
import { DocumentScope } from "./scope/document-scope";

/**
 * Default document-backed query scope.
 *
 * Provides selector-based lookups against the global `document`. When no DOM is
 * available, non-throwing lookup methods return `undefined`, `false`, or an
 * empty array instead of causing a `ReferenceError`.
 *
 * @example
 * ```ts
 * const button = Query.one("button");
 * const items = Query.all("li");
 * const title = Query.byId("title");
 * ```
 */
export const Query = new DocumentScope();

export * from "./types";
export * from "./query-error";
export { hasDocument } from "../constants";
