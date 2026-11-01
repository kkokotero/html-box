import type { InitialTransitionError } from "./internal-types";
import { clearActiveTransition } from "./registry";
import type { NativeViewTransition, ViewTransitionOptions } from "./types";
import { isAbortError, reportUncaught, safely } from "./utils";

/**
 * Connects the native transition promises to the public callbacks.
 *
 * Errors are reported once per transition. Errors thrown by user callbacks are
 * reported as uncaught errors and never prevent the DOM update.
 *
 * @param transition - Native or fallback transition.
 * @param key - Document or element that owns the transition.
 * @param options - Validated public options.
 * @param synthetic - Whether the transition is a fallback.
 * @param initialError - Error captured while starting the native transition.
 * @param cleanup - Extra cleanup to run when the transition settles.
 * @internal
 */
export function wireTransition(
	transition: NativeViewTransition,
	key: object,
	options: ViewTransitionOptions,
	synthetic: boolean,
	initialError?: InitialTransitionError,
	cleanup?: () => void,
): void {
	let failed = false;

	const fail = (error: unknown): void => {
		// Once per transition: the three rejections usually share one error.
		if (failed) return;
		failed = true;
		if (options.onError) safely(options.onError, error);
		else reportUncaught(error);
	};

	const settle = (): void => {
		cleanup?.();
		clearActiveTransition(key, transition);
	};

	if (initialError) fail(initialError.error);

	transition.updateCallbackDone.then(undefined, fail);

	transition.ready.then(
		() => safely(options.onReady),
		(error) => {
			// The fallback rejects `ready` on purpose. In the native API, an
			// AbortError means the transition was intentionally skipped.
			if (!synthetic && !isAbortError(error)) fail(error);
		},
	);

	transition.finished.then(
		() => {
			settle();
			safely(options.onFinish);
			return undefined;
		},
		(error) => {
			settle();
			fail(error);
			return undefined;
		},
	);
}
