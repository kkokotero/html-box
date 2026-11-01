import type { Reactive } from "./reactive";
import type { Equals, ReactiveHandler, ReactiveSubscription } from "./types";

/**
 * One queued value change.
 *
 * @template T - Value type.
 * @internal
 */
export interface Change<T> {
	/** Value before the change. */
	readonly previous: T;
	/** Value after the change. */
	readonly next: T;
	/** Whether the change was forced even though the value did not change. */
	readonly forced: boolean;
}

/**
 * Internal subscription state.
 *
 * @template T - Source value type.
 * @internal
 */
export interface Sub<T> {
	/** Original handler. */
	readonly handler: ReactiveHandler<any>;
	/** Optional value selector. */
	readonly select: ((value: T) => unknown) | null;
	/** Equality check used for the delivered value. */
	readonly equals: Equals<any>;
	/** Whether the subscription cancels after the first delivery. */
	readonly once: boolean;
	/** Public subscription handle. */
	handle: ReactiveSubscription;
	/** Last value or selected slice delivered to this subscription. */
	delivered: unknown;
	/** Whether delivery is paused. */
	paused: boolean;
	/** Whether a notification was missed while paused. */
	stale: boolean;
	/** Whether the subscription is still active. */
	active: boolean;
}

/**
 * Configuration used by derived reactive values.
 *
 * @template T - Derived value type.
 * @internal
 */
export interface DerivedInit<T> {
	/** Explicit reactive dependencies. */
	readonly sources: readonly Reactive<any>[];
	/** Computation receiving the source values. */
	readonly compute: (...values: any[]) => T;
}
