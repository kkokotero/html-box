import { describe, expect, it, vi } from "vitest";

import { Pointer, PointerError, PointerErrorCode } from "../src/pointer";

function dispatchPointerEvent(
	target: Element,
	type: string,
	properties: Partial<PointerEvent> = {},
): PointerEvent {
	const event = new Event(type, {
		bubbles: true,
		cancelable: true,
	}) as PointerEvent;
	Object.assign(event, {
		pointerId: 1,
		pointerType: "mouse",
		isPrimary: true,
		button: 0,
		buttons: type === "pointerdown" ? 1 : 0,
		clientX: 0,
		clientY: 0,
		pageX: 0,
		pageY: 0,
		pressure: 0.5,
		...properties,
	});
	target.dispatchEvent(event);
	return event;
}

function setRect(element: Element, rect: Partial<DOMRect>): void {
	vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
		x: rect.x ?? rect.left ?? 0,
		y: rect.y ?? rect.top ?? 0,
		left: rect.left ?? 0,
		top: rect.top ?? 0,
		right: rect.right ?? (rect.left ?? 0) + (rect.width ?? 100),
		bottom: rect.bottom ?? (rect.top ?? 0) + (rect.height ?? 100),
		width: rect.width ?? 100,
		height: rect.height ?? 100,
		toJSON: () => ({}),
	} as DOMRect);
}

