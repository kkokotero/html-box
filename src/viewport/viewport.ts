import type { Box } from "./internal-types";
import type {
	MoveCause,
	Off,
	Position,
	Size,
	Subscription,
	ViewportContext,
	ViewportEventMap,
	ViewportEventName,
	ViewportHandler,
	ViewportListenerOptions,
	ViewportOptions,
	ViewportSnapshot,
} from "./types";
import {
	EVENT_NAMES,
	RATIO_TOLERANCE,
	CAUSE_PRIORITY,
	noop,
	sameSize,
	samePoint,
	isElement,
	inactive,
	raf,
	windowBox,
	estimateVisibility,
	sideOf,
} from "./utils";
import { ViewportError, ViewportErrorCode } from "./viewport-error";

interface Entry {
	readonly handler: unknown;
	readonly cancel: Off;
	readonly run: (event: unknown) => void;
}

/**
 * Tracks an element's viewport geometry, movement, and visibility.
 *
 * Measurements are read from `getBoundingClientRect()` and therefore include
 * CSS transforms. Visibility uses `IntersectionObserver` when available and a
 * synchronous viewport intersection estimate otherwise.
 *
 * @typeParam T - Observed element type.
 * @example
 * ```ts
 * const viewport = new Viewport(document.querySelector("main"));
 * viewport.on("move", ({ position, deltaY }) => console.log(position, deltaY));
 * viewport.close();
 * ```
 */
export class Viewport<T extends Element = Element> {
	private readonly node: T | null;
	private readonly threshold: number;
	private readonly rootMargin: string | undefined;
	private readonly poll: boolean;

	private readonly entries = new Map<ViewportEventName, Set<Entry>>();
	private isClosed = false;
	private detachSignal: Off = noop;

	// Observers and listeners are activated only when required by subscriptions.
	private io: IntersectionObserver | null = null;
	private ro: ResizeObserver | null = null;
	private detachScroll: Off = noop;
	private cancelFrame: Off | null = null;
	private pendingCause: MoveCause | null = null;
	private polling = false;

	// Baselines used to detect size and position changes.
	private tracksSize = false;
	private tracksMove = false;
	private lastSize: Size = { width: 0, height: 0 };
	private lastPosition: Position | null = null;

	// Visibility state reported by IntersectionObserver.
	private ioReady = false;
	private reportedVisible = false;
	private reportedRatio = 0;

	/**
	 * @param node Element to observe. A nullish value creates an inert instance with
	 * zero measurements and inactive subscriptions.
	 * @param options Visibility threshold, root margin, polling, and abort signal.
	 * @throws {@link ViewportError} If the target or options are invalid.
	 */
	constructor(node: T | null | undefined, options: ViewportOptions = {}) {
		if (node != null && !isElement(node)) {
			throw new ViewportError(
				ViewportErrorCode.InvalidTarget,
				"Target must be an Element or null.",
			);
		}
		this.node = node ?? null;

		const threshold = options.threshold ?? 0;
		if (
			typeof threshold !== "number" ||
			!Number.isFinite(threshold) ||
			threshold < 0 ||
			threshold > 1
		) {
			throw new ViewportError(
				ViewportErrorCode.InvalidOption,
				"Option `threshold` must be a number between 0 and 1.",
			);
		}
		this.threshold = threshold;
		this.rootMargin = options.rootMargin;
		this.poll = options.poll ?? false;

		const { signal } = options;
		if (signal?.aborted) {
			this.isClosed = true;
			return;
		}
		if (!this.node || typeof document === "undefined") return;

		if (signal) {
			const onAbort = () => this.close();
			signal.addEventListener("abort", onAbort, { once: true });
			this.detachSignal = () => signal.removeEventListener("abort", onAbort);
		}

		// Keep visibility current while the instance is open.
		if (typeof IntersectionObserver !== "undefined") {
			try {
				this.io = new IntersectionObserver(
					(entries) => this.onIntersect(entries),
					{
						threshold: threshold > 0 ? [0, threshold] : [0],
						...(this.rootMargin === undefined
							? {}
							: { rootMargin: this.rootMargin }),
					},
				);
			} catch {
				throw new ViewportError(
					ViewportErrorCode.InvalidOption,
					`Invalid \`rootMargin\`: "${String(this.rootMargin)}".`,
				);
			}
			this.io.observe(this.node);
		}
	}

