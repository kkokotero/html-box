import type { QueryErrorCode } from "./types";

/**
 * Error thrown when a query cannot be completed.
 *
 * The error exposes a machine-readable {@link QueryError.code} and, when
 * applicable, the selector or ID that caused the failure. Invalid selectors and
 * missing elements are reported as distinct error codes.
 *
 * @example
 * ```ts
 * try {
 *   Query.must("#missing");
 * } catch (error) {
 *   if (error instanceof QueryError && error.code === QueryErrorCode.NotFound) {
 *     console.error(error.selector);
 *   }
 * }
 * ```
 */
export class QueryError extends Error {
	/**
	 * Machine-readable error code describing the failure.
	 */
	readonly code: QueryErrorCode;

	/**
	 * Selector or ID associated with the failed query, when available.
	 */
	readonly selector: string | undefined;

	/**
	 * Creates a query error.
	 *
	 * @param code - Machine-readable error code describing the failure.
	 * @param message - Human-readable error message.
	 * @param selector - Selector or ID associated with the failure.
	 * @param cause - Underlying error that caused the failure, if any.
	 */
	constructor(
		code: QueryErrorCode,
		message: string,
		selector?: string,
		cause?: unknown,
	) {
		super(message);
		this.name = "QueryError";
		this.code = code;
		this.selector = selector;
		if (cause !== undefined) (this as { cause?: unknown }).cause = cause;
	}
}
