import { INACTIVE_SUBSCRIPTION, MAX_ROUNDS, NOOP } from "./constants";
import type { Change, DerivedInit, Sub } from "./internal-types";
import { ReactiveError } from "./reactive-error";
import {
	beginBatch,
	beginDelivery,
	createCycleError,
	endBatch,
	endDelivery,
	flushDirty,
	forgetDirty,
	hasDirty,
	isBatching,
	isDelivering,
	markDirty,
} from "./scheduling";
import {
	type Equals,
	ReactiveErrorCode,
	type ReactiveHandler,
	type ReactiveOptions,
	type ReactiveSubscription,
	type ReactiveValues,
	type ResumeOptions,
	type SubscribeOptions,
	type WhenOptions,
} from "./types";
import {
	assertFunction,
	isPlainObject,
	reportUncaught,
	shallowEqual,
	validateOptions,
} from "./utils";

/**
 * Decentralized reactive values without proxies or dependencies.
 *
 * It provides framework-independent reactivity:
 *
 * ```ts
 * const count = Reactive.create(0);
 * const user = Reactive.create({ name: "Ada", age: 36 });
 *
 * const subscription = count.subscribe((value, previous) => {
 *   console.log(value, previous);
 * });
 *
 * count.set(1);                       // 1 0
 * count.update((value) => value + 1); // 2 1
 * count.value++;                      // 3 2
 *
 * user.patch({ age: 37 });
 * user.set({ ...user.get(), name: "Grace" });
 * user.mutate((value) => value.age++);
 *
 * subscription.pause();
 * subscription.resume();
 * count.pause();
 * count.resume();
 * subscription.cancel();
 * count.close();
 * ```
 *
 * Direct mutations are not detected because the API does not use proxies.
 * Changes are declared with `set`, `update`, `patch`, or `mutate`. In exchange,
 * the stored value is the real object, works with `Map`, `Set`, `Date`, and
 * class instances, and reads have no hidden tracking cost.
 *
 * Notifications are synchronous and ordered by subscription. A change is only
 * emitted when `equals` reports a difference (defaults to `Object.is`);
 * `mutate()` and `notify()` force emission. If a handler changes a value, the
 * notification is queued and delivered after the current one. An infinite loop
 * throws {@link ReactiveError} with code {@link ReactiveErrorCode.Cycle}. A
 * handler that throws does not prevent other handlers from running.
 *
 * `Reactive.batch()` groups changes so each affected reactive emits once with
 * its final value, or not at all when it returns to the initial value.
 *
 * While paused, values keep updating and `get()` always returns the latest
 * value; only notifications are retained. Resuming delivers one grouped
 * notification whose `previous` is the last value that subscriber received.
 * `resume({ flush: false })` discards missed notifications.
 *
 * Derived values use explicit dependencies and are read-only:
 *
 * ```ts
 * const total = Reactive.derive([price, quantity], (p, q) => p * q);
 * const label = total.map((value) => `${value} €`);
 * ```
 *
 * Derived values are recomputed by graph level, so diamond-shaped graphs update
 * each derived value once per change without glitches.
 *
 * A derived value stays attached to its sources until it is closed with
 * `close()` or its `signal` aborts. Close it when it is no longer needed, just
 * like subscriptions.
 *
 * @template T - Stored value type.
 */
export class Reactive<T> {
	/** Current value. */
	private held: T;
	/** Initial value used by {@link Reactive.reset}. */
	private readonly initial: T;
	/** Equality check configured for this value. */
	private readonly equals: Equals<T>;
	/** Error handler shared by subscriptions and derived computations. */
	private readonly onError: ((error: unknown) => void) | undefined;
	/** Derivation configuration, or `null` for source values. */
	private readonly derived: DerivedInit<T> | null;
	/** Graph level: `0` for sources, `1 + max(source levels)` for derived. */
	private readonly level: number;

