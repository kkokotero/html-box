/** Callback that releases a viewport resource or subscription. */
export type Off = () => void;

/** Width and height measured from the element's visual bounding rectangle. */
export interface Size {
	readonly width: number;
	readonly height: number;
}

/** Element geometry in viewport and document coordinates. */
export interface Position {
	/** Horizontal position relative to the viewport. */
	readonly x: number;
	/** Vertical position relative to the viewport. */
	readonly y: number;
	/** Left edge relative to the viewport. */
	readonly left: number;
	/** Top edge relative to the viewport. */
	readonly top: number;
	/** Right edge relative to the viewport. */
	readonly right: number;
	/** Bottom edge relative to the viewport. */
	readonly bottom: number;
	/** Document coordinate (viewport coordinate plus window scroll). */
	readonly pageX: number;
	readonly pageY: number;
}

export interface ViewportSnapshot {
	/** Current visual element dimensions. */
	readonly size: Size;
	/** Current viewport and document coordinates. */
	readonly position: Position;
	/** Whether the element meets the configured visibility threshold. */
	readonly visible: boolean;
	/** Fraction of the element intersecting the viewport, from 0 to 1. */
	readonly ratio: number;
}

/** Trigger that detected the position change. */
export type MoveCause = "scroll" | "resize" | "poll" | "update";

/** Viewport edge through which the element enters or exits. */
export type Side = "top" | "bottom" | "left" | "right";

export interface ViewportResizeEvent {
	/** Event discriminator. */
	readonly type: "resize";
	/** New element dimensions. */
	readonly size: Size;
	/** Dimensions from the previous check. */
	readonly previous: Size;
	/** Element position when the resize was detected. */
	readonly position: Position;
}

/** Payload emitted when the element's viewport position changes. */
export interface ViewportMoveEvent {
	/** Event discriminator. */
	readonly type: "move";
	/** New position. */
	readonly position: Position;
	/** Position from the previous check. */
	readonly previous: Position;
	/** Change in x/y since the previous `move` event. */
	readonly deltaX: number;
	readonly deltaY: number;
	/** Trigger that initiated the check. */
	readonly cause: MoveCause;
	/** Element size at the time of the movement. */
	readonly size: Size;
	/** Visibility state at the time of the movement. */
	readonly visible: boolean;
}

/** Payload emitted when the element crosses its visibility threshold. */
export interface ViewportVisibilityEvent<
	K extends "enter" | "leave" = "enter" | "leave",
> {
	/** Event discriminator. */
	readonly type: K;
	/** Visibility state after the transition. */
	readonly visible: boolean;
	/** Fraction of the element that is visible, from 0 to 1. */
	readonly ratio: number;
	/** Viewport edge through which it entered or exited, or null when ambiguous. */
	readonly side: Side | null;
	/** Element position at the transition. */
	readonly position: Position;
	/** Element size at the transition. */
	readonly size: Size;
	/** Original IntersectionObserver entry, or null when using the synchronous estimate. */
	readonly entry: IntersectionObserverEntry | null;
}

/** Event names mapped to their corresponding payload types. */
export interface ViewportEventMap {
	resize: ViewportResizeEvent;
	move: ViewportMoveEvent;
	enter: ViewportVisibilityEvent<"enter">;
	leave: ViewportVisibilityEvent<"leave">;
}

/** Supported Viewport event names. */
export type ViewportEventName = keyof ViewportEventMap;

export interface ViewportContext {
	/** Cancels this listener, including from within its own handler. */
	readonly cancel: Off;
}

/** Typed callback for a Viewport event. */
/** @typeParam K - Event name that determines the payload type. */
export type ViewportHandler<K extends ViewportEventName> = (
	event: ViewportEventMap[K],
	ctx: ViewportContext,
) => void;

export interface ViewportListenerOptions {
	/** Removes the listener after its first invocation. */
	once?: boolean;
	/** Removes the listener when the signal aborts. */
	signal?: AbortSignal;
}

/** Handle returned when a listener is registered. */
export interface Subscription {
	/** Event name associated with the subscription. */
	readonly name: string;
	/** Whether the listener is still registered. */
	readonly active: boolean;
	/** Removes the listener. Safe to call more than once. */
	cancel(): void;
}

/** Configuration for a Viewport instance. */
export interface ViewportOptions {
	/** Minimum visible fraction, from 0 to 1. Defaults to 0 (any visible pixel). */
	threshold?: number;
	/** IntersectionObserver root margin, such as "100px" to detect entry early. */
	rootMargin?: string;
	/**
	 * Checks position every animation frame while `move` listeners are active.
	 * Use this to detect movement caused by transforms or animations.
	 */
	poll?: boolean;
	/** Closes the instance when the signal aborts. */
	signal?: AbortSignal;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */
