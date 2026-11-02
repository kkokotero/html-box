/** Stable error codes exposed by the Browser API. */
export type BrowserErrorCode =
	| "NOT_SUPPORTED"
	| "UNSAFE_URL"
	| "INVALID_ARGUMENT"
	| "INVALID_OPTION"
	| "POPUP_BLOCKED"
	| "UNAVAILABLE"
	| "PERMISSION_DENIED"
	| "CLOSED"
	| "TIMEOUT"
	| "REMOTE_ERROR";

export class BrowserError extends Error {
	readonly code: BrowserErrorCode;

	constructor(code: BrowserErrorCode, message: string) {
		super(message);
		this.name = "BrowserError";
		this.code = code;
	}
}
