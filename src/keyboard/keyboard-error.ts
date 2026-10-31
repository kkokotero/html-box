/** Stable error codes exposed by the Keyboard API. */
export enum KeyboardErrorCode {
	/** The configured target does not support DOM event listeners. */
	InvalidTarget = "INVALID_TARGET",
	/** A shortcut is malformed or uses an unsupported key or modifier. */
	InvalidShortcut = "INVALID_SHORTCUT",
	/** A listener handler is not callable. */
	InvalidHandler = "INVALID_HANDLER",
	/** A keyboard option has an unsupported value. */
	InvalidOption = "INVALID_OPTION",
	/** An operation requires an open Keyboard instance. */
	Closed = "CLOSED",
}

/** Error thrown when a keyboard shortcut cannot be registered or used. */
export class KeyboardError extends Error {
	/** Machine-readable failure code. */
	readonly code: KeyboardErrorCode;

	/**
	 * Creates a keyboard API error.
	 *
	 * @param code - Stable failure code.
	 * @param message - Human-readable explanation.
	 */
	constructor(code: KeyboardErrorCode, message: string) {
		super(message);
		this.name = "KeyboardError";
		this.code = code;
	}
}
