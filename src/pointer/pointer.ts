import { NATIVE_POINTER_EVENTS, NOOP } from "./constants";
import { PointerError } from "./pointer-error";
import {
	PointerErrorCode,
	type PointerDisposer,
	type PointerEventName,
	type PointerHandler,
	type PointerKind,
	type PointerListenerOptions,
	type PointerOptions,
	type PointerPosition,
	type PointerSample,
	type PointerSubscription,
	type PointerTypeName,
	type Proximity,
	type ProximityOptions,
} from "./types";
import {
	addEventListenerWithCleanup,
	assertPointerEventName,
	assertPointerHandler,
	assertPointerTarget,
	capturePointer,
	createInactiveSubscription,
	getTouchActionStyle,
	hasPointerCapture,
	measureProximity,
	normalizeProximityMetric,
	normalizeRadius,
	pointerKindOf,
	releaseAllPointerCaptures,
	releasePointerCapture,
} from "./utils";

/**
 * Pointer tracking state for one active pointer.
 *
 * @internal
 */
interface PointerTrack {
	readonly id: number;
	readonly type: PointerTypeName;
	readonly isPrimary: boolean;
	x: number;
	y: number;
	pageX: number;
	pageY: number;
	originX: number;
	originY: number;
	pressed: boolean;
}

/**
 * Last primary pointer sample used by {@link Pointer.position}.
 *
 * @internal
 */
interface PointerSnapshot {
	x: number;
	y: number;
	pageX: number;
	pageY: number;
	pointerId: number;
	pointerType: PointerTypeName;
	pressed: boolean;
}

/**
 * Registered pointer listener.
 *
 * @internal
 */
interface PointerEntry {
	readonly handler: unknown;
	readonly cancel: PointerDisposer;
	readonly run: (sample: PointerSample) => void;
}

/**
 * Typed pointer tracking over Pointer Events.
 *
 * The instance tracks the pointer while it is inside the target. When the
 * pointer leaves, `position` becomes `null` and `proximity`/`nearest` return
 * `null`. With `capture` enabled, a pressed pointer can continue to emit events
 * outside the target.
 *
 * @template T - Element type. Defaults to {@link Element}.
 *
 * @example
 * ```ts
 * const pointer = new Pointer(document.querySelector("canvas"));
 *
 * pointer.on("move", ({ x, y, localX, localY, deltaX, deltaY }) => {
 *   console.log({ x, y, localX, localY, deltaX, deltaY });
 * });
 *
 * pointer.on("down", () => {
 *   console.log(pointer.pressed);
 * });
 *
 * pointer.close();
 * ```
 */
export class Pointer<T extends Element = Element> {
	private readonly primaryOnly: boolean;
	private readonly acceptedTypes: readonly PointerKind[] | undefined;
	private readonly autoCapture: boolean;
	private readonly touchStyle: CSSStyleDeclaration | undefined;
	private readonly configuredTouchAction: string | undefined;
	private readonly previousTouchAction: string | undefined;

	private readonly tracks = new Map<number, PointerTrack>();
	private readonly entries = new Map<PointerEventName, Set<PointerEntry>>();
	private lastSample: PointerSnapshot | null = null;

	private detachSignal: PointerDisposer = NOOP;
	private detachListeners: PointerDisposer = NOOP;
	private restoreTouchAction: PointerDisposer = NOOP;
	private isClosed = false;
	private isPaused = false;

