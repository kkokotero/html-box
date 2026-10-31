import { NOOP, POINTER_EVENT_NAMES } from "./constants";
import { PointerError } from "./pointer-error";
import {
	PointerErrorCode,
	type PointerDisposer,
	type PointerEventName,
	type PointerSubscription,
	type PointerTypeName,
	type Proximity,
} from "./types";

/**
 * Clamps a number to an inclusive range.
 *
 * @param value - Value to clamp.
 * @param min - Lower bound.
 * @param max - Upper bound.
 * @returns The clamped value.
 */
export const clamp = (value: number, min: number, max: number): number =>
	Math.min(Math.max(value, min), max);

/**
 * Normalizes a DOM pointer type.
 *
 * @param type - Raw `PointerEvent.pointerType` value.
 * @returns A known pointer kind or `"unknown"`.
 */
export const pointerKindOf = (type: string): PointerTypeName =>
	type === "mouse" || type === "pen" || type === "touch" ? type : "unknown";

/**
 * Adds a listener and returns a disposer for it.
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
): PointerDisposer {
	target.addEventListener(eventType, handler, options);
	const capture = options?.capture ?? false;
	return () => target.removeEventListener(eventType, handler, capture);
}

/**
 * Validates a pointer event name.
 *
 * @param name - Event name to validate.
 * @throws {PointerError} If the event name is not supported.
 */
export function assertPointerEventName(
	name: unknown,
): asserts name is PointerEventName {
	if (
		typeof name !== "string" ||
		!POINTER_EVENT_NAMES.has(name as PointerEventName)
	) {
		throw new PointerError(
			PointerErrorCode.InvalidEvent,
			`Unknown pointer event "${String(name)}". Expected one of: ${[
				...POINTER_EVENT_NAMES,
			].join(", ")}.`,
		);
	}
}

/**
 * Validates a pointer handler.
 *
 * @param handler - Value to validate.
 * @throws {PointerError} If the handler is not a function.
 */
export function assertPointerHandler(
	handler: unknown,
): asserts handler is (...args: never[]) => unknown {
	if (typeof handler !== "function") {
		throw new PointerError(
			PointerErrorCode.InvalidHandler,
			"Handler must be a function.",
		);
	}
}

/**
 * Validates a pointer target.
 *
 * @param target - Value to validate.
 * @throws {PointerError} If the target is not an `Element`, `null`, or
 * `undefined`.
 */
export function assertPointerTarget(
	target: unknown,
): asserts target is Element | null | undefined {
	if (target == null) return;
	if (typeof Element === "undefined" || !(target instanceof Element)) {
		throw new PointerError(
			PointerErrorCode.InvalidTarget,
			"Target must be an Element, null, or undefined.",
		);
	}
}

/**
 * Returns the style declaration required by the `touchAction` option.
 *
 * @param element - Target element.
 * @returns The writable style declaration.
 * @throws {PointerError} If the element does not expose a style declaration.
 */
export function getTouchActionStyle(element: Element): CSSStyleDeclaration {
	const style = (element as Element & { style?: CSSStyleDeclaration }).style;
	if (!style) {
		throw new PointerError(
			PointerErrorCode.UnsupportedTarget,
			"Option `touchAction` requires an HTMLElement or SVGElement.",
		);
	}
	return style;
}

/**
 * Validates and normalizes a proximity radius.
 *
 * @param radius - Optional radius.
 * @returns A non-negative finite radius.
 * @throws {PointerError} If the radius is not a non-negative finite number.
 */
export function normalizeRadius(radius: number | undefined): number {
	const value = radius ?? 0;
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
		throw new PointerError(
			PointerErrorCode.InvalidOption,
			"Option `radius` must be a non-negative finite number.",
		);
	}
	return value;
}

/**
 * Validates and normalizes a proximity metric.
 *
 * @param metric - Optional metric.
 * @returns `"edge"` or `"center"`.
 * @throws {PointerError} If the metric is not supported.
 */
export function normalizeProximityMetric(
	metric: unknown,
): "edge" | "center" {
	if (metric === undefined) return "edge";
	if (metric !== "edge" && metric !== "center") {
		throw new PointerError(
			PointerErrorCode.InvalidOption,
			'Option `metric` must be "edge" or "center".',
		);
	}
	return metric;
}

/**
 * Measures proximity between a viewport point and an element.
 *
 * @template E - Element type being measured.
 * @param element - Element used for the measurement.
 * @param x - Viewport X coordinate.
 * @param y - Viewport Y coordinate.
 * @param metric - Measurement origin.
 * @param radius - Maximum considered distance.
 * @returns Proximity information for the point and element.
 */
export function measureProximity<E extends Element>(
	element: E,
	x: number,
	y: number,
	metric: "edge" | "center",
	radius: number,
): Proximity<E> {
	const rect = element.getBoundingClientRect();
	const centerX = rect.left + rect.width / 2;
	const centerY = rect.top + rect.height / 2;
	const closestX = clamp(x, rect.left, rect.right);
	const closestY = clamp(y, rect.top, rect.bottom);
	const edgeDistance = Math.hypot(x - closestX, y - closestY);
	const dx = x - centerX;
	const dy = y - centerY;
	const centerDistance = Math.hypot(dx, dy);
	const distance = metric === "center" ? centerDistance : edgeDistance;
	const near = distance <= radius;
	const ratio =
		radius === 0 ? (near ? 1 : 0) : clamp(1 - distance / radius, 0, 1);

	return {
		element,
		distance,
		edgeDistance,
		centerDistance,
		inside: edgeDistance === 0,
		near,
		ratio,
		dx,
		dy,
		angle: Math.atan2(dy, dx),
		closest: { x: closestX, y: closestY },
	};
}

/**
 * Captures a pointer on an element.
 *
 * @param target - Element that should capture the pointer.
 * @param pointerId - Pointer identifier.
 * @returns `true` when the capture is active.
 */
export function capturePointer(target: Element, pointerId: number): boolean {
	try {
		target.setPointerCapture(pointerId);
		return target.hasPointerCapture(pointerId);
	} catch {
		return false;
	}
}

/**
 * Releases a pointer capture from an element.
 *
 * @param target - Element that owns the capture.
 * @param pointerId - Pointer identifier.
 * @returns `true` when an existing capture was released.
 */
export function releasePointerCapture(
	target: Element,
	pointerId: number,
): boolean {
	try {
		if (!target.hasPointerCapture(pointerId)) return false;
		target.releasePointerCapture(pointerId);
		return true;
	} catch {
		return false;
	}
}

/**
 * Checks whether an element currently captures a pointer.
 *
 * @param target - Element that may own the capture.
 * @param pointerId - Pointer identifier.
 * @returns `true` when the element has the capture.
 */
export function hasPointerCapture(
	target: Element,
	pointerId: number,
): boolean {
	try {
		return target.hasPointerCapture(pointerId);
	} catch {
		return false;
	}
}

/**
 * Releases every pointer capture in a collection.
 *
 * @param target - Element that owns the captures.
 * @param pointerIds - Pointer identifiers to release.
 */
export function releaseAllPointerCaptures(
	target: Element,
	pointerIds: Iterable<number>,
): void {
	for (const pointerId of pointerIds) {
		releasePointerCapture(target, pointerId);
	}
}

/**
 * Creates a subscription that is already inactive.
 *
 * @param name - Public pointer event name.
 * @returns An inactive subscription.
 */
export const createInactiveSubscription = (
	name: PointerEventName,
): PointerSubscription => ({
	name,
	active: false,
	cancel: NOOP,
});
