import { type ViewTransitionOptions, ViewTransitionErrorCode } from "./types";
import { ViewTransitionError } from "./view-transition-error";

/**
 * Validates and normalizes the transition `types` option.
 *
 * Duplicate types are removed. An empty list is returned when the option is
 * omitted.
 *
 * @param types - Raw option value.
 * @returns Unique, non-empty transition types.
 * @throws {ViewTransitionError} If the value is not an array of non-empty
 * strings.
 */
export function normalizeTypes(types: unknown): string[] {
	if (types === undefined) return [];
	if (
		!Array.isArray(types) ||
		types.some((type) => typeof type !== "string" || type === "")
	) {
		throw new ViewTransitionError(
			ViewTransitionErrorCode.InvalidOption,
			"Option `types` must be an array of non-empty strings.",
		);
	}
	return [...new Set(types as string[])];
}

/**
 * Validates the options object passed to {@link ViewTransition.start}.
 *
 * @param options - Raw options value.
 * @returns The validated options object.
 * @throws {ViewTransitionError} If the options object or any option is
 * invalid.
 */
export function validateOptions(options: unknown): ViewTransitionOptions {
	if (options === undefined || options === null) return {};
	if (typeof options !== "object") {
		throw new ViewTransitionError(
			ViewTransitionErrorCode.InvalidArgument,
			"Options must be an object.",
		);
	}

	const value = options as ViewTransitionOptions;
	for (const key of ["onStart", "onReady", "onFinish", "onError"] as const) {
		if (value[key] !== undefined && typeof value[key] !== "function") {
			throw new ViewTransitionError(
				ViewTransitionErrorCode.InvalidOption,
				`Option \`${key}\` must be a function.`,
			);
		}
	}
	if (
		value.reducedMotion !== undefined &&
		value.reducedMotion !== "respect" &&
		value.reducedMotion !== "ignore"
	) {
		throw new ViewTransitionError(
			ViewTransitionErrorCode.InvalidOption,
			'Option `reducedMotion` must be "respect" or "ignore".',
		);
	}
	if (
		value.name !== undefined &&
		value.name !== null &&
		(typeof value.name !== "string" || value.name === "")
	) {
		throw new ViewTransitionError(
			ViewTransitionErrorCode.InvalidOption,
			"Option `name` must be a non-empty string or null.",
		);
	}
	if (
		value.interactive !== undefined &&
		typeof value.interactive !== "boolean"
	) {
		throw new ViewTransitionError(
			ViewTransitionErrorCode.InvalidOption,
			"Option `interactive` must be a boolean.",
		);
	}
	return value;
}