	/** Derived values that depend on this value. */
	private readonly dependents = new Set<Reactive<any>>();
	/** Active subscriptions. */
	private readonly subs: Sub<T>[] = [];
	/** Pending changes for this value. */
	private queue: Change<T>[] = [];
	/** Whether queued changes should be collapsed when flushed. */
	private coalesce = false;
	/** Whether this derived value needs recomputation. */
	private stale = false;
	/** Whether all notifications for this value are paused. */
	private pausedAll = false;
	/** Whether this value has been closed. */
	private isClosed = false;
	/** Number of emitted changes. */
	private changes = 0;
	/** Detaches the abort listener created from options. */
	private detachSignal: () => void = NOOP;
	/** Callbacks that must run when this value closes. */
	private readonly closeHooks = new Set<() => void>();

	/**
	 * Creates a reactive value.
	 *
	 * Use {@link Reactive.create} or {@link Reactive.derive} instead of calling
	 * the constructor directly.
	 */
	private constructor(
		value: T,
		options: ReactiveOptions<T>,
		derived: DerivedInit<T> | null,
	) {
		this.held = value;
		this.initial = value;
		this.equals = options.equals ?? Object.is;
		this.onError = options.onError;
		this.derived = derived;
		this.level = derived
			? 1 + Math.max(0, ...derived.sources.map((source) => source.level))
			: 0;

		if (derived) {
			for (const source of derived.sources) source.dependents.add(this);
		}

		const { signal } = options;
		if (signal?.aborted) {
			this.close();
		} else if (signal) {
			const onAbort = () => this.close();
			signal.addEventListener("abort", onAbort, { once: true });
			this.detachSignal = () => signal.removeEventListener("abort", onAbort);
		}
	}

	/* ---- factories -------------------------------------------------------- */

	/**
	 * Creates a reactive value.
	 *
	 * ```ts
	 * Reactive.create(0);
	 * Reactive.create({ a: 1 });
	 * Reactive.create<string | null>(null);
	 * ```
	 *
	 * @param initial - Initial value.
	 * @param options - Reactive options.
	 * @returns A new reactive value.
	 */
	static create<T>(initial: T, options?: ReactiveOptions<T>): Reactive<T> {
		return new Reactive<T>(initial, validateOptions<T>(options), null);
	}

	/**
	 * Creates a read-only derived value.
	 *
	 * The computation runs once immediately and again when any source changes.
	 *
	 * ```ts
	 * const sum = Reactive.derive([a, b], (a, b) => a + b);
	 * ```
	 *
	 * @template S - Tuple of reactive sources.
	 * @template R - Derived value type.
	 * @param sources - Explicit reactive dependencies.
	 * @param compute - Function receiving the source values.
	 * @param options - Reactive options.
	 * @returns A read-only derived value.
	 * @throws {ReactiveError} If a source is not reactive or `compute` is not a
	 * function.
	 */
	static derive<const S extends readonly Reactive<any>[], R>(
		sources: S,
		compute: (...values: ReactiveValues<S>) => R,
		options?: ReactiveOptions<R>,
	): Reactive<R> {
		if (
			!Array.isArray(sources) ||
			sources.some((source) => !Reactive.isReactive(source))
		) {
			throw new ReactiveError(
				ReactiveErrorCode.InvalidArgument,
				"derive() expects an array of Reactive values as sources.",
			);
		}
		assertFunction<(...values: ReactiveValues<S>) => R>(
			compute,
			"derive() expects a compute function.",
		);

		const opts = validateOptions<R>(options);
		const fn = compute as (...values: any[]) => R;
		const initial = fn(...sources.map((source) => source.get()));
		return new Reactive<R>(initial, opts, { sources, compute: fn });
	}

	/**
	 * Groups changes until the callback finishes.
	 *
	 * Each affected reactive emits once with its final value, and emits nothing
	 * when it returns to its initial value. Only synchronous changes are
	 * grouped. Nested batches are supported.
	 *
	 * @template R - Callback return type.
	 * @param fn - Work to run inside the batch.
	 * @returns The callback result.
	 * @throws {ReactiveError} If `fn` is not a function.
	 */
	static batch<R>(fn: () => R): R {
		assertFunction<() => R>(fn, "batch() expects a function.");
		beginBatch();
		try {
			return fn();
		} finally {
			if (endBatch()) Reactive.flush();
		}
	}

	/**
	 * Checks whether a value is a {@link Reactive} instance.
	 *
	 * @param value - Value to inspect.
	 * @returns `true` for reactive instances.
	 */
	static isReactive(value: unknown): value is Reactive<unknown> {
		return value instanceof Reactive;
	}

