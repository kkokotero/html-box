/**
 * Reports an error without interrupting the current operation.
 *
 * Uses `reportError` when available so the browser treats it like an uncaught
 * error. Otherwise the error is rethrown from a timer callback.
 *
 * @param error - Error or value to report.
 * @internal
 */
export function reportUncaught(error: unknown): void {
	const report = (globalThis as { reportError?: (value: unknown) => void })
		.reportError;
	if (typeof report === "function") {
		report.call(globalThis, error);
		return;
	}
	setTimeout(() => {
		throw error;
	});
}

/**
 * Checks whether a value is an `Element`.
 *
 * Safe to call in environments without a DOM.
 *
 * @param value - Value to check.
 * @returns `true` when the value is an `Element`.
 */
export function isElement(value: unknown): value is Element {
	return typeof Element !== "undefined" && value instanceof Element;
}

/**
 * Creates an abort error with a cross-environment fallback.
 *
 * @param message - Human-readable explanation.
 * @returns A `DOMException` when available, otherwise an `Error` named
 * `"AbortError"`.
 */
export function abortError(message: string): Error {
	if (typeof DOMException === "function") {
		return new DOMException(message, "AbortError");
	}
	const error = new Error(message);
	error.name = "AbortError";
	return error;
}

/**
 * Checks whether a value is an abort error.
 *
 * @param error - Value to inspect.
 * @returns `true` when the value has the name `"AbortError"`.
 */
export function isAbortError(error: unknown): boolean {
	return (error as { name?: unknown } | null)?.name === "AbortError";
}

/**
 * Calls a user callback without letting its errors affect the DOM update.
 *
 * @param callback - Optional callback to invoke.
 * @param args - Arguments forwarded to the callback.
 */
export function safely(
	callback: ((...args: never[]) => void) | undefined,
	...args: unknown[]
): void {
	if (!callback) return;
	try {
		(callback as (...values: unknown[]) => void)(...args);
	} catch (error) {
		reportUncaught(error);
	}
}