	/* Live measurements */

	/** The observed element, or null for an inert instance. */
	get element(): T | null {
		return this.node;
	}

	/** Whether this instance has been closed. */
	get closed(): boolean {
		return this.isClosed;
	}

	/** Current visual size, measured on each read. */
	get size(): Size {
		const rect = this.node?.getBoundingClientRect();
		return rect
			? { width: rect.width, height: rect.height }
			: { width: 0, height: 0 };
	}

	/** Current visual position, measured on each read. Scrolling can change it without changing size. */
	get position(): Position {
		const rect = this.node?.getBoundingClientRect();
		return this.toPosition(
			rect ?? { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 },
		);
	}

	/** Whether the element is visible according to IntersectionObserver or its initial estimate. */
	get visible(): boolean {
		return this.visibility().visible;
	}

	/** Visible fraction, from 0 to 1, using the same source as {@link visible}. */
	get ratio(): number {
		return this.visibility().ratio;
	}

	/** Reads all current measurements with a single layout read. */
	/**
	 * Reads the current element geometry and visibility in one snapshot.
	 *
	 * @returns Current measurements.
	 */
	snapshot(): ViewportSnapshot {
		const rect = this.node?.getBoundingClientRect() ?? {
			left: 0,
			top: 0,
			right: 0,
			bottom: 0,
			width: 0,
			height: 0,
		};
		const { visible, ratio } = this.visibility(rect);
		return {
			size: { width: rect.width, height: rect.height },
			position: this.toPosition(rect),
			visible,
			ratio,
		};
	}

	/* Subscriptions */

	/**
	 * Registers a typed event listener.
	 *
	 * @param name - Event to subscribe to.
	 * @param handler - Callback invoked when the event is emitted.
	 * @param options - One-shot and abort-signal behavior.
	 * @returns A handle that can cancel the listener.
	 * @throws {@link ViewportError} If the instance is closed or the event or handler is invalid.
	 */
	on<K extends ViewportEventName>(
		name: K,
		handler: ViewportHandler<K>,
		options: ViewportListenerOptions = {},
	): Subscription {
		this.assertOpen();
		if (!EVENT_NAMES.has(name)) {
			throw new ViewportError(
				ViewportErrorCode.InvalidEvent,
				`Unknown event "${String(name)}". Expected one of: ${[...EVENT_NAMES].join(", ")}.`,
			);
		}
		if (typeof handler !== "function") {
			throw new ViewportError(
				ViewportErrorCode.InvalidHandler,
				"Handler must be a function.",
			);
		}
		if (
			!this.node ||
			typeof document === "undefined" ||
			options.signal?.aborted
		)
			return inactive(name);

		let removed = false;
		const cancel: Off = () => {
			if (removed) return;
			removed = true;
			options.signal?.removeEventListener("abort", cancel);
			const set = this.entries.get(name);
			set?.delete(entry);
			if (set?.size === 0) this.entries.delete(name);
			this.sync();
		};
		const entry: Entry = {
			handler,
			cancel,
			run: (event) => {
				if (removed) return;
				if (options.once) cancel();
				(handler as (e: unknown, ctx: ViewportContext) => void)(event, {
					cancel,
				});
			},
		};

		let set = this.entries.get(name);
		if (!set) this.entries.set(name, (set = new Set()));
		set.add(entry);
		options.signal?.addEventListener("abort", cancel, { once: true });
		this.sync();

		return {
			name,
			get active() {
				return !removed;
			},
			cancel,
		};
	}

	/** Registers a listener that is removed after its first event. */
	once<K extends ViewportEventName>(
		name: K,
		handler: ViewportHandler<K>,
		options: Omit<ViewportListenerOptions, "once"> = {},
	): Subscription {
		return this.on(name, handler, { ...options, once: true });
	}

	/** Removes matching listeners for an event. */
	off<K extends ViewportEventName>(
		name: K,
		handler?: ViewportHandler<K>,
	): void {
		const set = this.entries.get(name);
		if (!set) return;
		for (const entry of set) {
			if (handler === undefined || entry.handler === handler) entry.cancel();
		}
	}

