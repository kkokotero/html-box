import { NOOP } from "./constants";
import {
	boundsOf,
	corners,
	convexHull,
	inflate,
	isInside,
	pointInZone,
	toRect,
	type Subject,
} from "./geometry";
import { createOverlay, type Overlay } from "./overlay";
/** SafeZone event-loop and geometry orchestration. */
import {
	SafeZoneError,
	SafeZoneErrorCode,
	type SafeZoneDisposer,
	type Point,
	type Rect,
	type SafeZoneEvent,
	type SafeZoneEventName,
	type SafeZoneHandler,
	type SafeZoneListenerOptions,
	type SafeZoneMode,
	type SafeZoneOptions,
	type SafeZoneShape,
	type SafeZoneSource,
	type SafeZoneTarget,
	type SafeZoneSubscription,
	type VisualizeOptions,
	type ZoneGeometry,
} from "./types";
import {
	isElement,
	normalizeDelay,
	normalizePadding,
	raf,
	readRect,
	toElements,
} from "./utils";

interface Entry {
	readonly handler: unknown;
	readonly cancel: SafeZoneDisposer;
	readonly run: (event: SafeZoneEvent) => void;
}

const EVENT_NAMES: ReadonlySet<string> = new Set(["enter", "leave", "inside"]);
const inactive = (name: SafeZoneEventName): SafeZoneSubscription => ({
	name,
	active: false,
	cancel: NOOP,
});

/**
 * Tracks whether an element, point callback, or global pointer is inside a zone
 * formed by one or more target elements.
 *
 * @example
 * ```ts
 * const zone = new SafeZone("pointer", [trigger, menu], {
 *   padding: 8,
 *   leaveDelay: 150,
 * });
 * zone.on("leave", closeMenu);
 * ```
 */
export class SafeZone {
	private readonly source: SafeZoneSource | null;
	private readonly elements = new Set<Element>();
	private readonly pad: ReturnType<typeof normalizePadding>;
	private readonly shape: SafeZoneShape;
	private readonly mode: SafeZoneMode;
	private readonly enterDelay: number;
	private readonly leaveDelay: number;
	private readonly poll: boolean;

	private readonly entries = new Map<SafeZoneEventName, Set<Entry>>();
	private overlay: Overlay | null = null;
	private running = false;
	private isClosed = false;
	private cancelFrame: SafeZoneDisposer | null = null;
	private detachListeners: SafeZoneDisposer = NOOP;
	private resizeObserver: ResizeObserver | null = null;
	private detachSignal: SafeZoneDisposer = NOOP;

	private geometry: ZoneGeometry | null = null;
	private subject: Subject | null = null;
	private pointer: { x: number; y: number; event: PointerEvent } | null = null;
	private geometryDirty = true;
	private pointerDirty = false;

	private rawInside = false;
	private reported = false;
	private pending: { target: boolean; cancel: SafeZoneDisposer } | null = null;
	private last: SafeZoneEvent | null = null;

	/**
	 * Creates a zone monitor.
	 *
	 * @param source - `"pointer"`, an element, or a callback returning a point or rectangle.
	 *                 A `null` or `undefined` source creates an inert instance.
	 * @param target - Element or iterable of elements defining the zone.
	 * @param options - Geometry, timing, visualization, and lifecycle options.
	 * @throws {@link SafeZoneError} If the source, target, or options are invalid.
	 */
	constructor(
		source: SafeZoneSource | null | undefined,
		target: SafeZoneTarget,
		options: SafeZoneOptions = {},
	) {
		if (
			source != null &&
			source !== "pointer" &&
			typeof source !== "function" &&
			!isElement(source)
		) {
			throw new SafeZoneError(
				SafeZoneErrorCode.InvalidSource,
				'Source must be "pointer", an Element, a function, or null.',
			);
		}
		this.source = source ?? null;
		for (const element of toElements(target)) this.elements.add(element);

		this.pad = normalizePadding(options.padding);
		this.shape = options.shape ?? "hull";
		this.mode = options.mode ?? "intersect";
		if (!(["hull", "union", "bounds"] as string[]).includes(this.shape)) {
			throw new SafeZoneError(
				SafeZoneErrorCode.InvalidOption,
				'Option `shape` must be "hull", "union" or "bounds".',
			);
		}
		if (!(["intersect", "contain", "center"] as string[]).includes(this.mode)) {
			throw new SafeZoneError(
				SafeZoneErrorCode.InvalidOption,
				'Option `mode` must be "intersect", "contain" or "center".',
			);
		}
		this.enterDelay = normalizeDelay(options.enterDelay, "enterDelay");
		this.leaveDelay = normalizeDelay(options.leaveDelay, "leaveDelay");
		this.poll = options.poll ?? false;

		const { signal } = options;
		if (signal?.aborted) {
			this.isClosed = true;
			return;
		}
		if (signal) {
			const onAbort = () => this.close();
			signal.addEventListener("abort", onAbort, { once: true });
			this.detachSignal = () => signal.removeEventListener("abort", onAbort);
		}
		if (options.visualize)
			this.show(options.visualize === true ? {} : options.visualize);
	}