	/**
	 * Compares arrays and objects one level deep.
	 *
	 * Useful as the `equals` option when replacing objects with shallow copies.
	 *
	 * @param a - First value.
	 * @param b - Second value.
	 * @returns `true` when both values are equal at the first level.
	 */
	static shallowEqual(a: unknown, b: unknown): boolean {
		return shallowEqual(a, b);
	}

	/* ---- reading ---------------------------------------------------------- */

	/**
	 * Returns the current value.
	 *
	 * Recomputes a stale derived value before returning it.
	 *
	 * @returns The current value.
	 */
	get(): T {
		if (this.stale && !this.isClosed) this.recompute();
		return this.held;
	}

	/** Current value. Assigning it is equivalent to calling `set()`. */
	get value(): T {
		return this.get();
	}

	set value(next: T) {
		this.set(next);
	}

	/** Number of emitted changes, useful for memoization or debugging. */
	get version(): number {
		return this.changes;
	}

	/** Whether this value has been closed. */
	get closed(): boolean {
		return this.isClosed;
	}

	/** Whether all notifications for this value are paused. */
	get paused(): boolean {
		return this.pausedAll;
	}

	/** `true` for derived values. */
	get readonly(): boolean {
		return this.derived !== null;
	}

	/** Number of active subscriptions. */
	get subscriberCount(): number {
		return this.subs.length;
	}

	/* ---- writing ---------------------------------------------------------- */

	/**
	 * Replaces the value.
	 *
	 * Emits only when `equals` reports a difference.
	 *
	 * @param next - New value.
	 */
	set(next: T): void {
		this.assertWritable();
		this.commit(next, false);
	}

	/**
	 * Replaces the value using a function that receives the current value.
	 *
	 * @param updater - Function returning the next value.
	 * @throws {ReactiveError} If `updater` is not a function.
	 */
	update(updater: (current: T) => T): void {
		this.assertWritable();
		assertFunction<(current: T) => T>(updater, "update() expects a function.");
		this.commit(updater(this.held), false);
	}

	/**
	 * Merges a partial object into a plain object value.
	 *
	 * Emits only when at least one field changed.
	 *
	 * ```ts
	 * user.patch({ age: 37 });
	 * ```
	 *
	 * @param partial - Fields to merge.
	 * @throws {ReactiveError} If the current value or `partial` is not a plain
	 * object.
	 */
	patch(partial: T extends object ? Partial<T> : never): void {
		this.assertWritable();
		const current = this.held as unknown;
		if (!isPlainObject(current) || !isPlainObject(partial)) {
			throw new ReactiveError(
				ReactiveErrorCode.InvalidArgument,
				"patch() only works with plain objects. Use set(), update() or mutate().",
			);
		}

		const fields = partial as Record<string, unknown>;
		const changed = Object.keys(fields).some(
			(key) => !Object.is(current[key], fields[key]),
		);
		if (changed) this.commit({ ...current, ...fields } as T, false);
	}

	/**
	 * Mutates the current value in place and forces emission.
	 *
	 * Because the object identity does not change, `previous === value` in
	 * handlers. Useful for `Map`, `Set`, arrays, and class instances.
	 *
	 * @param mutator - Function that mutates the current value.
	 * @throws {ReactiveError} If `mutator` is not a function.
	 */
	mutate(mutator: (value: T) => void): void {
		this.assertWritable();
		assertFunction<(value: T) => void>(mutator, "mutate() expects a function.");
		try {
			mutator(this.held);
		} finally {
			// Subscribers must be notified even when the mutation fails midway.
			this.commit(this.held, true);
		}
	}

	/** Forces emission even when the value did not change. */
	notify(): void {
		this.assertWritable();
		this.commit(this.held, true);
	}

	/** Restores the initial value. */
	reset(): void {
		this.assertWritable();
		this.commit(this.initial, false);
	}

	/* ---- subscriptions ---------------------------------------------------- */