	/**
	 * Creates a pointer tracker.
	 *
	 * A `null` or `undefined` target creates an inert instance: `position` is
	 * `null`, `on` returns an inactive subscription, and `close` remains safe.
	 *
	 * @param element - Element to observe.
	 * @param options - Pointer options.
	 * @throws {PointerError} If the target is not an `Element`, `null`, or
	 * `undefined`, or if `touchAction` is used on an unsupported target.
	 */
	constructor(
		private readonly element: T | null | undefined,
		options: PointerOptions = {},
	) {
		assertPointerTarget(element);

		const touchStyle =
			element && options.touchAction !== undefined
				? getTouchActionStyle(element)
				: undefined;
		this.touchStyle = touchStyle;
		this.configuredTouchAction = options.touchAction;
		this.previousTouchAction = touchStyle?.touchAction;

		this.primaryOnly = options.primaryOnly ?? true;
		this.acceptedTypes = options.types;
		this.autoCapture = options.capture ?? false;

		const signal = options.signal;
		if (signal?.aborted) {
			this.isClosed = true;
			return;
		}
		if (!element) return;

		if (signal) {
			const onAbort = () => this.close();
			signal.addEventListener("abort", onAbort, { once: true });
			this.detachSignal = () => signal.removeEventListener("abort", onAbort);
		}

		if (touchStyle && options.touchAction !== undefined) {
			this.applyTouchAction();
			this.restoreTouchAction = () => {
				touchStyle.touchAction = this.previousTouchAction ?? "";
			};
		}
		this.attachListeners();
	}

	/**
	 * Observed element, or `null` for an inert instance.
	 */
	get target(): T | null {
		return this.element ?? null;
	}

	/**
	 * Whether the instance has been closed.
	 */
	get closed(): boolean {
		return this.isClosed;
	}

	/** Indicates whether pointer events are temporarily suspended. */
	get paused(): boolean {
		return this.isPaused;
	}

	/**
	 * Last primary pointer position.
	 *
	 * Local and ratio coordinates are recalculated using the target's current
	 * bounding rectangle on every access.
	 */
	get position(): PointerPosition | null {
		const element = this.element;
		const last = this.lastSample;
		if (this.isClosed || this.isPaused || !element || !last) return null;

		return this.toPointerPosition(
			element,
			last.x,
			last.y,
			last.pageX,
			last.pageY,
			{
				pointerId: last.pointerId,
				pointerType: last.pointerType,
				isPrimary: true,
				pressed: last.pressed,
			},
		);
	}

	/**
	 * Active pointers inside the target or captured by it.
	 */
	get pointers(): readonly PointerPosition[] {
		const element = this.element;
		if (this.isClosed || this.isPaused || !element) return [];

		return [...this.tracks.values()].map((track) =>
			this.toPointerPosition(
				element,
				track.x,
				track.y,
				track.pageX,
				track.pageY,
				{
					pointerId: track.id,
					pointerType: track.type,
					isPrimary: track.isPrimary,
					pressed: track.pressed,
				},
			),
		);
	}

	/**
	 * Whether any tracked pointer is currently pressed.
	 */
	get pressed(): boolean {
		if (this.isPaused || this.isClosed) return false;
		for (const track of this.tracks.values()) {
			if (track.pressed) return true;
		}
		return false;
	}

	/**
	 * Registers a pointer event listener.
	 *
	 * @template K - Pointer event name.
	 * @param name - Pointer event name.
	 * @param handler - Function invoked with the pointer sample.
	 * @param options - Listener options.
	 * @returns A subscription that can cancel the listener independently.
	 * @throws {PointerError} If the instance is closed, the event name is
	 * invalid, or the handler is not a function.
	 */
	on<K extends PointerEventName>(
		name: K,
		handler: PointerHandler<PointerSample<K>>,
		options: PointerListenerOptions = {},
	): PointerSubscription {
		this.assertOpen();
		assertPointerEventName(name);
		assertPointerHandler(handler);

		if (!this.element || options.signal?.aborted) {
			return createInactiveSubscription(name);
		}

		let active = true;
		const entryRef: { current?: PointerEntry } = {};

		const cancel: PointerDisposer = () => {
			if (!active) return;
			active = false;
			options.signal?.removeEventListener("abort", cancel);

			const entries = this.entries.get(name);
			const entry = entryRef.current;
			if (!entries || !entry) return;

			entries.delete(entry);
			if (entries.size === 0) this.entries.delete(name);
		};

		const entry: PointerEntry = {
			handler,
			cancel,
			run: (sample) => {
				if (!active) return;
				if (options.once) cancel();
				handler(sample as PointerSample<K>, { cancel });
			},
		};
		entryRef.current = entry;

		let entries = this.entries.get(name);
		if (!entries) {
			entries = new Set();
			this.entries.set(name, entries);
		}
		entries.add(entry);
		options.signal?.addEventListener("abort", cancel, { once: true });

		return {
			name,
			get active() {
				return active;
			},
			cancel,
		};
	}

