import type { ReactiveErrorCode } from "./types";

/**
 * Error thrown when a reactive value cannot be created, read, or updated.
 *
 * The error exposes a stable machine-readable code so callers can react to
 * closed values, read-only derivations, invalid input, or update cycles.
 */
export class ReactiveError extends Error {
	/** Machine-readable failure code. */
	readonly code: ReactiveErrorCode;

	/**
	 * Creates a reactive API error.
	 *
	 * @param code - Stable failure code.
	 * @param message - Human-readable explanation.
	 */
	constructor(code: ReactiveErrorCode, message: string) {
		super(message);
		this.name = "ReactiveError";
		this.code = code;
	}
}
