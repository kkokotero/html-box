import type { ReactiveSubscription } from "./types";

/**
 * Maximum processing rounds for one reactive during a single flush.
 *
 * Exceeding this limit indicates that a subscriber keeps changing the value it
 * listens to.
 */
export const MAX_ROUNDS = 1000;

/** No-operation callback. */
export const NOOP: () => void = () => {};

/** Subscription returned for inert or already-aborted subscriptions. */
export const INACTIVE_SUBSCRIPTION: ReactiveSubscription = Object.freeze({
	active: false,
	paused: false,
	cancel: NOOP,
	unsubscribe: NOOP,
	pause: NOOP,
	resume: NOOP,
});