	/** Returns the number of active listeners, optionally filtered by event name. */
	listenerCount(name?: ViewportEventName): number {
		if (name !== undefined) return this.entries.get(name)?.size ?? 0;
		let total = 0;
		for (const set of this.entries.values()) total += set.size;
		return total;
	}

	/* Manual updates */

	/**
	 * Measures immediately and emits `resize` or `move` events when values changed
	 * since the previous check. Useful after transform-based or animated movement.
	 *
	 * @returns A snapshot of the current measurements.
	 * @throws {@link ViewportError} If the instance has been closed.
	 */
	update(): ViewportSnapshot {
		this.assertOpen();
		this.check("update");
		return this.snapshot();
	}

	/* Lifecycle */

	/** Disconnects observers and listeners and cancels every subscription. */
	close(): void {
		if (this.isClosed && this.entries.size === 0 && !this.io && !this.ro)
			return;
		this.isClosed = true;
		this.detachSignal();
		for (const set of this.entries.values()) {
			for (const entry of set) entry.cancel();
		}
		this.entries.clear();
		this.io?.disconnect();
		this.io = null;
		this.ro?.disconnect();
		this.ro = null;
		this.detachScroll();
		this.detachScroll = noop;
		this.cancelFrame?.();
		this.cancelFrame = null;
		this.polling = false;
		this.tracksSize = false;
		this.tracksMove = false;
	}

	/* Internal implementation */

	private assertOpen(): void {
		if (this.isClosed)
			throw new ViewportError(
				ViewportErrorCode.Closed,
				"This Viewport has been closed.",
			);
	}

	private toPosition(rect: Box): Position {
		const scrollX = typeof window !== "undefined" ? window.scrollX || 0 : 0;
		const scrollY = typeof window !== "undefined" ? window.scrollY || 0 : 0;
		return {
			x: rect.left,
			y: rect.top,
			left: rect.left,
			top: rect.top,
			right: rect.right,
			bottom: rect.bottom,
			pageX: rect.left + scrollX,
			pageY: rect.top + scrollY,
		};
	}

	private visibility(rect?: Box): { visible: boolean; ratio: number } {
		if (this.io && this.ioReady)
			return { visible: this.reportedVisible, ratio: this.reportedRatio };
		if (!this.node) return { visible: false, ratio: 0 };
		const box = rect ?? this.node.getBoundingClientRect();
		const estimate = estimateVisibility(box);
		return {
			visible:
				estimate.visible && estimate.ratio + RATIO_TOLERANCE >= this.threshold,
			ratio: estimate.ratio,
		};
	}

	/** Activates only the mechanisms required by current subscriptions. */
	private sync(): void {
		const node = this.node;
		if (!node || typeof document === "undefined") return;

		const resizeN = this.listenerCount("resize");
		const moveN = this.listenerCount("move");
		const visibilityN =
			this.listenerCount("enter") + this.listenerCount("leave");

		// Set measurement baselines when the first matching listener is registered.
		if (this.isClosed) return;
		const wantSize = resizeN > 0;
		const wantMove = moveN > 0;
		if ((wantSize && !this.tracksSize) || (wantMove && !this.tracksMove)) {
			const rect = node.getBoundingClientRect();
			if (wantSize && !this.tracksSize)
				this.lastSize = { width: rect.width, height: rect.height };
			if (wantMove && !this.tracksMove)
				this.lastPosition = this.toPosition(rect);
		}
		this.tracksSize = wantSize;
		this.tracksMove = wantMove;

		// ResizeObserver detects element size changes and movement caused by layout changes.
		const wantRO =
			(wantSize || wantMove) && typeof ResizeObserver !== "undefined";
		if (wantRO && !this.ro) {
			this.ro = new ResizeObserver(() => this.check("resize"));
			this.ro.observe(node);
		} else if (!wantRO && this.ro) {
			this.ro.disconnect();
			this.ro = null;
		}

		// Scroll + resize de ventana: para `move`, o para enter/leave si no hay IntersectionObserver.
		const wantScroll = wantMove || (!this.io && visibilityN > 0);
		if (wantScroll && this.detachScroll === noop) {
			const onScroll = (event: Event) => {
				const target = event.target;
				// Only window scrolls and scrolls from an ancestor can affect this element.
				if (target instanceof Node && !target.contains(node)) return;
				this.schedule("scroll");
			};
			const onResize = () => this.schedule("resize");
			document.addEventListener("scroll", onScroll, {
				capture: true,
				passive: true,
			});
			window.addEventListener("resize", onResize, { passive: true });
			if (!this.io) this.schedule("update"); // sin IntersectionObserver: estado inicial de enter/leave
			this.detachScroll = () => {
				document.removeEventListener("scroll", onScroll, { capture: true });
				window.removeEventListener("resize", onResize);
			};
		} else if (!wantScroll && this.detachScroll !== noop) {
			this.detachScroll();
			this.detachScroll = noop;
		}

		// Optional per-frame polling.
		const wantPoll = this.poll && (wantMove || (!this.io && visibilityN > 0));
		if (wantPoll && !this.polling) {
			this.polling = true;
			this.schedule("poll");
		} else if (!wantPoll) {
			this.polling = false;
		}
	}