	/**
	 * Registers a listener that runs at most once.
	 *
	 * @template K - Pointer event name.
	 * @param name - Pointer event name.
	 * @param handler - Function invoked with the pointer sample.
	 * @param options - Listener options without `once`.
	 * @returns A subscription for the listener.
	 * @throws {PointerError} If the listener cannot be registered.
	 */
	once<K extends PointerEventName>(
		name: K,
		handler: PointerHandler<PointerSample<K>>,
		options: Omit<PointerListenerOptions, "once"> = {},
	): PointerSubscription {
		return this.on(name, handler, { ...options, once: true });
	}

	/**
	 * Removes pointer listeners.
	 *
	 * @template K - Pointer event name.
	 * @param name - Pointer event name.
	 * @param handler - Optional handler to remove. When omitted, all listeners
	 * for the event are removed.
	 */
	off<K extends PointerEventName>(
		name: K,
		handler?: PointerHandler<PointerSample<K>>,
	): void {
		const entries = this.entries.get(name);
		if (!entries) return;

		for (const entry of entries) {
			if (handler === undefined || entry.handler === handler) {
				entry.cancel();
			}
		}
	}

	/**
	 * Captures a pointer on the observed element.
	 *
	 * @param pointerId - Pointer identifier. Defaults to the last primary
	 * pointer.
	 * @returns `true` when the capture is active.
	 */
	capture(pointerId: number | undefined = this.lastSample?.pointerId): boolean {
		const element = this.getCaptureTarget();
		if (!element || pointerId === undefined) return false;
		return capturePointer(element, pointerId);
	}

	/**
	 * Releases a pointer capture from the observed element.
	 *
	 * @param pointerId - Pointer identifier. Defaults to the last primary
	 * pointer.
	 * @returns `true` when an existing capture was released.
	 */
	release(pointerId: number | undefined = this.lastSample?.pointerId): boolean {
		const element = this.getCaptureTarget();
		if (!element || pointerId === undefined) return false;
		return releasePointerCapture(element, pointerId);
	}

	/**
	 * Checks whether the observed element captures a pointer.
	 *
	 * @param pointerId - Pointer identifier. Defaults to the last primary
	 * pointer.
	 * @returns `true` when the element owns the capture.
	 */
	hasCapture(
		pointerId: number | undefined = this.lastSample?.pointerId,
	): boolean {
		const element = this.getCaptureTarget();
		if (!element || pointerId === undefined) return false;
		return hasPointerCapture(element, pointerId);
	}

	/**
	 * Measures proximity between the last pointer position and an element.
	 *
	 * @template E - Element type being measured.
	 * @param target - Element to measure, or `null`/`undefined`.
	 * @param options - Proximity options.
	 * @returns Proximity information, or `null` when there is no active pointer
	 * or target.
	 * @throws {PointerError} If `radius` or `metric` is invalid.
	 */
	proximity<E extends Element>(
		target: E | null | undefined,
		options: ProximityOptions = {},
	): Proximity<E> | null {
		const radius = normalizeRadius(options.radius);
		const metric = normalizeProximityMetric(options.metric);
		const last = this.lastSample;
		if (!target || this.isClosed || this.isPaused || !last) return null;

		return measureProximity(target, last.x, last.y, metric, radius);
	}

