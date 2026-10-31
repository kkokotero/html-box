import type { Off } from "./types";

/**
 * Maps public kebab-case event names to native DOM event names.
 *
 * The keys are the names accepted by {@link Interaction.on}. The values are
 * the event types passed to `addEventListener`.
 */
export const NATIVE_EVENTS = {
	// Mouse
	click: "click",
	"double-click": "dblclick",
	"aux-click": "auxclick",
	"context-menu": "contextmenu",
	"mouse-down": "mousedown",
	"mouse-up": "mouseup",
	"mouse-move": "mousemove",
	"mouse-enter": "mouseenter",
	"mouse-leave": "mouseleave",
	"mouse-over": "mouseover",
	"mouse-out": "mouseout",
	// Pointer
	"pointer-down": "pointerdown",
	"pointer-up": "pointerup",
	"pointer-move": "pointermove",
	"pointer-enter": "pointerenter",
	"pointer-leave": "pointerleave",
	"pointer-over": "pointerover",
	"pointer-out": "pointerout",
	"pointer-cancel": "pointercancel",
	"got-pointer-capture": "gotpointercapture",
	"lost-pointer-capture": "lostpointercapture",
	// Touch
	"touch-start": "touchstart",
	"touch-end": "touchend",
	"touch-move": "touchmove",
	"touch-cancel": "touchcancel",
	// Keyboard
	"key-down": "keydown",
	"key-up": "keyup",
	// Focus
	focus: "focus",
	blur: "blur",
	"focus-in": "focusin",
	"focus-out": "focusout",
	// Forms
	input: "input",
	"before-input": "beforeinput",
	change: "change",
	submit: "submit",
	reset: "reset",
	invalid: "invalid",
	select: "select",
	// Scroll
	scroll: "scroll",
	wheel: "wheel",
	// Drag and drop
	drag: "drag",
	"drag-start": "dragstart",
	"drag-end": "dragend",
	"drag-enter": "dragenter",
	"drag-leave": "dragleave",
	"drag-over": "dragover",
	drop: "drop",
	// Clipboard
	copy: "copy",
	cut: "cut",
	paste: "paste",
	// Animations and transitions
	"animation-start": "animationstart",
	"animation-end": "animationend",
	"animation-iteration": "animationiteration",
	"animation-cancel": "animationcancel",
	"transition-run": "transitionrun",
	"transition-start": "transitionstart",
	"transition-end": "transitionend",
	"transition-cancel": "transitioncancel",
	// Other
	load: "load",
	error: "error",
	toggle: "toggle",
	"select-start": "selectstart",
} as const satisfies Record<string, keyof HTMLElementEventMap>;

/**
 * Public event names whose native events do not bubble.
 *
 * Delegated listeners for these events default to the capture phase.
 */
export const NON_BUBBLING: ReadonlySet<string> = new Set([
	"focus",
	"blur",
	"mouse-enter",
	"mouse-leave",
	"pointer-enter",
	"pointer-leave",
	"load",
	"error",
	"scroll",
]);

/**
 * Maps native DOM event names to their public kebab-case aliases.
 *
 * Event names that are identical in both formats are omitted.
 */
export const RAW_TO_KEBAB: ReadonlyMap<string, string> = new Map(
	Object.entries(NATIVE_EVENTS)
		.filter(([kebab, raw]) => kebab !== raw)
		.map(([kebab, raw]) => [raw, kebab]),
);

/**
 * No-op disposer.
 */
export const NOOP: Off = () => {};