	/**
	 * Subscribes a handler `(value, previous, subscription)`.
	 *
	 * ```ts
	 * count.subscribe((value) => render(value), { immediate: true });
	 * user.subscribe((name) => render(name), { select: (user) => user.name });
	 * ```
	 *
	 * @param handler - Notification handler.
	 * @param options - Subscription options.
	 * @returns A cancelable subscription handle.
	 * @throws {ReactiveError} If the value is closed, the handler is not
	 * callable, or a subscription option is invalid.
	 */
	subscribe(
		handler: ReactiveHandler<T>,
		options?: SubscribeOptions<T>,
	): ReactiveSubscription;
	subscribe<S>(
		handler: ReactiveHandler<S>,
		options: SubscribeOptions<S> & { select: (value: T) => S },
	): ReactiveSubscription;
	subscribe(
		handler: ReactiveHandler<any>,
		options: SubscribeOptions<any> & {
			select?: (value: T) => unknown;
		} = {},
	): ReactiveSubscription {
		this.assertOpen();
		assertFunction<ReactiveHandler<any>>(
			handler,
			"Handler must be a function.",
		);
		if (options.select !== undefined) {
			assertFunction(
				options.select,
				"Option `select` must be a function.",
				ReactiveErrorCode.InvalidOption,
			);
		}
		if (options.equals !== undefined) {
			assertFunction(
				options.equals,
				"Option `equals` must be a function.",
				ReactiveErrorCode.InvalidOption,
			);
		}

		const { signal } = options;
		if (signal?.aborted) return INACTIVE_SUBSCRIPTION;

		const select = options.select ?? null;
		const current = this.get();
		const sub: Sub<T> = {
			handler,
			select,
			equals: options.equals ?? Object.is,
			once: options.once ?? false,
			handle: INACTIVE_SUBSCRIPTION,
			delivered: select ? select(current) : current,
			paused: options.paused ?? false,
			stale: false,
			active: true,
		};

		const cancel = (): void => {
			if (!sub.active) return;
			sub.active = false;
			signal?.removeEventListener("abort", cancel);
			const index = this.subs.indexOf(sub);
			if (index >= 0) this.subs.splice(index, 1);
		};

		sub.handle = {
			get active() {
				return sub.active;
			},
			get paused() {
				return sub.paused;
			},
			cancel,
			unsubscribe: cancel,
			pause: () => {
				if (sub.active) sub.paused = true;
			},
			resume: (resumeOptions) => {
				if (!sub.active || !sub.paused) return;
				sub.paused = false;
				if (!this.pausedAll) {
					this.catchUp(sub, resumeOptions?.flush ?? true);
				}
			},
		};

		this.subs.push(sub);
		signal?.addEventListener("abort", cancel, { once: true });

		if (options.immediate && !sub.paused) {
			this.deliver(sub, sub.delivered);
		}
		return sub.handle;
	}

	/**
	 * Subscribes a handler and cancels it after the first notification.
	 *
	 * @param handler - Notification handler.
	 * @param options - Subscription options without `once`.
	 * @returns A cancelable subscription handle.
	 */
	once(
		handler: ReactiveHandler<T>,
		options?: Omit<SubscribeOptions<T>, "once">,
	): ReactiveSubscription;
	once<S>(
		handler: ReactiveHandler<S>,
		options: Omit<SubscribeOptions<S>, "once"> & {
			select: (value: T) => S;
		},
	): ReactiveSubscription;
	once(
		handler: ReactiveHandler<any>,
		options: Omit<SubscribeOptions<any>, "once"> & {
			select?: (value: T) => unknown;
		} = {},
	): ReactiveSubscription {
		return (
			this.subscribe as (
				valueHandler: ReactiveHandler<any>,
				subscriptionOptions: object,
			) => ReactiveSubscription
		)(handler, { ...options, once: true });
	}

	/**
	 * Removes subscriptions for one handler, or all subscriptions when the
	 * handler is omitted.
	 *
	 * @param handler - Optional handler to remove.
	 */
	off(handler?: ReactiveHandler<any>): void {
		for (const sub of Array.from(this.subs)) {
			if (handler === undefined || sub.handler === handler) {
				sub.handle.cancel();
			}
		}
	}

