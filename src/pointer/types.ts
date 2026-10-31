/**
 * Machine-readable error codes emitted by {@link PointerError}.
 */
export enum PointerErrorCode {
	/**
	 * The target is not an `Element`, `null`, or `undefined`.
	 */
	InvalidTarget = "INVALID_TARGET",

	/**
	 * The pointer event name is not supported.
	 */
	InvalidEvent = "INVALID_EVENT",

	/**
	 * The pointer handler is not a function.
	 */
	InvalidHandler = "INVALID_HANDLER",

	/**
	 * A pointer option has an invalid value.
	 */
	InvalidOption = "INVALID_OPTION",

	/**
	 * The target cannot support the requested operation.
	 */
	UnsupportedTarget = "UNSUPPORTED_TARGET",

	/**
	 * The pointer instance has already been closed.
	 */
	Closed = "CLOSED",
}

/**
 * Pointer device kind reported by Pointer Events.
 */
export type PointerKind = "mouse" | "pen" | "touch";

/**
 * Normalized pointer kind, including devices that do not report a known type.
 */
export type PointerTypeName = PointerKind | "unknown";

/**
 * Public pointer event names emitted by {@link Pointer}.
 */
export type PointerEventName =
	| "enter"
	| "leave"
	| "down"
	| "up"
	| "move"
	| "cancel";

/**
 * Disposer returned by pointer helpers.
 */
export type PointerDisposer = () => void;

/**
 * Current pointer position across viewport, document, and local coordinates.
 */
export interface PointerPosition {
	/** X coordinate relative to the viewport. */
	readonly x: number;
	/** Y coordinate relative to the viewport. */
	readonly y: number;
	/** X coordinate relative to the document. */
	readonly pageX: number;
	/** Y coordinate relative to the document. */
	readonly pageY: number;
	/** X coordinate relative to the target's top-left corner. */
	readonly localX: number;
	/** Y coordinate relative to the target's top-left corner. */
	readonly localY: number;
	/** `localX` normalized by the target width. */
	readonly ratioX: number;
	/** `localY` normalized by the target height. */
	readonly ratioY: number;
	/**
	 * Whether the pointer is geometrically inside the target.
	 *
	 * This can be `false` while the pointer is captured and has moved outside
	 * the target.
	 */
	readonly inside: boolean;
	/** Whether the pointer is currently pressed. */
	readonly pressed: boolean;
	/** Browser-assigned pointer identifier. */
	readonly pointerId: number;
	/** Normalized pointer device kind. */
	readonly pointerType: PointerTypeName;
	/** Whether this is the primary pointer. */
	readonly isPrimary: boolean;
}

/**
 * Pointer sample delivered to event handlers.
 *
 * @template K - Pointer event name.
 */
export interface PointerSample<
	K extends PointerEventName = PointerEventName,
> extends PointerPosition {
	/** Event that produced this sample. */
	readonly type: K;
	/** Button that changed state, when applicable. */
	readonly button: number;
	/** Bitmask of buttons currently pressed. */
	readonly buttons: number;
	/** Normalized pressure reported by the browser. */
	readonly pressure: number;
	/** Horizontal movement since the previous event for the same pointer. */
	readonly deltaX: number;
	/** Vertical movement since the previous event for the same pointer. */
	readonly deltaY: number;
	/** Horizontal displacement since the last `down`. */
	readonly displacementX: number;
	/** Vertical displacement since the last `down`. */
	readonly displacementY: number;
	/** Magnitude of the displacement since the last `down`. */
	readonly distance: number;
	/** Original DOM event. */
	readonly originalEvent: PointerEvent;
}

/**
 * Context passed to pointer handlers.
 */
export interface PointerContext {
	/** Cancels the current listener from within its handler. */
	readonly cancel: PointerDisposer;
}

/**
 * Handler used by {@link Pointer.on} and {@link Pointer.once}.
 *
 * @template S - Pointer sample type.
 */
export type PointerHandler<S> = (sample: S, ctx: PointerContext) => void;

/**
 * Handle returned by {@link Pointer.on} and {@link Pointer.once}.
 */
export interface PointerSubscription {
	/** Public pointer event name. */
	readonly name: PointerEventName;
	/** `false` after cancellation, after `once`, or for inert instances. */
	readonly active: boolean;
	/** Cancels the listener. */
	cancel(): void;
}

/**
 * Options shared by pointer listeners.
 */
export interface PointerListenerOptions {
	/** Executes the handler once and then unsubscribes. */
	once?: boolean;
	/** Aborting the signal cancels the listener. */
	signal?: AbortSignal;
}

/**
 * Options for a {@link Pointer} instance.
 */
export interface PointerOptions {
	/** Aborting the signal calls {@link Pointer.close}. */
	signal?: AbortSignal;
	/**
	 * Captures the pointer automatically on `down` and releases it on
	 * `up` or `cancel`.
	 */
	capture?: boolean;
	/** Ignores non-primary pointers. Defaults to `true`. */
	primaryOnly?: boolean;
	/** Pointer kinds accepted by the instance. Defaults to all kinds. */
	types?: readonly PointerKind[];
	/**
	 * Value assigned to the target's `touch-action` style while the instance
	 * is open. Use `"none"` to prevent browser scrolling during touch drags.
	 */
	touchAction?: string;
}

/**
 * Options for proximity measurement.
 */
export interface ProximityOptions {
	/** Maximum considered distance in pixels. Defaults to `0`. */
	radius?: number;
	/**
	 * Measurement origin: the nearest edge (default) or the element center.
	 */
	metric?: "edge" | "center";
}

/**
 * Proximity between a pointer and an element.
 *
 * @template E - Element type being measured.
 */
export interface Proximity<E extends Element = Element> {
	/** Element used for the measurement. */
	readonly element: E;
	/** Distance according to the selected metric. */
	readonly distance: number;
	/** Distance to the nearest edge. `0` when the pointer is inside. */
	readonly edgeDistance: number;
	/** Distance to the element center. */
	readonly centerDistance: number;
	/** Whether the pointer is inside the element. */
	readonly inside: boolean;
	/** `true` when `distance` is less than or equal to the configured radius. */
	readonly near: boolean;
	/** Normalized proximity: `1` at the measured point, `0` at the radius. */
	readonly ratio: number;
	/** Horizontal vector from the element center to the pointer. */
	readonly dx: number;
	/** Vertical vector from the element center to the pointer. */
	readonly dy: number;
	/** Angle of the center-to-pointer vector in radians. */
	readonly angle: number;
	/** Nearest point on the element to the pointer, in viewport coordinates. */
	readonly closest: { readonly x: number; readonly y: number };
}
