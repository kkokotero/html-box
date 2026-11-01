import type { ViewTransitionErrorCode } from "./types";

/**
 * Error thrown when the View Transition wrapper is used incorrectly.
 *
 * Errors produced by the native View Transition API are preserved as-is and
 * are not wrapped in this class.
 */
export class ViewTransitionError extends Error {
	/** Machine-readable failure code. */
	readonly code: ViewTransitionErrorCode;

	/**
	 * Creates a view transition API error.
	 *
	 * @param code - Stable failure code.
	 * @param message - Human-readable explanation.
	 */
	constructor(code: ViewTransitionErrorCode, message: string) {
		super(message);
		this.name = "ViewTransitionError";
		this.code = code;
	}
}
