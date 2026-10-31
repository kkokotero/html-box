/** Stable error codes exposed by the Viewport API. */
export enum ViewportErrorCode {
	/** The provided target is not an Element. */
	InvalidTarget = "INVALID_TARGET",
	/** The requested event name is unsupported. */
	InvalidEvent = "INVALID_EVENT",
	/** The event handler is not callable. */
	InvalidHandler = "INVALID_HANDLER",
	/** A Viewport option is invalid. */
	InvalidOption = "INVALID_OPTION",
	/** An operation requires an open Viewport instance. */
	Closed = "CLOSED",
}

/** Error thrown when a viewport instance cannot be created, configured, or used. */
export class ViewportError extends Error {
	/** Machine-readable failure code. */
	readonly code: ViewportErrorCode;

	/**
	 * Creates a viewport error.
	 *
	 * @param code - Stable failure code.
	 * @param message - Human-readable explanation.
	 */
	constructor(code: ViewportErrorCode, message: string) {
		super(message);
		this.name = "ViewportError";
		this.code = code;
	}
}
