import type { PointerErrorCode } from "./types";

/**
 * Error thrown when a pointer instance cannot be created, configured, or used.
 *
 * The error exposes a machine-readable {@link PointerError.code} and may include
 * the underlying cause when the failure originates from a DOM API.
 */
export class PointerError extends Error {
	/**
	 * Machine-readable error code.
	 */
	readonly code: PointerErrorCode;

	/**
	 * Creates a pointer error.
	 *
	 * @param code - Machine-readable error code.
	 * @param message - Human-readable error message.
	 * @param cause - Underlying error that caused the failure, if any.
	 */
	constructor(code: PointerErrorCode, message: string, cause?: unknown) {
		super(message);
		this.name = "PointerError";
		this.code = code;
		if (cause !== undefined) (this as { cause?: unknown }).cause = cause;
	}
}
