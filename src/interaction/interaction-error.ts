import type { InteractionErrorCode } from "./types";

/**
 * Error thrown when an interaction cannot be created or registered.
 *
 * The error exposes a machine-readable {@link InteractionError.code} and may
 * include the underlying cause when the failure originates from a DOM API.
 *
 * @example
 * ```ts
 * try {
 *   new Interaction(null as unknown as Element);
 * } catch (error) {
 *   if (error instanceof InteractionError) {
 *     console.error(error.code);
 *   }
 * }
 * ```
 */
export class InteractionError extends Error {
	/**
	 * Machine-readable error code.
	 */
	readonly code: InteractionErrorCode;

	/**
	 * Creates an interaction error.
	 *
	 * @param code - Machine-readable error code.
	 * @param message - Human-readable error message.
	 * @param cause - Underlying error that caused the failure, if any.
	 */
	constructor(code: InteractionErrorCode, message: string, cause?: unknown) {
		super(message);
		this.name = "InteractionError";
		this.code = code;
		if (cause !== undefined) (this as { cause?: unknown }).cause = cause;
	}
}