	/**
	 * Returns the closest proximity among a collection of candidate elements.
	 *
	 * @template E - Element type being measured.
	 * @param candidates - Elements to compare.
	 * @param options - Proximity options.
	 * @returns The closest proximity, or `null` when there are no candidates or
	 * no active pointer.
	 * @throws {PointerError} If `radius` or `metric` is invalid.
	 */
	nearest<E extends Element>(
		candidates: Iterable<E>,
		options: ProximityOptions = {},
	): Proximity<E> | null {
		const radius = normalizeRadius(options.radius);
		const metric = normalizeProximityMetric(options.metric);
		const last = this.lastSample;
		if (this.isClosed || this.isPaused || !last) return null;

		let best: Proximity<E> | null = null;
		for (const candidate of candidates) {
			if (!candidate) continue;
			const proximity = measureProximity(
				candidate,
				last.x,
				last.y,
				metric,
				radius,
			);
			if (!best || proximity.distance < best.distance) best = proximity;
		}
		return best;
	}

	/**
	 * Counts active listeners.
	 *
	 * @param name - Optional event name. When omitted, counts every listener.
	 * @returns The number of active listeners.
	 */
	listenerCount(name?: PointerEventName): number {
		if (name !== undefined) return this.entries.get(name)?.size ?? 0;

		let total = 0;
		for (const entries of this.entries.values()) total += entries.size;
		return total;
	}

	/**
	 * Detaches pointer listeners, releases captures, restores `touch-action`, and clears live samples.
	 * Registered subscriptions remain available for {@link resume}.
	 *
	 * @returns This instance for chained lifecycle control.
	 * @throws {PointerError} If the instance has been closed.
	 */
	pause(): this {
		this.assertOpen();
		if (this.isPaused) return this;
		this.isPaused = true;
		this.detachListeners();
		this.detachListeners = NOOP;
		if (this.element)
			releaseAllPointerCaptures(this.element, this.tracks.keys());
		this.restoreTouchAction();
		this.tracks.clear();
		this.lastSample = null;
		return this;
	}

	/** Reattaches pointer listeners and reapplies the configured `touch-action` value. */
	resume(): this {
		this.assertOpen();
		if (!this.isPaused) return this;
		this.isPaused = false;
		this.applyTouchAction();
		this.attachListeners();
		return this;
	}

	/**
	 * Removes listeners, releases pointer captures, restores `touch-action`, and
	 * cancels all subscriptions.
	 *
	 * This method is idempotent. After closing, `on` and `once` throw.
	 */
	close(): void {
		if (this.isClosed) return;

		this.detachSignal();
		this.isPaused = false;
		this.detachListeners();

		const element = this.element;
		if (element) {
			releaseAllPointerCaptures(element, this.tracks.keys());
		}
		this.restoreTouchAction();

		for (const entries of this.entries.values()) {
			for (const entry of entries) entry.cancel();
		}
		this.entries.clear();
		this.tracks.clear();
		this.lastSample = null;
		this.isClosed = true;
	}

	/**
	 * Throws when the instance has been closed.
	 *
	 * @throws {PointerError} If the instance is closed.
	 */
	private assertOpen(): void {
		if (this.isClosed) {
			throw new PointerError(
				PointerErrorCode.Closed,
				"This Pointer has been closed.",
			);
		}
	}

	/**
	 * Returns the element used for pointer captures.
	 *
	 * @returns The target element, or `null` when closed or inert.
	 */
	private getCaptureTarget(): Element | null {
		return this.element && !this.isClosed && !this.isPaused
			? this.element
			: null;
	}

	private applyTouchAction(): void {
		if (this.touchStyle && this.configuredTouchAction !== undefined) {
			this.touchStyle.touchAction = this.configuredTouchAction;
		}
	}

	private attachListeners(): void {
		const element = this.element;
		if (!element || this.isClosed || this.isPaused) return;
		const disposers = (
			["enter", "down", "move", "up", "cancel", "leave"] as const
		).map((type) =>
			addEventListenerWithCleanup(
				element,
				NATIVE_POINTER_EVENTS[type],
				(event) => this.handlePointerEvent(type, event as PointerEvent),
				{ passive: true },
			),
		);
		this.detachListeners = () => {
			for (const dispose of disposers) dispose();
		};
	}