	/**
	 * Resolves with the value once `predicate` returns `true`.
	 *
	 * Resolves immediately when the current value already satisfies the
	 * predicate. Rejects when the signal aborts, this value closes, or the
	 * predicate throws.
	 *
	 * ```ts
	 * await ready.when((value) => value === true);
	 * ```
	 *
	 * @param predicate - Condition to wait for. Defaults to `Boolean`.
	 * @param options - Wait options.
	 * @returns A promise with the matching value.
	 */
	when(
		predicate: (value: T) => boolean = Boolean,
		options: WhenOptions = {},
	): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			if (this.isClosed) {
				return reject(
					new ReactiveError(
						ReactiveErrorCode.Closed,
						"This Reactive has been closed.",
					),
				);
			}

			const { signal } = options;
			if (signal?.aborted) return reject(signal.reason);

			try {
				const current = this.get();
				if (predicate(current)) return resolve(current);
			} catch (error) {
				return reject(error);
			}

			const finish = (): void => {
				subscription.cancel();
				signal?.removeEventListener("abort", onAbort);
				this.closeHooks.delete(onClose);
			};
			const onAbort = (): void => {
				finish();
				reject(signal?.reason);
			};
			const onClose = (): void => {
				finish();
				reject(
					new ReactiveError(
						ReactiveErrorCode.Closed,
						"This Reactive was closed before the condition was met.",
					),
				);
			};
			const subscription = this.subscribe((value) => {
				try {
					if (!predicate(value)) return;
					finish();
					resolve(value);
				} catch (error) {
					finish();
					reject(error);
				}
			});
			signal?.addEventListener("abort", onAbort, { once: true });
			this.closeHooks.add(onClose);
		});
	}

	/**
	 * Creates a read-only derived value from this value.
	 *
	 * @template R - Derived value type.
	 * @param mapper - Function receiving the current value.
	 * @param options - Reactive options.
	 * @returns A read-only derived value.
	 */
	map<R>(mapper: (value: T) => R, options?: ReactiveOptions<R>): Reactive<R> {
		return Reactive.derive(
			[this] as readonly Reactive<any>[],
			(value) => mapper(value as T),
			options,
		);
	}

	/* ---- pause ------------------------------------------------------------ */

	/**
	 * Pauses all notifications for this value.
	 *
	 * The value keeps updating; each subscriber receives one grouped
	 * notification when resumed.
	 */
	pause(): void {
		if (!this.isClosed) this.pausedAll = true;
	}

	/**
	 * Resumes all notifications for this value.
	 *
	 * @param options - Resume options.
	 */
	resume(options?: ResumeOptions): void {
		if (!this.pausedAll) return;
		this.pausedAll = false;
		if (this.isClosed) return;
		for (const sub of Array.from(this.subs)) {
			if (!sub.paused) this.catchUp(sub, options?.flush ?? true);
		}
	}

	/* ---- lifecycle -------------------------------------------------------- */

	/**
	 * Cancels every subscription, rejects pending `when()` calls, and detaches
	 * a derived value from its sources.
	 *
	 * `get()` still returns the last value. Calling `close()` more than once is
	 * safe.
	 */
	close(): void {
		if (this.isClosed) return;
		this.isClosed = true;
		this.detachSignal();
		if (this.derived) {
			for (const source of this.derived.sources) {
				source.dependents.delete(this);
			}
		}
		for (const hook of Array.from(this.closeHooks)) hook();
		this.closeHooks.clear();
		for (const sub of Array.from(this.subs)) sub.handle.cancel();
		this.subs.length = 0;
		this.queue.length = 0;
		this.stale = false;
		forgetDirty(this);
	}

	/* ---- internals -------------------------------------------------------- */

	/** Throws when the value is closed. */
	private assertOpen(): void {
		if (this.isClosed) {
			throw new ReactiveError(
				ReactiveErrorCode.Closed,
				"This Reactive has been closed.",
			);
		}
	}

	/** Throws when the value is closed or read-only. */
	private assertWritable(): void {
		this.assertOpen();
		if (this.derived) {
			throw new ReactiveError(
				ReactiveErrorCode.ReadOnly,
				"Derived values are read-only: change their sources instead.",
			);
		}
	}

	/** Reports an error through `onError` or as an uncaught error. */
	private report(error: unknown): void {
		if (!this.onError) return reportUncaught(error);
		try {
			this.onError(error);
		} catch (nested) {
			reportUncaught(nested);
		}
	}

	/** Applies a source value change and schedules notifications. */
	private commit(next: T, forced: boolean): void {
		const previous = this.held;
		if (!forced && this.equals(previous, next)) return;

		const batching = isBatching();
		this.held = next;
		this.changes++;
		this.queue.push({ previous, next, forced });
		if (batching) this.coalesce = true;
		markDirty(this, this.level);
		this.invalidateDependents();
		if (!batching) Reactive.flush();
	}

	/** Marks dependent derived values as stale, transitively. */
	private invalidateDependents(): void {
		for (const dependent of this.dependents) {
			if (dependent.isClosed || (dependent.stale && hasDirty(dependent))) {
				continue;
			}
			dependent.stale = true;
			markDirty(dependent, dependent.level);
			dependent.invalidateDependents();
		}
	}

	/** Recomputes a stale derived value and queues a change when needed. */
	private recompute(): void {
		const derived = this.derived;
		if (!derived || this.isClosed) return;

		const next = derived.compute(
			...derived.sources.map((source) => source.get()),
		);
		this.stale = false;
		const previous = this.held;
		if (this.equals(previous, next)) return;

		this.held = next;
		this.changes++;
		this.queue.push({ previous, next, forced: false });
		if (isBatching()) this.coalesce = true;
		markDirty(this, this.level);
		this.invalidateDependents();
	}

	/**
	 * Processes pending reactives by level, so derived values see updated
	 * sources and are recomputed only once per change.
	 */
	private static flush(): void {
		if (isDelivering()) return;
		flushDirty(
			(reactive) => reactive.process(),
			(reactive) => reactive.discardQueued(),
		);
	}

	/** Recomputes a stale value and dispatches its queued changes. */
	private process(): void {
		if (this.isClosed) {
			this.queue.length = 0;
			return;
		}
		if (this.stale) {
			try {
				this.recompute();
			} catch (error) {
				// Keep the previous value; the next `get()` throws again.
				this.report(error);
				return;
			}
		}
		this.dispatchQueued();
	}

	/** Collapses batched changes and delivers the queue. */
	private dispatchQueued(): void {
		if (this.coalesce) {
			this.coalesce = false;
			if (this.queue.length > 1) {
				const first = this.queue[0] as Change<T>;
				const last = this.queue[this.queue.length - 1] as Change<T>;
				const forced = this.queue.some((change) => change.forced);
				this.queue =
					!forced && this.equals(first.previous, last.next)
						? []
						: [{ previous: first.previous, next: last.next, forced }];
			}
		}

		let rounds = 0;
		while (this.queue.length > 0) {
			if (rounds >= MAX_ROUNDS) throw createCycleError();
			rounds++;
			const change = this.queue.shift() as Change<T>;
			for (const sub of Array.from(this.subs))
				this.notifySubscriber(sub, change);
		}
	}

	/** Discards queued notifications after a failed flush. */
	private discardQueued(): void {
		this.queue.length = 0;
		this.coalesce = false;
	}

	/** Delivers one change to a subscription, respecting pauses and selection. */
	private notifySubscriber(sub: Sub<T>, change: Change<T>): void {
		if (!sub.active) return;
		if (sub.paused || this.pausedAll) {
			sub.stale = true;
			return;
		}
		if (!sub.select) return this.deliver(sub, change.next);

		const slice = sub.select(change.next);
		if (!sub.equals(slice, sub.delivered)) this.deliver(sub, slice);
	}

	/** Delivers one grouped notification after a pause. */
	private catchUp(sub: Sub<T>, flush: boolean): void {
		if (!sub.active || !sub.stale) return;
		sub.stale = false;
		const slice = sub.select ? sub.select(this.get()) : this.get();
		if (!flush) {
			sub.delivered = slice;
			return;
		}
		if (sub.select && sub.equals(slice, sub.delivered)) return;
		this.deliver(sub, slice);
	}

	/** Invokes a subscription handler and isolates its errors. */
	private deliver(sub: Sub<T>, value: unknown): void {
		const previous = sub.delivered;
		sub.delivered = value;
		if (sub.once) sub.handle.cancel();
		beginDelivery();
		try {
			try {
				sub.handler(value, previous, sub.handle);
			} catch (error) {
				// One failing handler must not prevent the others from running.
				this.report(error);
			}
		} finally {
			if (endDelivery()) Reactive.flush();
		}
	}
}