	/** Whether the zone has been closed. */
	get closed(): boolean {
		return this.isClosed;
	}

	/** Reported state after delays, maintained while listeners or visualization are active. */
	get inside(): boolean {
		return this.reported;
	}

	/** Elements currently defining the zone. */
	get targets(): readonly Element[] {
		return [...this.elements];
	}

	/** Measures current target rectangles and combined zone geometry. */
	measure(): ZoneGeometry {
		const elements: Rect[] = [];
		for (const element of this.elements) {
			const rect = readRect(element);
			if (rect) elements.push(rect);
		}
		const rects = elements.map((rect) => inflate(rect, this.pad));
		const bounds = boundsOf(rects);
		const hull =
			this.shape === "hull" && rects.length
				? convexHull(rects.flatMap(corners))
				: [];
		return { shape: this.shape, elements, rects, bounds, hull };
	}

	/** Checks whether a viewport point is inside the measured zone. */
	contains(x: number, y: number): boolean {
		return pointInZone(this.measure(), x, y);
	}

	/** Adds one or more target elements to the zone. */
	add(target: Element | Iterable<Element>): this {
		this.assertOpen();
		for (const element of toElements(target)) {
			if (this.elements.has(element)) continue;
			this.elements.add(element);
			this.resizeObserver?.observe(element);
		}
		this.invalidate();
		return this;
	}

	/** Removes one or more target elements from the zone. */
	remove(target: Element | Iterable<Element>): this {
		this.assertOpen();
		for (const element of toElements(target)) {
			if (this.elements.delete(element))
				this.resizeObserver?.unobserve(element);
		}
		this.invalidate();
		return this;
	}

	/** Registers a handler for `enter`, `leave`, or `inside` events. */
	on<K extends SafeZoneEventName>(
		name: K,
		handler: SafeZoneHandler<K>,
		options: SafeZoneListenerOptions = {},
	): SafeZoneSubscription {
		this.assertOpen();
		if (!EVENT_NAMES.has(name)) {
			throw new SafeZoneError(
				SafeZoneErrorCode.InvalidEvent,
				`Unknown event "${String(name)}". Expected one of: ${[...EVENT_NAMES].join(", ")}.`,
			);
		}
		if (typeof handler !== "function") {
			throw new SafeZoneError(
				SafeZoneErrorCode.InvalidHandler,
				"Handler must be a function.",
			);
		}
		if (!this.source || options.signal?.aborted) return inactive(name);

		let removed = false;
		const cancel: SafeZoneDisposer = () => {
			if (removed) return;
			removed = true;
			options.signal?.removeEventListener("abort", cancel);
			const entries = this.entries.get(name);
			entries?.delete(entry);
			if (entries?.size === 0) this.entries.delete(name);
			this.refresh();
		};
		const entry: Entry = {
			handler,
			cancel,
			run: (event) => {
				if (removed) return;
				if (options.once) cancel();
				(handler as SafeZoneHandler<SafeZoneEventName>)(event, { cancel });
			},
		};
		let entries = this.entries.get(name);
		if (!entries) this.entries.set(name, (entries = new Set()));
		entries.add(entry);
		options.signal?.addEventListener("abort", cancel, { once: true });
		this.refresh();
		return {
			name,
			get active() {
				return !removed;
			},
			cancel,
		};
	}

