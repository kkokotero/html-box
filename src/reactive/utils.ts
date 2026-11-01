import { ReactiveError } from "./reactive-error";
import { type ReactiveOptions, ReactiveErrorCode } from "./types";

/**
 * Reports an error without interrupting the current operation.
 *
 * Uses `reportError` when available; otherwise the error is rethrown from a
 * timer callback.
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
 * Validates the options shared by reactive and derived values.
 *
 * @template T - Value type.
 * @param options - Raw options value.
 * @returns The validated options object.
 * @throws {ReactiveError} If an option has an invalid type.
 * @internal
 */
export function validateOptions<T>(options: unknown): ReactiveOptions<T> {
	if (options === undefined || options === null) return {};
	if (typeof options !== "object") {
		throw new ReactiveError(
			ReactiveErrorCode.InvalidOption,
			"Options must be an object.",
		);
	}

	const value = options as ReactiveOptions<T>;
	if (value.equals !== undefined && typeof value.equals !== "function") {
		throw new ReactiveError(
			ReactiveErrorCode.InvalidOption,
			"Option `equals` must be a function.",
		);
	}
	if (value.onError !== undefined && typeof value.onError !== "function") {
		throw new ReactiveError(
			ReactiveErrorCode.InvalidOption,
			"Option `onError` must be a function.",
		);
	}
	return value;
}

/**
 * Validates that a value is a function.
 *
 * @template F - Expected function type.
 * @param value - Value to validate.
 * @param message - Error message used when the value is not callable.
 * @param code - Error code to attach.
 * @throws {ReactiveError} If the value is not a function.
 * @internal
 */
export function assertFunction<F extends (...args: any[]) => any>(
	value: unknown,
	message: string,
	code: ReactiveErrorCode = ReactiveErrorCode.InvalidArgument,
): asserts value is F {
	if (typeof value !== "function") {
		throw new ReactiveError(code, message);
	}
}

/**
 * Checks whether a value is a plain object.
 *
 * @param value - Value to inspect.
 * @returns `true` for object literals and null-prototype objects.
 * @internal
 */
export function isPlainObject(
	value: unknown,
): value is Record<string, unknown> {
	if (value === null || typeof value !== "object") return false;
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}

/**
 * Compares arrays and objects one level deep.
 *
 * Primitive values are compared with `Object.is`.
 *
 * @param a - First value.
 * @param b - Second value.
 * @returns `true` when both values are equal at the first level.
 * @internal
 */
export function shallowEqual(a: unknown, b: unknown): boolean {
	if (Object.is(a, b)) return true;
	if (
		typeof a !== "object" ||
		typeof b !== "object" ||
		a === null ||
		b === null
	) {
		return false;
	}
	if (Array.isArray(a) !== Array.isArray(b)) return false;

	const keysA = Object.keys(a);
	if (keysA.length !== Object.keys(b).length) return false;
	return keysA.every(
		(key) =>
			Object.prototype.hasOwnProperty.call(b, key) &&
			Object.is(
				(a as Record<string, unknown>)[key],
				(b as Record<string, unknown>)[key],
			),
	);
}
