/**
 * Reactive public types and enums.
 *
 * @module
 */
import type { Reactive } from "./reactive";

/**
 * Machine-readable error codes emitted by {@link ReactiveError}.
 */
export enum ReactiveErrorCode {
	/** The reactive value has already been closed. */
	Closed = "CLOSED",

	/** A derived value cannot be changed directly. */
	ReadOnly = "READONLY",

	/** A function argument is missing or has the wrong type. */
	InvalidArgument = "INVALID_ARGUMENT",

	/** An option has an unsupported value or type. */
	InvalidOption = "INVALID_OPTION",

	/** A subscriber keeps changing the value it listens to. */
	Cycle = "CYCLE",
}

/**
 * Equality function used to decide whether a change should be emitted.
 *
 * @template T - Value type.
 */
export type Equals<T> = (a: T, b: T) => boolean;

/**
 * Options shared by reactive values and derived values.
 *
 * @template T - Value type.
 */
export interface ReactiveOptions<T> {
	/** Equality check. Defaults to `Object.is`. */
	equals?: Equals<T>;
	/** Aborting the signal calls `close()`. */
	signal?: AbortSignal;
	/**
	 * Receives handler and derived-computation errors. When omitted, errors are
	 * reported as uncaught errors.
	 */
	onError?: (error: unknown) => void;
}

/**
 * Options for resuming a paused subscription or reactive value.
 */
export interface ResumeOptions {
	/**
	 * `true` (default): delivers one grouped notification with the missed
	 * change. `false`: discards the missed change without notifying.
	 */
	flush?: boolean;
}

/**
 * Handle for one subscription.
 */
export interface ReactiveSubscription {
	/** `false` after cancellation or when created with an aborted signal. */
	readonly active: boolean;
	/** Whether this subscription is paused. */
	readonly paused: boolean;
	/** Cancels the subscription. Idempotent. */
	cancel(): void;
	/** Alias of {@link ReactiveSubscription.cancel}. */
	unsubscribe(): void;
	/** Stops delivering notifications without changing the current value. */
	pause(): void;
	/** Resumes delivery. */
	resume(options?: ResumeOptions): void;
}

/**
 * Subscription handler.
 *
 * @template V - Delivered value type.
 */
export type ReactiveHandler<V> = (
	value: V,
	previous: V,
	subscription: ReactiveSubscription,
) => void;

/**
 * Options for {@link Reactive.subscribe}.
 *
 * @template S - Selected value type.
 */
export interface SubscribeOptions<S = unknown> {
	/** Calls the handler immediately with the current value. */
	immediate?: boolean;
	/** Cancels the subscription after the first notification. */
	once?: boolean;
	/** Starts the subscription paused. */
	paused?: boolean;
	/** Aborting the signal cancels the subscription. */
	signal?: AbortSignal;
	/** Equality check for the selected value. Defaults to `Object.is`. */
	equals?: Equals<S>;
}

/**
 * Options for {@link Reactive.when}.
 */
export interface WhenOptions {
	/** Aborting rejects the promise with the signal reason. */
	signal?: AbortSignal;
}

/**
 * Values of a tuple of reactive sources.
 *
 * @template S - Tuple of reactive sources.
 */
export type ReactiveValues<S extends readonly Reactive<any>[]> = {
	[K in keyof S]: S[K] extends Reactive<infer V> ? V : never;
};
