import { NOOP, RAW_TO_KEBAB } from "./constants";
import { InteractionError } from "./interaction-error";
import {
	InteractionErrorCode,
	type GestureEventName,
	type GestureFactory,
	type Off,
	type Subscription,
} from "./types";

/**
 * Checks whether an object has an own property.
 *
 * @param obj - Object to inspect.
 * @param key - Property name.
 * @returns `true` when the property belongs to the object itself.
 */
export const hasOwnProperty = (obj: object, key: string): boolean =>
	Object.prototype.hasOwnProperty.call(obj, key);

/**
 * Adds an event listener and returns a disposer for it.
 *
 * The disposer uses the same capture setting as the registration.
 *
 * @param target - Event target.
 * @param eventType - Native DOM event name.
 * @param handler - Listener callback.
 * @param options - Native listener options.
 * @returns A function that removes the listener.
 */
export function addEventListenerWithCleanup(
	target: EventTarget,
	eventType: string,
	handler: (event: Event) => void,
	options?: AddEventListenerOptions,
): Off {
	target.addEventListener(eventType, handler, options);
	const capture = options?.capture ?? false;
	return () => target.removeEventListener(eventType, handler, capture);
}

/**
 * Combines multiple disposers into one.
 *
 * @param disposers - Disposers to run.
 * @returns A function that runs every disposer.
 */
export function combineDisposers(disposers: Off[]): Off {
	return () => {
		for (const dispose of disposers) dispose();
	};
}

/**
 * Validates an event name.
 *
 * Raw native names are rejected when a kebab-case alias exists.
 *
 * @param name - Event name to validate.
 * @throws {InteractionError} If the name is empty or uses a raw native name.
 */
export function assertEventName(name: unknown): asserts name is string {
	if (typeof name !== "string" || name.trim() === "") {
		throw new InteractionError(
			InteractionErrorCode.InvalidEvent,
			"Event name must be a non-empty string.",
		);
	}
	const suggestion = RAW_TO_KEBAB.get(name);
	if (suggestion) {
		throw new InteractionError(
			InteractionErrorCode.InvalidEvent,
			`Use kebab-case event names: "${suggestion}" instead of "${name}".`,
		);
	}
}

/**
 * Validates an event handler.
 *
 * @param handler - Value to validate.
 * @throws {InteractionError} If the handler is not a function.
 */
export function assertHandler(
	handler: unknown,
): asserts handler is (...args: never[]) => unknown {
	if (typeof handler !== "function") {
		throw new InteractionError(
			InteractionErrorCode.InvalidHandler,
			"Handler must be a function.",
		);
	}
}

/**
 * Validates an interaction target.
 *
 * @param target - Value to validate.
 * @throws {InteractionError} If the target does not implement `EventTarget`.
 */
export function assertTarget(target: unknown): asserts target is EventTarget {
	if (
		target === null ||
		(typeof target !== "object" && typeof target !== "function") ||
		typeof (target as EventTarget).addEventListener !== "function" ||
		typeof (target as EventTarget).removeEventListener !== "function"
	) {
		throw new InteractionError(
			InteractionErrorCode.InvalidTarget,
			"Target must implement EventTarget.",
		);
	}
}

/**
 * Validates a delegation selector against the target's document.
 *
 * @param target - Event target used by the interaction.
 * @param selector - CSS selector to validate.
 * @throws {InteractionError} If the selector is empty, invalid, or the target
 * cannot support delegation.
 */
export function assertDelegateSelector(
	target: EventTarget,
	selector: string,
): void {
	if (typeof selector !== "string" || selector.trim() === "") {
		throw new InteractionError(
			InteractionErrorCode.InvalidSelector,
			"Delegate selector must be a non-empty string.",
		);
	}

	if (typeof Node === "undefined" || !(target instanceof Node)) {
		throw new InteractionError(
			InteractionErrorCode.UnsupportedTarget,
			"Delegation requires a DOM Node target.",
		);
	}

	const doc =
		target.ownerDocument ?? (target instanceof Document ? target : null);
	if (!doc) {
		throw new InteractionError(
			InteractionErrorCode.UnsupportedTarget,
			"Delegation requires a document-backed target.",
		);
	}

	try {
		doc.createDocumentFragment().querySelector(selector);
	} catch (error) {
		throw new InteractionError(
			InteractionErrorCode.InvalidSelector,
			`Invalid delegate selector: "${selector}"`,
			error,
		);
	}
}

/**
 * Finds the descendant of a target that matches a delegation selector.
 *
 * The target itself is not considered a delegated match.
 *
 * @param target - Event target used by the interaction.
 * @param event - Event being handled.
 * @param selector - Delegation selector.
 * @returns The matching descendant, or `null` when there is no match.
 */
export function findMatchingDelegate(
	target: EventTarget,
	event: Event,
	selector: string,
): Element | null {
	if (typeof Element === "undefined" || typeof Node === "undefined") {
		return null;
	}

	const origin =
		event.target instanceof Element
			? event.target
			: ((event.target as Node | null)?.parentElement ?? null);
	const match = origin?.closest(selector) ?? null;
	if (!match || match === target) return null;
	return target instanceof Node && target.contains(match) ? match : null;
}

/**
 * Built-in `hover` gesture.
 *
 * Emits on pointer entry and exit. Touch pointers are ignored unless
 * `touch` is enabled.
 */