	/** Registers a listener that runs at most once. */
	once<K extends SafeZoneEventName>(
		name: K,
		handler: SafeZoneHandler<K>,
		options: Omit<SafeZoneListenerOptions, "once"> = {},
	): SafeZoneSubscription {
		return this.on(name, handler, { ...options, once: true });
	}

	/** Removes listeners for an event, optionally matching one handler. */
	off<K extends SafeZoneEventName>(
		name: K,
		handler?: SafeZoneHandler<K>,
	): void {
		const entries = this.entries.get(name);
		if (!entries) return;
		for (const entry of entries) {
			if (handler === undefined || entry.handler === handler) entry.cancel();
		}
	}

	/** Returns the current number of listeners. */
	listenerCount(name?: SafeZoneEventName): number {
		if (name !== undefined) return this.entries.get(name)?.size ?? 0;
		let total = 0;
		for (const entries of this.entries.values()) total += entries.size;
		return total;
	}

	/** Displays or replaces the SVG overlay for the zone. */
	show(options: VisualizeOptions = {}): this {
		this.assertOpen();
		if (typeof document === "undefined" || !this.source) return this;
		this.overlay?.destroy();
		this.overlay = createOverlay(options);
		this.refresh();
		this.invalidate();
		return this;
	}

	/** Removes the optional SVG overlay. */
	hide(): this {
		this.overlay?.destroy();
		this.overlay = null;
		this.refresh();
		return this;
	}

	/** Re-measures and evaluates synchronously, returning the undelayed inside state. */
	update(): boolean {
		this.assertOpen();
		this.cancelFrame?.();
		this.cancelFrame = null;
		this.geometryDirty = true;
		return this.evaluate();
	}

	/** Removes listeners, observers, overlay, and active subscriptions. */
	close(): void {
		if (
			this.isClosed &&
			this.entries.size === 0 &&
			!this.running &&
			!this.overlay
		)
			return;
		this.isClosed = true;
		this.detachSignal();
		for (const entries of this.entries.values()) {
			for (const entry of entries) entry.cancel();
		}
		this.entries.clear();
		this.overlay?.destroy();
		this.overlay = null;
		this.stop();
	}

	private assertOpen(): void {
		if (this.isClosed)
			throw new SafeZoneError(
				SafeZoneErrorCode.Closed,
				"This SafeZone has been closed.",
			);
	}

	private refresh(): void {
		const shouldRun =
			!this.isClosed &&
			this.source !== null &&
			(this.listenerCount() > 0 || this.overlay !== null);
		if (shouldRun && !this.running) this.start();
		else if (!shouldRun && this.running) this.stop();
	}

	private invalidate = (): void => {
		this.geometryDirty = true;
		this.schedule();
	};

	private schedule(): void {
		if (!this.running || this.cancelFrame) return;
		this.cancelFrame = raf(this.frame);
	}

	private frame = (): void => {
		this.cancelFrame = null;
		if (!this.running) return;
		if (this.poll) this.geometryDirty = true;
		if (this.geometryDirty || this.pointerDirty) this.evaluate();
		if (this.poll) this.schedule();
	};

	private start(): void {
		if (typeof document === "undefined") return;
		this.running = true;
		const passive = { capture: true, passive: true } as const;
		const onPointer = (event: Event): void => {
			const pointerEvent = event as PointerEvent;
			if (!pointerEvent.isPrimary) return;
			if (
				(event.type === "pointerup" || event.type === "pointercancel") &&
				pointerEvent.pointerType !== "mouse"
			) {
				this.pointer = null;
			} else
				this.pointer = {
					x: pointerEvent.clientX,
					y: pointerEvent.clientY,
					event: pointerEvent,
				};
			this.pointerDirty = true;
			this.schedule();
		};
		const onLeaveWindow = (): void => {
			this.pointer = null;
			this.pointerDirty = true;
			this.schedule();
		};
		const root = document.documentElement;
		const disposers: SafeZoneDisposer[] = [];
		const add = (
			target: EventTarget,
			type: string,
			handler: (event: Event) => void,
			options: AddEventListenerOptions,
		): void => {
			target.addEventListener(type, handler, options);
			disposers.push(() => target.removeEventListener(type, handler, options));
		};
		add(document, "scroll", this.invalidate, passive);
		add(window, "resize", this.invalidate, { passive: true });
		if (this.source === "pointer") {
			for (const type of [
				"pointermove",
				"pointerdown",
				"pointerup",
				"pointercancel",
			])
				add(document, type, onPointer, passive);
			add(root, "pointerleave", onLeaveWindow, { passive: true });
		}
		this.detachListeners = () => disposers.forEach((dispose) => dispose());
		if (typeof ResizeObserver !== "undefined") {
			this.resizeObserver = new ResizeObserver(this.invalidate);
			for (const element of this.elements) this.resizeObserver.observe(element);
			if (isElement(this.source)) this.resizeObserver.observe(this.source);
		}
		this.geometryDirty = true;
		this.schedule();
	}

