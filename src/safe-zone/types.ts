/**
 * SafeZone public types and error definitions.
 *
 * @module
 */

/** Machine-readable error codes emitted by {@link SafeZoneError}. */
export enum SafeZoneErrorCode {
	/** The source is invalid or unsupported. */
	InvalidSource = "INVALID_SOURCE",
	/** The target is not an element or iterable of elements. */
	InvalidTarget = "INVALID_TARGET",
	/** The requested event name is unsupported. */
	InvalidEvent = "INVALID_EVENT",
	/** A listener is not a function. */
	InvalidHandler = "INVALID_HANDLER",
	/** An option has an invalid value. */
	InvalidOption = "INVALID_OPTION",
	/** An operation requiring an open zone was called after closing it. */
	Closed = "CLOSED",
}

/** Error thrown when SafeZone input or lifecycle operations are invalid. */
export class SafeZoneError extends Error {
	/** Stable code for programmatic error handling. */
	readonly code: SafeZoneErrorCode;

	/** Creates a SafeZone API error. */
	constructor(code: SafeZoneErrorCode, message: string) {
		super(message);
		this.name = "SafeZoneError";
		this.code = code;
	}
}

/** Callback that disposes of a resource or listener. */
export type SafeZoneDisposer = () => void;

/** Viewport point in CSS pixels. */
export interface Point {
	readonly x: number;
	readonly y: number;
}

/** Axis-aligned rectangle in viewport coordinates. */
export interface Rect {
	readonly left: number;
	readonly top: number;
	readonly right: number;
	readonly bottom: number;
	readonly width: number;
	readonly height: number;
}

/** Source whose location is monitored by a SafeZone instance. */
export type SafeZoneSource =
	| Element
	| "pointer"
	| (() => Point | Rect | null | undefined);

/** One target element or a collection of elements that define the zone. */
export type SafeZoneTarget = Element | Iterable<Element> | null | undefined;

/** Geometry used to combine target elements into a zone. */
export type SafeZoneShape = "hull" | "union" | "bounds";

/** Rule for testing a rectangular source against the zone. */
export type SafeZoneMode = "intersect" | "contain" | "center";

/** Uniform or per-edge zone padding, in CSS pixels. */
export type Padding =
	| number
	| { top?: number; right?: number; bottom?: number; left?: number };

/** Configuration for the optional SVG visualization overlay. */
export interface VisualizeOptions {
	/** Zone color while the source is outside. Defaults to `#3b82f6`. */
	color?: string;
	/** Zone color while the source is inside. Defaults to `#22c55e`. */
	insideColor?: string;
	/** Fill opacity in the range from 0 to 1. Defaults to `0.15`. */
	fillOpacity?: number;
	/** Whether to outline each target element. Defaults to `true`. */
	showElements?: boolean;
	/** Whether to draw the pointer or source center. Defaults to `true`. */
	showPoint?: boolean;
	/** Overlay stacking order. Defaults to `2147483647`. */
	zIndex?: number;
	/** Element that receives the overlay. Defaults to `document.body`. */
	container?: Element;
}

/** Options that control SafeZone geometry, timing, polling, and cleanup. */
export interface SafeZoneOptions {
	/** Additional spacing around each target in CSS pixels. */
	padding?: Padding;
	/** Target combination geometry. Defaults to `"hull"`. */
	shape?: SafeZoneShape;
	/** Rule for testing rectangular sources. Defaults to `"intersect"`. */
	mode?: SafeZoneMode;
	/** Time in milliseconds before emitting `enter`. Defaults to `0`. */
	enterDelay?: number;
	/** Time in milliseconds before emitting `leave`. Defaults to `0`. */
	leaveDelay?: number;
	/** Re-measure on each animation frame while active. */
	poll?: boolean;
	/** Draw the zone overlay. `true` selects the default appearance. */
	visualize?: boolean | VisualizeOptions;
	/** Signal that closes this instance when aborted. */
	signal?: AbortSignal;
}

/** Measured element rectangles and their combined zone geometry. */
export interface ZoneGeometry {
	readonly shape: SafeZoneShape;
	/** Target rectangles before padding. */
	readonly elements: readonly Rect[];
	/** Target rectangles after padding. */
	readonly rects: readonly Rect[];
	/** Bounding rectangle, or `null` if no targets are visible. */
	readonly bounds: Rect | null;
	/** Convex hull vertices; empty unless `shape` is `"hull"`. */
	readonly hull: readonly Point[];
}

/** SafeZone state transition event names. */
export type SafeZoneEventName = "enter" | "leave" | "inside";

/** Snapshot emitted when a source enters, leaves, or remains inside the zone. */
export interface SafeZoneEvent<
	K extends SafeZoneEventName = SafeZoneEventName,
> {
	readonly type: K;
	/** State after this event. */
	readonly inside: boolean;
	/** Pointer position or source center, when available. */
	readonly point: Point | null;
	/** Source rectangle, when the source is an element or rectangle callback. */
	readonly sourceRect: Rect | null;
	readonly zone: ZoneGeometry;
	/** Native event that caused a pointer-source evaluation. */
	readonly originalEvent: PointerEvent | null;
}

/** Context passed to a SafeZone event handler. */
export interface SafeZoneContext {
	/** Cancels the current listener. */
	readonly cancel: SafeZoneDisposer;
}

/** Handler invoked for a SafeZone event. */
export type SafeZoneHandler<K extends SafeZoneEventName> = (
	event: SafeZoneEvent<K>,
	context: SafeZoneContext,
) => void;

/** Listener lifecycle options. */
export interface SafeZoneListenerOptions {
	/** Remove the listener after its first invocation. */
	once?: boolean;
	/** Signal that removes the listener when aborted. */
	signal?: AbortSignal;
}

/** Handle returned by `on` and `once`. */
export interface SafeZoneSubscription {
	readonly name: SafeZoneEventName;
	readonly active: boolean;
	cancel(): void;
}
