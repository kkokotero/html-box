import { NATIVE_EVENTS, NON_BUBBLING, NOOP } from "./constants";
import { InteractionError } from "./interaction-error";
import {
	InteractionErrorCode,
	type EmitArgs,
	type Entry,
	type EventName,
	type EventPayload,
	type GestureEventName,
	type InteractionContext,
	type InteractionHandler,
	type InteractionOptions,
	type LooseGestureFactory,
	type LooseOptions,
	type NativeEventName,
	type NativeListenerOptions,
	type Off,
	type OptionsOf,
	type Subscription,
} from "./types";
import {
	GESTURES,
	addEventListenerWithCleanup,
	assertDelegateSelector,
	assertEventName,
	assertHandler,
	assertTarget,
	createInactiveSubscription,
	findMatchingDelegate,
	hasOwnProperty,
} from "./utils";

/**
 * Manages event listeners and built-in gestures for a single target.
 *
 * A single instance can register native DOM events, custom events, and the
 * built-in `hover`, `long-press`, and `outside-click` gestures. Subscriptions
 * can be cancelled individually or together through {@link Interaction.close}.
 * Aborting the constructor signal closes the instance automatically.
 *
 * @template Events - Map of custom event names to their `detail` types.
 * @template T - Interaction target type. Defaults to {@link Element}.
 *
 * @example
 * ```ts
 * const interaction = new Interaction(document.body);
 *
 * interaction.on("click", (event) => {
 *   console.log(event.type);
 * });
 *
 * interaction.on("hover", (event) => {
 *   console.log(event.hovering);
 * });
 *
 * interaction.close();
 * ```
 */
export class Interaction<
	Events extends object = Record<never, never>,
	T extends EventTarget = Element,