	private stop(): void {
		this.running = false;
		this.detachListeners();
		this.detachListeners = NOOP;
		this.resizeObserver?.disconnect();
		this.resizeObserver = null;
		this.cancelFrame?.();
		this.cancelFrame = null;
		this.pending?.cancel();
		this.pending = null;
		this.rawInside = false;
		this.reported = false;
		this.pointer = null;
		this.pointerDirty = false;
		this.geometry = null;
		this.subject = null;
		this.last = null;
	}

	private readSubject(): Subject | null {
		const source = this.source;
		if (isElement(source)) {
			const rect = readRect(source);
			return rect ? { kind: "rect", rect } : null;
		}
		if (typeof source === "function") {
			const value = source();
			if (!value) return null;
			if ("width" in value && "left" in value)
				return {
					kind: "rect",
					rect: toRect(value.left, value.top, value.right, value.bottom),
				};
			return {
				kind: "point",
				point: { x: (value as Point).x, y: (value as Point).y },
			};
		}
		return null;
	}

	private evaluate(): boolean {
		if (this.geometryDirty || !this.geometry) {
			this.geometry = this.measure();
			if (this.source !== "pointer") this.subject = this.readSubject();
			this.geometryDirty = false;
		}
		if (this.source === "pointer")
			this.subject = this.pointer
				? { kind: "point", point: { x: this.pointer.x, y: this.pointer.y } }
				: null;
		this.pointerDirty = false;
		const geometry = this.geometry;
		const subject = this.subject;
		const rawInside = subject ? isInside(geometry, subject, this.mode) : false;
		this.rawInside = rawInside;
		const point =
			subject?.kind === "point"
				? subject.point
				: subject
					? {
							x: (subject.rect.left + subject.rect.right) / 2,
							y: (subject.rect.top + subject.rect.bottom) / 2,
						}
					: null;
		const sourceRect = subject?.kind === "rect" ? subject.rect : null;
		const originalEvent =
			this.source === "pointer" ? (this.pointer?.event ?? null) : null;
		const snapshot = (
			type: SafeZoneEventName,
			inside: boolean,
		): SafeZoneEvent => ({
			type,
			inside,
			point,
			sourceRect,
			zone: geometry,
			originalEvent,
		});
		this.last = snapshot("inside", rawInside);
		if (rawInside === this.reported) {
			this.pending?.cancel();
			this.pending = null;
		} else {
			const delay = rawInside ? this.enterDelay : this.leaveDelay;
			if (delay <= 0) {
				this.pending?.cancel();
				this.pending = null;
				this.commit(
					rawInside,
					snapshot(rawInside ? "enter" : "leave", rawInside),
				);
			} else if (!this.pending || this.pending.target !== rawInside) {
				this.pending?.cancel();
				const timer = setTimeout(() => {
					this.pending = null;
					if (this.running && this.rawInside === rawInside) {
						const base = this.last!;
						this.commit(rawInside, {
							...base,
							type: rawInside ? "enter" : "leave",
							inside: rawInside,
						});
					}
				}, delay);
				this.pending = { target: rawInside, cancel: () => clearTimeout(timer) };
			}
		}
		if (this.reported && this.running) this.emit(snapshot("inside", true));
		this.overlay?.render(geometry, this.reported || rawInside, point);
		return rawInside;
	}

	private commit(value: boolean, event: SafeZoneEvent): void {
		this.reported = value;
		this.emit(event);
	}

	private emit(event: SafeZoneEvent): void {
		const entries = this.entries.get(event.type);
		if (entries) for (const entry of entries) entry.run(event);
	}
}