export const hover: GestureFactory<"hover"> = (target, emit, options) => {
	const createHoverHandler = (isHovering: boolean) => (event: Event) => {
		const originalEvent = event as PointerEvent;
		if (!options.touch && originalEvent.pointerType === "touch") return;
		emit({ type: "hover", hovering: isHovering, originalEvent });
	};

	return combineDisposers([
		addEventListenerWithCleanup(
			target,
			"pointerenter",
			createHoverHandler(true),
		),
		addEventListenerWithCleanup(
			target,
			"pointerleave",
			createHoverHandler(false),
		),
	]);
};

/**
 * Built-in `long-press` gesture.
 *
 * Emits after a pointer remains pressed within the configured tolerance. It can
 * suppress the following click and the context menu.
 */
export const longPress: GestureFactory<"long-press"> = (
	target,
	emit,
	options,
) => {
	const delay = options.delay ?? 500;
	const tolerance = options.tolerance ?? 10;
	const preventClick = options.preventClick ?? true;
	const preventContextMenu = options.preventContextMenu ?? true;

	let longPressTimer: ReturnType<typeof setTimeout> | undefined;
	let clickSuppressionTimer: ReturnType<typeof setTimeout> | undefined;
	let isClickSuppressed = false;
	let currentSession:
		| { id: number; x: number; y: number; fired: boolean }
		| undefined;

	const clearLongPressTimer = () => {
		if (longPressTimer !== undefined) clearTimeout(longPressTimer);
		longPressTimer = undefined;
	};

	const resetGestureSession = () => {
		clearLongPressTimer();
		currentSession = undefined;
	};

	const handlePointerDown = (event: Event) => {
		const pointerEvent = event as PointerEvent;
		if (
			!pointerEvent.isPrimary ||
			(pointerEvent.pointerType === "mouse" && pointerEvent.button !== 0)
		) {
			return;
		}

		resetGestureSession();
		isClickSuppressed = false;

		const session = {
			id: pointerEvent.pointerId,
			x: pointerEvent.clientX,
			y: pointerEvent.clientY,
			fired: false,
		};
		currentSession = session;

		longPressTimer = setTimeout(() => {
			longPressTimer = undefined;
			session.fired = true;
			emit({
				type: "long-press",
				originalEvent: pointerEvent,
				duration: delay,
				x: session.x,
				y: session.y,
			});
		}, delay);
	};

	const handlePointerMove = (event: Event) => {
		const pointerEvent = event as PointerEvent;
		if (!currentSession || pointerEvent.pointerId !== currentSession.id) return;
		const distance = Math.hypot(
			pointerEvent.clientX - currentSession.x,
			pointerEvent.clientY - currentSession.y,
		);
		if (distance > tolerance) resetGestureSession();
	};

	const handlePointerUp = (event: Event) => {
		const pointerEvent = event as PointerEvent;
		if (!currentSession || pointerEvent.pointerId !== currentSession.id) return;
		const hasFired = currentSession.fired;
		resetGestureSession();

		if (hasFired && preventClick) {
			isClickSuppressed = true;
			clickSuppressionTimer = setTimeout(() => {
				isClickSuppressed = false;
			}, 300);
		}
	};

	const handleClick = (event: Event) => {
		if (!isClickSuppressed) return;
		isClickSuppressed = false;
		event.preventDefault();
		event.stopImmediatePropagation();
	};

	const handleContextMenu = (event: Event) => {
		if (preventContextMenu && currentSession) event.preventDefault();
	};

	const stopListeners = combineDisposers([
		addEventListenerWithCleanup(target, "pointerdown", handlePointerDown),
		addEventListenerWithCleanup(target, "pointermove", handlePointerMove),
		addEventListenerWithCleanup(target, "pointerup", handlePointerUp),
		addEventListenerWithCleanup(target, "pointercancel", resetGestureSession),
		addEventListenerWithCleanup(target, "pointerleave", resetGestureSession),
		addEventListenerWithCleanup(target, "click", handleClick, {
			capture: true,
		}),
		addEventListenerWithCleanup(target, "contextmenu", handleContextMenu),
	]);

	return () => {
		stopListeners();
		resetGestureSession();
		if (clickSuppressionTimer !== undefined) {
			clearTimeout(clickSuppressionTimer);
		}
	};
};

/**
 * Built-in `outside-click` gesture.
 *
 * Emits when a pointer goes down outside the target.
 */
export const outsideClick: GestureFactory<"outside-click"> = (target, emit) => {
	if (typeof Node === "undefined" || !(target instanceof Node)) {
		throw new InteractionError(
			InteractionErrorCode.UnsupportedTarget,
			'"outside-click" requires a DOM Node as target.',
		);
	}

	const documentNode =
		target instanceof Document ? target : target.ownerDocument;
	if (!documentNode) {
		throw new InteractionError(
			InteractionErrorCode.UnsupportedTarget,
			'"outside-click" requires a node attached to a document.',
		);
	}

	return addEventListenerWithCleanup(
		documentNode,
		"pointerdown",
		(event) => {
			const isInside =
				event.composedPath().includes(target) ||
				target.contains(event.target as Node | null);
			if (!isInside) {
				emit({ type: "outside-click", originalEvent: event as PointerEvent });
			}
		},
		{ capture: true },
	);
};

/**
 * Built-in gesture factories keyed by public event name.
 *
 * @internal
 */
export const GESTURES = {
	hover,
	"long-press": longPress,
	"outside-click": outsideClick,
} satisfies { [K in GestureEventName]: GestureFactory<K> };

/**
 * Creates a subscription that is already inactive.
 *
 * @param subscriptionName - Public event name.
 * @returns An inactive subscription.
 */
export const createInactiveSubscription = (
	subscriptionName: string,
): Subscription => ({
	name: subscriptionName,
	active: false,
	cancel: NOOP,
});
