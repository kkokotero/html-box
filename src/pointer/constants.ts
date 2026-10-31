import type { PointerDisposer, PointerEventName } from "./types";

/**
 * Maps public pointer event names to native pointer event types.
 */
export const NATIVE_POINTER_EVENTS: Readonly<Record<PointerEventName, string>> =
	{
		enter: "pointerenter",
		leave: "pointerleave",
		down: "pointerdown",
		up: "pointerup",
		move: "pointermove",
		cancel: "pointercancel",
	};

/**
 * Supported public pointer event names.
 */
export const POINTER_EVENT_NAMES: ReadonlySet<PointerEventName> = new Set([
	"enter",
	"leave",
	"down",
	"up",
	"move",
	"cancel",
]);

/**
 * No-op disposer.
 */
export const NOOP: PointerDisposer = () => {};