> {
	private readonly entries = new Map<string, Set<Entry>>();
	private detachSignal: Off = NOOP;
	private isClosed = false;

	/**
	 * Creates an interaction manager.
	 *
	 * @param target - Event target that receives the listeners.
	 * @param options - Interaction options.
	 * @throws {InteractionError} If the target does not implement
	 * `EventTarget`.
	 */
	constructor(
		readonly target: T,
		options: InteractionOptions = {},
	) {
		assertTarget(target);

		const signal = options.signal;
		if (!signal) return;

		if (signal.aborted) {
			this.close();
			return;
		}

		const onAbort = () => this.close();
		signal.addEventListener("abort", onAbort, { once: true });
		this.detachSignal = () => {
			signal.removeEventListener("abort", onAbort);
			this.detachSignal = NOOP;
		};
	}

	/**
	 * Indicates whether the interaction has been closed.
	 */
	get closed(): boolean {
		return this.isClosed;
	}

	/**
	 * Registers an event listener or gesture.
	 *
	 * Native DOM event names use kebab-case aliases such as `double-click`.
	 * Custom event names are registered as DOM events and their handlers receive
	 * a `CustomEvent` with the typed `detail`.
	 *
	 * @template K - Event name.
	 * @param name - Native, gesture, or custom event name.
	 * @param handler - Function invoked when the event is emitted.
	 * @param options - Listener options for the selected event type.
	 * @returns A subscription that can cancel this listener independently.
	 * @throws {InteractionError} If the interaction is closed, the name is
	 * invalid, the handler is not a function, or the delegation selector is
	 * invalid.
	 * @example
	 * ```ts
	 * const interaction = new Interaction(document.body);
	 *
	 * const subscription = interaction.on(
	 *   "click",
	 *   (event) => console.log(event.clientX),
	 *   { delegate: "button" },
	 * );
	 *
	 * subscription.cancel();
	 * ```
	 */
	on<K extends EventName<Events>>(
		name: K,
		handler: InteractionHandler<EventPayload<K, Events>, T>,
		options?: OptionsOf<K>,
	): Subscription {
		this.assertOpen();
		assertEventName(name);
		assertHandler(handler);

		const eventName = name as string;

		if (hasOwnProperty(GESTURES, eventName)) {
			return this.addGesture(
				eventName as GestureEventName,
				handler as unknown as InteractionHandler<unknown, T>,
				(options ?? {}) as LooseOptions,
			);
		}

		const isNative = hasOwnProperty(NATIVE_EVENTS, eventName);
		const eventType = isNative
			? NATIVE_EVENTS[eventName as NativeEventName]
			: eventName;

		return this.addDomListener(
			eventType,
			eventName,
			handler as unknown as InteractionHandler<Event, T>,
			(options ?? {}) as NativeListenerOptions,
		);
	}

	/**
	 * Registers a listener that runs at most once.
	 *
	 * @template K - Event name.
	 * @param name - Native, gesture, or custom event name.
	 * @param handler - Function invoked when the event is emitted.
	 * @param options - Listener options for the selected event type.
	 * @returns A subscription for the listener.
	 * @throws {InteractionError} If the interaction is closed or the listener
	 * cannot be registered.
	 */
	once<K extends EventName<Events>>(
		name: K,
		handler: InteractionHandler<EventPayload<K, Events>, T>,
		options?: Omit<OptionsOf<K>, "once">,
	): Subscription {
		return this.on(name, handler, {
			...options,
			once: true,
		} as OptionsOf<K>);
	}

	/**
	 * Removes listeners registered for an event.
	 *
	 * @template K - Event name.
	 * @param name - Event name.
	 * @param handler - Optional handler to remove. When omitted, all listeners
	 * for the event are removed.
	 */
	off<K extends EventName<Events>>(
		name: K,
		handler?: InteractionHandler<EventPayload<K, Events>, T>,
	): void {
		const entries = this.entries.get(name as string);
		if (!entries) return;

		for (const entry of entries) {
			if (handler === undefined || entry.handler === handler) {
				entry.cancel();
			}
		}
	}

	/**
	 * Dispatches a custom event from the interaction target.
	 *
	 * Native and gesture event names are reserved and cannot be emitted.
	 *
	 * @template K - Custom event name.
	 * @param name - Custom event name.
	 * @param args - Event detail and optional `CustomEventInit` values.
	 * @returns `false` when a listener called `preventDefault`.
	 * @throws {InteractionError} If the interaction is closed, the event name is
	 * reserved, or `CustomEvent` is unavailable.
	 */
	emit<K extends keyof Events & string>(
		name: K,
		...args: EmitArgs<Events[K]>
	): boolean {
		this.assertOpen();
		assertEventName(name);

		if (hasOwnProperty(NATIVE_EVENTS, name) || hasOwnProperty(GESTURES, name)) {
			throw new InteractionError(
				InteractionErrorCode.InvalidEvent,
				`"${name}" is reserved for native or gesture events.`,
			);
		}

		const CustomEventConstructor =
			typeof CustomEvent === "undefined" ? undefined : CustomEvent;
		if (!CustomEventConstructor) {
			throw new InteractionError(
				InteractionErrorCode.UnsupportedTarget,
				"CustomEvent is not available in this environment.",
			);
		}

		const [detail, init] = args;
		const eventInit = init ? { ...init, detail } : { detail };
		const event = new CustomEventConstructor(
			name,
			eventInit as CustomEventInit<Events[K]>,
		);

		return this.target.dispatchEvent(event);
	}

	/**
	 * Closes the interaction and cancels every registered listener.
	 *
	 * This method is idempotent.
	 */
	close(): void {
		if (this.isClosed) return;
		this.isClosed = true;
		this.detachSignal();
		this.detachSignal = NOOP;

		const sets = Array.from(this.entries.values());
		for (const set of sets) {
			for (const entry of Array.from(set)) entry.cancel();
		}
		this.entries.clear();
	}

	/**
	 * Registers a native or custom DOM event listener.
	 *
	 * @param eventType - Native DOM event name.
	 * @param name - Public event name used for cancellation.
	 * @param handler - Listener callback.
	 * @param options - Native listener options.
	 * @returns The listener subscription.
	 */
	private addDomListener(
		eventType: string,
		name: string,
		handler: InteractionHandler<Event, T>,
		options: NativeListenerOptions,
	): Subscription {
		if (options.signal?.aborted) {
			return createInactiveSubscription(name);
		}

		if (options.delegate !== undefined) {
			assertDelegateSelector(this.target, options.delegate);
		}

		let active = true;
		const entryRef: { current?: Entry } = {};
		let detach: Off = NOOP;
		let detachAbort: Off = NOOP;

		const cancel = () => {
			if (!active) return;
			active = false;
			detach();
			detachAbort();
			if (entryRef.current) this.removeEntry(name, entryRef.current);
		};

		const subscription: Subscription = {
			name,
			get active() {
				return active;
			},
			cancel,
		};

		const listener = (event: Event) => {
			if (!active) return;

			let element: Element | T = this.target;
			if (options.delegate !== undefined) {
				const match = findMatchingDelegate(
					this.target,
					event,
					options.delegate,
				);
				if (!match) return;
				element = match;
			}

			const context: InteractionContext<T> = { element, cancel };
			try {
				handler(event, context);
			} finally {
				if (options.once) cancel();
			}
		};

		const capture =
			options.capture ??
			(options.delegate !== undefined && NON_BUBBLING.has(name));
		const listenerOptions: AddEventListenerOptions = {};
		if (capture) listenerOptions.capture = true;
		if (options.passive !== undefined) {
			listenerOptions.passive = options.passive;
		}

		detach = addEventListenerWithCleanup(
			this.target,
			eventType,
			listener,
			listenerOptions,
		);
		const entry: Entry = { name, handler, cancel };
		entryRef.current = entry;
		this.addEntry(name, entry);

		const signal = options.signal;
		if (signal) {
			if (signal.aborted) {
				cancel();
			} else {
				const onAbort = () => cancel();
				signal.addEventListener("abort", onAbort, { once: true });
				detachAbort = () => signal.removeEventListener("abort", onAbort);
				if (signal.aborted) cancel();
			}
		}

		return subscription;
	}

	/**
	 * Registers a built-in gesture.
	 *
	 * @param name - Gesture name.
	 * @param handler - Gesture callback.
	 * @param options - Gesture options.
	 * @returns The gesture subscription.
	 */
	private addGesture(
		name: GestureEventName,
		handler: InteractionHandler<unknown, T>,
		options: LooseOptions,
	): Subscription {
		if (options.signal?.aborted) {
			return createInactiveSubscription(name);
		}

		let active = true;
		const entryRef: { current?: Entry } = {};
		let detach: Off = NOOP;
		let detachAbort: Off = NOOP;

		const cancel = () => {
			if (!active) return;
			active = false;
			detach();
			detachAbort();
			if (entryRef.current) this.removeEntry(name, entryRef.current);
		};

		const subscription: Subscription = {
			name,
			get active() {
				return active;
			},
			cancel,
		};

		const emit = (payload: unknown) => {
			if (!active) return;
			try {
				handler(payload, { element: this.target, cancel });
			} finally {
				if (options.once) cancel();
			}
		};

		const factory = GESTURES[name] as unknown as LooseGestureFactory;
		detach = factory(this.target, emit, options);
		const entry: Entry = { name, handler, cancel };
		entryRef.current = entry;
		this.addEntry(name, entry);

		const signal = options.signal;
		if (signal) {
			if (signal.aborted) {
				cancel();
			} else {
				const onAbort = () => cancel();
				signal.addEventListener("abort", onAbort, { once: true });
				detachAbort = () => signal.removeEventListener("abort", onAbort);
				if (signal.aborted) cancel();
			}
		}

		return subscription;
	}

	/**
	 * Adds an entry to the active listener registry.
	 *
	 * @param name - Public event name.
	 * @param entry - Listener entry.
	 */
	private addEntry(name: string, entry: Entry): void {
		const entries = this.entries.get(name);
		if (entries) {
			entries.add(entry);
		} else {
			this.entries.set(name, new Set([entry]));
		}
	}

	/**
	 * Removes an entry from the active listener registry.
	 *
	 * @param name - Public event name.
	 * @param entry - Listener entry.
	 */
	private removeEntry(name: string, entry: Entry): void {
		const entries = this.entries.get(name);
		if (!entries) return;
		entries.delete(entry);
		if (entries.size === 0) this.entries.delete(name);
	}

	/**
	 * Throws when the interaction has been closed.
	 *
	 * @throws {InteractionError} If the interaction is closed.
	 */
	private assertOpen(): void {
		if (this.isClosed) {
			throw new InteractionError(
				InteractionErrorCode.Closed,
				"Interaction is closed.",
			);
		}
	}
}