describe("Pointer", () => {
	it("exposes its target and initially empty state", () => {
		const target = document.createElement("div");
		const pointer = new Pointer(target);
		expect(pointer.target).toBe(target);
		expect(pointer.closed).toBe(false);
		expect(pointer.position).toBeNull();
		expect(pointer.pointers).toEqual([]);
		expect(pointer.pressed).toBe(false);
		pointer.close();
	});

	it("pauses event tracking, clears live pointer state, and resumes subscriptions", () => {
		const target = document.createElement("div");
		const pointer = new Pointer(target);
		const handler = vi.fn<() => void>();
		const subscription = pointer.on("move", handler);

		dispatchPointerEvent(target, "pointermove", { clientX: 10, clientY: 20 });
		expect(handler).toHaveBeenCalledTimes(1);
		expect(pointer.position?.x).toBe(10);

		pointer.pause();
		dispatchPointerEvent(target, "pointermove", { clientX: 30, clientY: 40 });
		expect(pointer.paused).toBe(true);
		expect(pointer.position).toBeNull();
		expect(pointer.pointers).toEqual([]);
		expect(pointer.pressed).toBe(false);
		expect(subscription.active).toBe(true);
		expect(handler).toHaveBeenCalledTimes(1);

		pointer.resume();
		dispatchPointerEvent(target, "pointermove", { clientX: 50, clientY: 60 });
		expect(pointer.paused).toBe(false);
		expect(pointer.position?.x).toBe(50);
		expect(handler).toHaveBeenCalledTimes(2);
		pointer.close();
	});

	it("restores and reapplies touch-action across pause and resume", () => {
		const target = document.createElement("div");
		target.style.touchAction = "pan-y";
		const pointer = new Pointer(target, { touchAction: "none" });
		expect(target.style.touchAction).toBe("none");
		pointer.pause();
		expect(target.style.touchAction).toBe("pan-y");
		pointer.resume();
		expect(target.style.touchAction).toBe("none");
		pointer.close();
		expect(target.style.touchAction).toBe("pan-y");
	});

	it("tracks typed samples, coordinates, movement, and displacement", () => {
		const target = document.createElement("div");
		setRect(target, { left: 10, top: 20, width: 200, height: 100 });
		const pointer = new Pointer(target);
		const onDown = vi.fn<(sample: { x: number; localX: number }) => void>();
		const onMove =
			vi.fn<
				(sample: {
					deltaX: number;
					displacementX: number;
					distance: number;
				}) => void
			>();
		pointer.on("down", onDown);
		pointer.on("move", onMove);

		dispatchPointerEvent(target, "pointerdown", {
			clientX: 30,
			clientY: 40,
			pageX: 130,
			pageY: 240,
		});
		dispatchPointerEvent(target, "pointermove", {
			clientX: 45,
			clientY: 50,
			pageX: 145,
			pageY: 250,
			buttons: 1,
			pressure: 0.75,
		});

		expect(onDown).toHaveBeenCalledTimes(1);
		expect(onDown.mock.calls[0]![0]).toMatchObject({
			type: "down",
			x: 30,
			y: 40,
			pageX: 130,
			pageY: 240,
			localX: 20,
			localY: 20,
			ratioX: 0.1,
			ratioY: 0.2,
			pointerType: "mouse",
			pressed: true,
			pressure: 0.5,
		});
		expect(onMove.mock.calls[0]![0]).toMatchObject({
			deltaX: 15,
			deltaY: 10,
			displacementX: 15,
			displacementY: 10,
			distance: Math.hypot(15, 10),
			pressure: 0.75,
		});
		expect(pointer.position).toMatchObject({
			x: 45,
			y: 50,
			localX: 35,
			pressed: true,
		});
		expect(pointer.pressed).toBe(true);
		pointer.close();
	});

	it("tracks multiple pointer IDs when primaryOnly is disabled", () => {
		const target = document.createElement("div");
		const pointer = new Pointer(target, { primaryOnly: false });
		dispatchPointerEvent(target, "pointerenter", {
			pointerId: 1,
			pointerType: "mouse",
		});
		dispatchPointerEvent(target, "pointerenter", {
			pointerId: 2,
			pointerType: "pen",
			isPrimary: false,
		});
		expect(pointer.pointers).toHaveLength(2);
		expect(pointer.pointers.map(({ pointerType }) => pointerType)).toEqual([
			"mouse",
			"pen",
		]);
		pointer.close();
	});

	it("filters non-primary pointers and configured device kinds", () => {
		const target = document.createElement("div");
		const pointer = new Pointer(target, { types: ["pen"] });
		const handler = vi.fn<() => void>();
		pointer.on("move", handler);
		dispatchPointerEvent(target, "pointermove", { pointerType: "mouse" });
		dispatchPointerEvent(target, "pointermove", {
			pointerType: "pen",
			isPrimary: false,
		});
		expect(handler).not.toHaveBeenCalled();
		dispatchPointerEvent(target, "pointermove", { pointerType: "pen" });
		expect(handler).toHaveBeenCalledTimes(1);
		pointer.close();
	});

	it("clears state on leave and emits cancel and up events", () => {
		const target = document.createElement("div");
		const pointer = new Pointer(target);
		const up = vi.fn<() => void>();
		const cancel = vi.fn<() => void>();
		pointer.on("up", up);
		pointer.on("cancel", cancel);
		dispatchPointerEvent(target, "pointerdown", { buttons: 1 });
		expect(pointer.pressed).toBe(true);
		dispatchPointerEvent(target, "pointerup", { buttons: 0 });
		expect(up).toHaveBeenCalledTimes(1);
		expect(pointer.pressed).toBe(false);
		dispatchPointerEvent(target, "pointercancel", { buttons: 0 });
		expect(cancel).toHaveBeenCalledTimes(1);
		dispatchPointerEvent(target, "pointerleave", { buttons: 0 });
		expect(pointer.position).toBeNull();
		expect(pointer.pointers).toEqual([]);
		pointer.close();
	});

	it("supports once, cancellation, off, context cancellation, and listener counts", () => {
		const target = document.createElement("div");
		const pointer = new Pointer(target);
		const once = vi.fn<() => void>();
		const removed = vi.fn<() => void>();
		const subscription = pointer.on("move", once, { once: true });
		const activeSubscription = pointer.on("move", removed);
		const contextHandler = vi.fn<() => void>();
		pointer.on("move", (_sample, context) => {
			contextHandler();
			context.cancel();
		});
		expect(pointer.listenerCount()).toBe(3);
		dispatchPointerEvent(target, "pointermove");
		expect(once).toHaveBeenCalledTimes(1);
		expect(subscription.active).toBe(false);
		expect(removed).toHaveBeenCalledTimes(1);
		expect(contextHandler).toHaveBeenCalledTimes(1);
		expect(pointer.listenerCount("move")).toBe(1);
		activeSubscription.cancel();
		expect(pointer.listenerCount()).toBe(0);
		pointer.close();
	});

	it("cancels a subscription when its signal aborts", () => {
		const target = document.createElement("div");
		const pointer = new Pointer(target);
		const controller = new AbortController();
		const handler = vi.fn<() => void>();
		const subscription = pointer.on("move", handler, {
			signal: controller.signal,
		});
		controller.abort();
		dispatchPointerEvent(target, "pointermove");
		expect(subscription.active).toBe(false);
		expect(handler).not.toHaveBeenCalled();
		pointer.close();
	});

	it("returns inactive subscriptions for missing targets and aborted signals", () => {
		const inert = new Pointer(null);
		const inertSubscription = inert.on("move", vi.fn<() => void>());
		expect(inert.target).toBeNull();
		expect(inertSubscription.active).toBe(false);
		expect(inert.capture()).toBe(false);
		inert.close();

		const controller = new AbortController();
		controller.abort();
		const closed = new Pointer(document.createElement("div"), {
			signal: controller.signal,
		});
		expect(closed.closed).toBe(true);
		expect(closed.position).toBeNull();
	});

	it("closes on abort and restores touch-action", () => {
		const target = document.createElement("div");
		target.style.touchAction = "pan-y";
		const controller = new AbortController();
		const pointer = new Pointer(target, {
			signal: controller.signal,
			touchAction: "none",
		});
		const handler = vi.fn<() => void>();
		pointer.on("move", handler);
		expect(target.style.touchAction).toBe("none");
		controller.abort();
		expect(pointer.closed).toBe(true);
		expect(target.style.touchAction).toBe("pan-y");
		dispatchPointerEvent(target, "pointermove");
		expect(handler).not.toHaveBeenCalled();
	});

	it("supports manual capture APIs and automatic capture/release", () => {
		const target = document.createElement("div") as HTMLDivElement & {
			setPointerCapture: (id: number) => void;
			releasePointerCapture: (id: number) => void;
			hasPointerCapture: (id: number) => boolean;
		};
		const captures = new Set<number>();
		target.setPointerCapture = (id) => {
			captures.add(id);
		};
		target.releasePointerCapture = (id) => {
			captures.delete(id);
		};
		target.hasPointerCapture = (id) => captures.has(id);
		const pointer = new Pointer(target, { capture: true });
		dispatchPointerEvent(target, "pointerdown", { pointerId: 7, buttons: 1 });
		expect(pointer.hasCapture(7)).toBe(true);
		expect(pointer.release(7)).toBe(true);
		expect(pointer.hasCapture(7)).toBe(false);
		expect(pointer.capture(7)).toBe(true);
		dispatchPointerEvent(target, "pointerup", { pointerId: 7, buttons: 0 });
		expect(pointer.hasCapture(7)).toBe(true);
		dispatchPointerEvent(target, "lostpointercapture", {
			pointerId: 7,
			buttons: 0,
		});
		expect(pointer.hasCapture(7)).toBe(true);
		pointer.close();
	});

	it("measures proximity and finds the nearest candidate", () => {
		const target = document.createElement("div");
		setRect(target, { left: 0, top: 0, width: 100, height: 100 });
		const pointer = new Pointer(target);
		const candidate = document.createElement("div");
		setRect(candidate, { left: 50, top: 50, width: 20, height: 20 });
		dispatchPointerEvent(target, "pointermove", { clientX: 60, clientY: 60 });
		const proximity = pointer.proximity(candidate, { radius: 10 });
		expect(proximity).toMatchObject({
			distance: 0,
			edgeDistance: 0,
			inside: true,
			near: true,
			ratio: 1,
		});
		const farther = document.createElement("div");
		setRect(farther, { left: 100, top: 100, width: 10, height: 10 });
		expect(pointer.nearest([farther, candidate])?.element).toBe(candidate);
		expect(pointer.proximity(null)).toBeNull();
		pointer.close();
	});

	it("validates event names, handlers, options, and targets", () => {
		const target = document.createElement("div");
		const pointer = new Pointer(target);
		expect(() =>
			pointer.on("click" as never, vi.fn<() => void>()),
		).toThrowError(PointerError);
		expect(() => pointer.on("move", null as never)).toThrowError(PointerError);
		expect(() => new Pointer({} as Element)).toThrowError(PointerError);
		expect(() => pointer.proximity(target, { radius: -1 })).toThrowError(
			PointerError,
		);
		expect(() =>
			pointer.nearest([], { metric: "invalid" as never }),
		).toThrowError(PointerError);
		expect(() => PointerErrorCode.InvalidTarget).not.toThrowError();
		pointer.close();
		expect(() => pointer.on("move", vi.fn<() => void>())).toThrowError(
			PointerError,
		);
	});
});