	/** Coalesces triggers into a single measurement per animation frame. */
	private schedule(cause: MoveCause): void {
		if (
			this.pendingCause === null ||
			CAUSE_PRIORITY[cause] > CAUSE_PRIORITY[this.pendingCause]
		) {
			this.pendingCause = cause;
		}
		if (this.cancelFrame) return;
		this.cancelFrame = raf(() => {
			this.cancelFrame = null;
			const selectedCause = this.pendingCause ?? "update";
			this.pendingCause = null;
			this.check(selectedCause);
			if (this.polling) this.schedule("poll");
		});
	}

	/** Una sola lectura de layout; emite `resize` y `move` si procede. */
	private check(cause: MoveCause): void {
		const node = this.node;
		if (!node || this.isClosed) return;

		const rect = node.getBoundingClientRect();
		const size: Size = { width: rect.width, height: rect.height };
		const position = this.toPosition(rect);

		if (this.tracksSize && !sameSize(size, this.lastSize)) {
			const previous = this.lastSize;
			this.lastSize = size;
			this.emit("resize", { type: "resize", size, previous, position });
		}

		if (
			this.tracksMove &&
			this.lastPosition &&
			!samePoint(position, this.lastPosition)
		) {
			const previous = this.lastPosition;
			this.lastPosition = position;
			this.emit("move", {
				type: "move",
				position,
				previous,
				deltaX: position.x - previous.x,
				deltaY: position.y - previous.y,
				cause,
				size,
				visible: this.visibility(rect).visible,
			});
		}

		// Without IntersectionObserver, estimate enter/leave transitions on each check.
		if (
			!this.io &&
			this.listenerCount("enter") + this.listenerCount("leave") > 0
		) {
			const estimate = estimateVisibility(rect);
			this.applyVisibility(
				estimate.visible && estimate.ratio + RATIO_TOLERANCE >= this.threshold,
				estimate.ratio,
				rect,
				windowBox(),
				null,
			);
		}
	}

	private onIntersect(entries: IntersectionObserverEntry[]): void {
		const entry = entries[entries.length - 1];
		if (!entry || this.isClosed) return;
		this.ioReady = true;
		this.reportedRatio = entry.intersectionRatio;
		const visible =
			entry.isIntersecting &&
			entry.intersectionRatio + RATIO_TOLERANCE >= this.threshold;
		this.applyVisibility(
			visible,
			entry.intersectionRatio,
			entry.boundingClientRect,
			entry.rootBounds ?? windowBox(),
			entry,
		);
	}

	private applyVisibility(
		visible: boolean,
		ratio: number,
		rect: Box,
		bounds: Box,
		entry: IntersectionObserverEntry | null,
	): void {
		if (visible === this.reportedVisible) return;
		this.reportedVisible = visible;
		const type = visible ? "enter" : "leave";
		this.emit(type, {
			type,
			visible,
			ratio,
			side: sideOf(rect, bounds),
			position: this.toPosition(rect),
			size: { width: rect.width, height: rect.height },
			entry,
		} as ViewportEventMap[typeof type]);
	}

	private emit<K extends ViewportEventName>(
		name: K,
		event: ViewportEventMap[K],
	): void {
		const set = this.entries.get(name);
		if (!set) return;
		for (const entry of set) entry.run(event);
	}
}

export default Viewport;
