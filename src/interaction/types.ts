import type { NATIVE_EVENTS } from "./constants";

/**
 * Machine-readable error codes emitted by {@link InteractionError}.
 */
export enum InteractionErrorCode {
	/**
	 * The target does not implement `EventTarget`.
	 */
	InvalidTarget = "INVALID_TARGET",

	/**
	 * The event name is empty, malformed, or uses a raw native name.
	 */
	InvalidEvent = "INVALID_EVENT",

	/**
	 * The event handler is not a function.
	 */
	InvalidHandler = "INVALID_HANDLER",

	/**
	 * The delegation selector is empty or invalid CSS.
	 */
	InvalidSelector = "INVALID_SELECTOR",

	/**
	 * The target cannot support the requested operation.
	 */
	UnsupportedTarget = "UNSUPPORTED_TARGET",

	/**
	 * The interaction instance has already been closed.
	 */
	Closed = "CLOSED",
}

/**
 * Public kebab-case names for native DOM events.
 */
export type NativeEventName = keyof typeof NATIVE_EVENTS;

/**
 * Payload emitted when a pointer enters or leaves the target.
 */
export interface HoverEvent {
	readonly type: "hover";
	/** `true` on entry, `false` on exit. */
	readonly hovering: boolean;
	readonly originalEvent: PointerEvent;
}

/**
 * Payload emitted when a pointer is held down for the configured delay.
 */
export interface LongPressEvent {
	readonly type: "long-press";
	/** `pointerdown` event that started the press. */
	readonly originalEvent: PointerEvent;
	/** Configured press duration in milliseconds. */
	readonly duration: number;
	readonly x: number;
	readonly y: number;
}

/**
 * Payload emitted when a pointer goes down outside the target.
 */
export interface OutsideClickEvent {
	readonly type: "outside-click";
	readonly originalEvent: PointerEvent;
}

/**
 * Maps built-in gesture names to their event payloads.
 */
export interface GestureEventMap {
	hover: HoverEvent;
	"long-press": LongPressEvent;
	"outside-click": OutsideClickEvent;
}

/**
 * Name of a built-in gesture.
 */
export type GestureEventName = keyof GestureEventMap;

/**
 * Options shared by native listeners and gestures.
 */
export interface BaseListenerOptions {
	/** Executes once and then unsubscribes. */
	once?: boolean;
	/** Aborting the signal cancels this listener. */
	signal?: AbortSignal;
}

/**
 * Options for native and custom DOM event listeners.
 */
export interface NativeListenerOptions extends BaseListenerOptions {
	capture?: boolean;
	passive?: boolean;
	/**
	 * Delegation selector. The handler runs only when the event originates
	 * within a descendant that matches the selector. `ctx.element` is the
	 * matched descendant.
	 */
	delegate?: string;
}

/**
 * Options for the `hover` gesture.
 */
export interface HoverOptions extends BaseListenerOptions {
	/** Includes touch pointers. Touch pointers are ignored by default. */
	touch?: boolean;
}

/**
 * Options for the `long-press` gesture.
 */
export interface LongPressOptions extends BaseListenerOptions {
	/** Milliseconds until the gesture fires. Defaults to 500. */
	delay?: number;
	/** Maximum movement in pixels before cancelling. Defaults to 10. */
	tolerance?: number;
	/** Suppresses the click that follows a long press. Defaults to `true`. */
	preventClick?: boolean;
	/** Suppresses the context menu during the press. Defaults to `true`. */
	preventContextMenu?: boolean;
}

/**
 * Options for the `outside-click` gesture.
 */
export type OutsideClickOptions = BaseListenerOptions;

/**
 * Maps built-in gesture names to their options.
 */
export interface GestureOptionsMap {
	hover: HoverOptions;
	"long-press": LongPressOptions;
	"outside-click": OutsideClickOptions;
}

/**
 * Options for an {@link Interaction} instance.
 */
export interface InteractionOptions {
	/** Aborting the signal calls {@link Interaction.close}. */
	signal?: AbortSignal;
}

/**
 * Disposer returned by listener helpers.
 */
export type Off = () => void;

/**
 * Handle returned by `on` and `once`.
 *
 * It allows a specific listener to be cancelled independently of the rest of
 * the interaction.
 */
export interface Subscription {
	readonly name: string;
	/** `false` after cancellation, after `once`, or if registration failed. */
	readonly active: boolean;
	cancel(): void;
}

/**
 * Context passed to every interaction handler.
 *
 * @template T - Target type used by the interaction.
 */
export interface InteractionContext<T extends EventTarget = EventTarget> {
	/** Delegated element that matched, or the interaction target. */
	readonly element: Element | T;
	/** Cancels the current listener from within the handler. */
	readonly cancel: Off;
}

/**
 * Event handler used by {@link Interaction.on}.
 *
 * @template E - Event payload type.
 * @template T - Target type used by the interaction.
 */
export type InteractionHandler<E, T extends EventTarget = EventTarget> = (
	event: E,
	ctx: InteractionContext<T>,
) => void;

/**
 * Options accepted by `emit` when creating a custom event.
 */
export type EmitInit = Omit<CustomEventInit, "detail">;

/**
 * Any event name supported by an {@link Interaction}.
 *
 * @template Events - Map of custom event names to their `detail` types.
 */
export type EventName<Events> =
	| NativeEventName
	| GestureEventName
	| (keyof Events & string);

/**
 * Resolves the payload type for an event name.
 *
 * @template K - Event name.
 * @template Events - Map of custom event names to their `detail` types.
 */
export type EventPayload<K, Events> = K extends NativeEventName
	? HTMLElementEventMap[(typeof NATIVE_EVENTS)[K]]
	: K extends GestureEventName
		? GestureEventMap[K]
		: K extends keyof Events
			? CustomEvent<Events[K]>
			: never;

/**
 * Resolves the options type for an event name.
 *
 * @template K - Event name.
 */
export type OptionsOf<K> = K extends GestureEventName
	? GestureOptionsMap[K]
	: NativeListenerOptions;

/**
 * Argument tuple for `emit`.
 *
 * If the detail type is `void` or `undefined`, the detail can be omitted.
 *
 * @template D - Custom event detail type.
 */
export type EmitArgs<D> = [D] extends [void | undefined]
	? [detail?: D, init?: EmitInit]
	: [detail: D, init?: EmitInit];

/**
 * Factory that attaches a built-in gesture to a target.
 *
 * @template K - Gesture name.
 */
export type GestureFactory<K extends GestureEventName> = (
	target: EventTarget,
	emit: (payload: GestureEventMap[K]) => void,
	options: GestureOptionsMap[K],
) => Off;

/**
 * Internal gesture factory type used for dynamic dispatch.
 *
 * @internal
 */
export type LooseGestureFactory = (
	target: EventTarget,
	emit: (payload: unknown) => void,
	options: object,
) => Off;

/**
 * Internal listener record.
 *
 * @internal
 */
export interface Entry {
	readonly name: string;
	readonly handler: unknown;
	readonly cancel: Off;
	readonly pause: Off;
	readonly resume: Off;
}

/**
 * Internal combined options type.
 *
 * @internal
 */
export type LooseOptions = NativeListenerOptions &
	HoverOptions &
	LongPressOptions;