	/**
	 * Converts pointer coordinates into a complete position record.
	 *
	 * @param element - Observed element.
	 * @param x - Viewport X coordinate.
	 * @param y - Viewport Y coordinate.
	 * @param pageX - Document X coordinate.
	 * @param pageY - Document Y coordinate.
	 * @param info - Pointer identity and state.
	 * @returns Pointer position information.
	 */
	private toPointerPosition(
		element: T,
		x: number,
		y: number,
		pageX: number,
		pageY: number,
		info: Pick<
			PointerPosition,
			"pointerId" | "pointerType" | "isPrimary" | "pressed"
		>,
	): PointerPosition {
		const rect = element.getBoundingClientRect();
		const localX = x - rect.left;
		const localY = y - rect.top;

		return {
			x,
			y,
			pageX,
			pageY,
			localX,
			localY,
			ratioX: rect.width ? localX / rect.width : 0,
			ratioY: rect.height ? localY / rect.height : 0,
			inside:
				localX >= 0 &&
				localY >= 0 &&
				localX <= rect.width &&
				localY <= rect.height,
			...info,
		};
	}

	/**
	 * Checks whether a pointer event should be tracked.
	 *
	 * @param event - Native pointer event.
	 * @returns `true` when the event passes primary and kind filters.
	 */
	private acceptsPointer(event: PointerEvent): boolean {
		if (this.primaryOnly && !event.isPrimary) return false;
		if (!this.acceptedTypes) return true;

		const kind = pointerKindOf(event.pointerType);
		return kind !== "unknown" && this.acceptedTypes.includes(kind);
	}

	/**
	 * Updates tracking state and dispatches a pointer sample.
	 *
	 * @param type - Public pointer event name.
	 * @param event - Native pointer event.
	 */
	private handlePointerEvent(
		type: PointerEventName,
		event: PointerEvent,
	): void {
		const element = this.element;
		if (
			!element ||
			this.isClosed ||
			this.isPaused ||
			!this.acceptsPointer(event)
		)
			return;

		let track = this.tracks.get(event.pointerId);
		if (!track) {
			track = {
				id: event.pointerId,
				type: pointerKindOf(event.pointerType),
				isPrimary: event.isPrimary,
				x: event.clientX,
				y: event.clientY,
				pageX: event.pageX,
				pageY: event.pageY,
				originX: event.clientX,
				originY: event.clientY,
				pressed: false,
			};
			this.tracks.set(track.id, track);
		}

		const deltaX = event.clientX - track.x;
		const deltaY = event.clientY - track.y;
		track.x = event.clientX;
		track.y = event.clientY;
		track.pageX = event.pageX;
		track.pageY = event.pageY;

		if (type === "down") {
			track.pressed = true;
			track.originX = event.clientX;
			track.originY = event.clientY;
			if (this.autoCapture) this.capture(event.pointerId);
		} else if (
			track.pressed &&
			event.buttons === 0 &&
			type !== "up" &&
			type !== "cancel"
		) {
			track.pressed = false;
		}

		const displacementX = track.pressed ? event.clientX - track.originX : 0;
		const displacementY = track.pressed ? event.clientY - track.originY : 0;
		if (type === "up" || type === "cancel") track.pressed = false;

		if (event.isPrimary) {
			this.lastSample = {
				x: event.clientX,
				y: event.clientY,
				pageX: event.pageX,
				pageY: event.pageY,
				pointerId: track.id,
				pointerType: track.type,
				pressed: track.pressed,
			};
		}

		const sample: PointerSample = {
			...this.toPointerPosition(
				element,
				event.clientX,
				event.clientY,
				event.pageX,
				event.pageY,
				{
					pointerId: track.id,
					pointerType: track.type,
					isPrimary: track.isPrimary,
					pressed: track.pressed,
				},
			),
			type,
			button: event.button,
			buttons: event.buttons,
			pressure: event.pressure,
			deltaX,
			deltaY,
			displacementX,
			displacementY,
			distance: Math.hypot(displacementX, displacementY),
			originalEvent: event,
		};

		const entries = this.entries.get(type);
		if (entries) {
			for (const entry of entries) entry.run(sample);
		}

		if (type === "leave") {
			this.tracks.delete(track.id);
			if (this.lastSample?.pointerId === track.id) this.lastSample = null;
		}
	}
}
