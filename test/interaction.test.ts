import { afterEach, describe, expect, it, vi } from "vitest";

import {
	Interaction,
	InteractionError,
	InteractionErrorCode,
} from "../src/interaction";

const createInvalidInteraction = () =>
	new Interaction(null as unknown as EventTarget);

const getError = (fn: () => void): unknown => {
	try {
		fn();
	} catch (error) {
		return error;
	}
	return undefined;
};

const pointerEvent = (
	type: string,
	properties: Partial<PointerEvent> = {},
): Event => {
	const event = new Event(type, { bubbles: true, cancelable: true });
	Object.assign(event, {
		isPrimary: true,
		pointerType: "mouse",
		pointerId: 1,
		button: 0,
		clientX: 0,
		clientY: 0,
		...properties,
	});
	return event;
};

afterEach(() => {
	vi.useRealTimers();
});

describe("Interaction", () => {
	it("registers and cancels native listeners", () => {
		const target = document.createElement("button");
		const interaction = new Interaction(target);
		let calls = 0;

		const subscription = interaction.on("click", () => {
			calls += 1;
		});

		target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		expect(calls).toBe(1);
		expect(subscription.active).toBe(true);

		subscription.cancel();
		target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		expect(calls).toBe(1);
		expect(subscription.active).toBe(false);

		interaction.close();
	});

	it("pauses dispatch without cancelling subscriptions and resumes them", () => {
		const target = document.createElement("button");
		const interaction = new Interaction(target);
		const handler = vi.fn<() => void>();
		const subscription = interaction.on("click", handler);

		interaction.pause();
		target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		expect(interaction.paused).toBe(true);
		expect(subscription.active).toBe(true);
		expect(handler).not.toHaveBeenCalled();

		interaction.resume();
		target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		expect(interaction.paused).toBe(false);
		expect(handler).toHaveBeenCalledTimes(1);
		interaction.close();
	});

	it("removes a listener after its first execution", () => {
		const target = document.createElement("button");
		const interaction = new Interaction(target);
		let calls = 0;

		const subscription = interaction.once("click", () => {
			calls += 1;
		});

		target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		expect(calls).toBe(1);
		expect(subscription.active).toBe(false);

		interaction.close();
	});

	it("removes listeners by event or handler", () => {
		const target = document.createElement("button");
		const interaction = new Interaction(target);
		let calls = 0;

		const firstHandler = () => {
			calls += 1;
		};
		const secondHandler = () => {
			calls += 1;
		};

		interaction.on("click", firstHandler);
		interaction.on("click", secondHandler);
		interaction.off("click", firstHandler);
		target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		expect(calls).toBe(1);

		interaction.off("click");
		target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		expect(calls).toBe(1);

		interaction.close();
	});

	it("allows a handler to cancel itself", () => {
		const target = document.createElement("button");
		const interaction = new Interaction(target);
		let calls = 0;

		interaction.on("click", (_event, ctx) => {
			calls += 1;
			ctx.cancel();
		});

		target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		expect(calls).toBe(1);

		interaction.close();
	});

	it("delegates events to matching descendants", () => {
		const list = document.createElement("ul");
		const button = document.createElement("button");
		const other = document.createElement("span");
		button.className = "action";
		list.append(button, other);

		const interaction = new Interaction(list);
		let calls = 0;
		let matched: Element | undefined;

		interaction.on(
			"click",
			(_event, ctx) => {
				calls += 1;
				matched = ctx.element;
			},
			{ delegate: ".action" },
		);

		button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		expect(calls).toBe(1);
		expect(matched).toBe(button);

		other.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		expect(calls).toBe(1);

		interaction.close();
	});

	it("rejects invalid delegation selectors", () => {
		const interaction = new Interaction(document.createElement("div"));
		const emptyError = getError(() =>
			interaction.on("click", () => {}, { delegate: "" }),
		);
		const syntaxError = getError(() =>
			interaction.on("click", () => {}, { delegate: "[" }),
		);

		expect(emptyError).toBeInstanceOf(InteractionError);
		expect(emptyError).toMatchObject({
			code: InteractionErrorCode.InvalidSelector,
		});
		expect(syntaxError).toBeInstanceOf(InteractionError);
		expect(syntaxError).toMatchObject({
			code: InteractionErrorCode.InvalidSelector,
		});

		interaction.close();
	});

	it("dispatches typed custom events and supports bubbling", () => {
		type CustomEvents = {
			"app:ready": { id: string };
		};

		const parent = document.createElement("section");
		const target = document.createElement("div");
		parent.append(target);

		const interaction = new Interaction<CustomEvents, HTMLDivElement>(target);
		const parentHandler = vi.fn<() => void>();
		let received: CustomEvents["app:ready"] | undefined;

		interaction.on("app:ready", (event) => {
			received = event.detail;
		});
		parent.addEventListener("app:ready", parentHandler);

		expect(
			interaction.emit("app:ready", { id: "main" }, { bubbles: true }),
		).toBe(true);
		expect(received).toEqual({ id: "main" });
		expect(parentHandler).toHaveBeenCalledOnce();

		interaction.close();
	});

	it("rejects reserved event names when emitting", () => {
		const interaction = new Interaction(document.createElement("div"));
		const emitReserved = (name: string) =>
			(
				interaction as unknown as {
					emit(name: string): boolean;
				}
			).emit(name);

		const error = getError(() => emitReserved("click"));
		expect(error).toBeInstanceOf(InteractionError);
		expect(error).toMatchObject({
			code: InteractionErrorCode.InvalidEvent,
		});

		interaction.close();
	});

	it("supports document targets", () => {
		const interaction = new Interaction(document);
		let element: Element | Document | undefined;

		interaction.on("click", (_event, ctx) => {
			element = ctx.element;
		});

		document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		expect(element).toBe(document);

		interaction.close();
	});

	it("emits hover events and ignores touch pointers by default", () => {
		const target = document.createElement("div");
		const interaction = new Interaction(target);
		const handler = vi.fn<() => void>();

		interaction.on("hover", handler);

		target.dispatchEvent(pointerEvent("pointerenter"));
		expect(handler).toHaveBeenCalledOnce();
		expect(handler).toHaveBeenLastCalledWith(
			expect.objectContaining({ type: "hover", hovering: true }),
			expect.objectContaining({ element: target }),
		);

		target.dispatchEvent(pointerEvent("pointerleave"));
		expect(handler).toHaveBeenCalledTimes(2);
		expect(handler).toHaveBeenLastCalledWith(
			expect.objectContaining({ hovering: false }),
			expect.anything(),
		);

		target.dispatchEvent(
			pointerEvent("pointerenter", { pointerType: "touch" }),
		);
		expect(handler).toHaveBeenCalledTimes(2);

		interaction.close();
	});

	it("emits hover events for touch pointers when enabled", () => {
		const target = document.createElement("div");
		const interaction = new Interaction(target);
		const handler = vi.fn<() => void>();

		interaction.on("hover", handler, { touch: true });
		target.dispatchEvent(
			pointerEvent("pointerenter", { pointerType: "touch" }),
		);
		expect(handler).toHaveBeenCalledOnce();

		interaction.close();
	});

	it("emits long-press after the configured delay", () => {
		vi.useFakeTimers();
		const target = document.createElement("div");
		const interaction = new Interaction(target);
		const handler = vi.fn<() => void>();

		interaction.on("long-press", handler, { delay: 500, tolerance: 10 });
		target.dispatchEvent(
			pointerEvent("pointerdown", { clientX: 20, clientY: 30 }),
		);

		vi.advanceTimersByTime(499);
		expect(handler).not.toHaveBeenCalled();

		vi.advanceTimersByTime(1);
		expect(handler).toHaveBeenCalledOnce();
		expect(handler).toHaveBeenLastCalledWith(
			expect.objectContaining({
				type: "long-press",
				duration: 500,
				x: 20,
				y: 30,
			}),
			expect.objectContaining({ element: target }),
		);

		target.dispatchEvent(
			pointerEvent("pointerup", { clientX: 20, clientY: 30 }),
		);
		interaction.close();
	});

	it("cancels gesture timers while paused and restarts the gesture on resume", () => {
		vi.useFakeTimers();
		const target = document.createElement("div");
		const interaction = new Interaction(target);
		const handler = vi.fn<() => void>();
		const subscription = interaction.on("long-press", handler, { delay: 100 });

		target.dispatchEvent(pointerEvent("pointerdown"));
		vi.advanceTimersByTime(50);
		interaction.pause();
		vi.advanceTimersByTime(500);
		expect(handler).not.toHaveBeenCalled();
		expect(subscription.active).toBe(true);

		interaction.resume();
		target.dispatchEvent(pointerEvent("pointerdown"));
		vi.advanceTimersByTime(100);
		expect(handler).toHaveBeenCalledOnce();
		interaction.close();
	});

	it("cancels long-press when the pointer moves beyond the tolerance", () => {
		vi.useFakeTimers();
		const target = document.createElement("div");
		const interaction = new Interaction(target);
		const handler = vi.fn<() => void>();

		interaction.on("long-press", handler, { delay: 500, tolerance: 10 });
		target.dispatchEvent(
			pointerEvent("pointerdown", { clientX: 20, clientY: 30 }),
		);
		vi.advanceTimersByTime(100);
		target.dispatchEvent(
			pointerEvent("pointermove", { clientX: 100, clientY: 100 }),
		);
		vi.advanceTimersByTime(500);

		expect(handler).not.toHaveBeenCalled();
		interaction.close();
	});

	it("suppresses the click that follows a long press", () => {
		vi.useFakeTimers();
		const target = document.createElement("div");
		const interaction = new Interaction(target);

		interaction.on("long-press", () => {}, { delay: 500 });
		target.dispatchEvent(pointerEvent("pointerdown"));
		vi.advanceTimersByTime(500);
		target.dispatchEvent(pointerEvent("pointerup"));

		const click = new MouseEvent("click", { bubbles: true, cancelable: true });
		target.dispatchEvent(click);
		expect(click.defaultPrevented).toBe(true);

		interaction.close();
	});

	it("emits outside-click for pointerdown outside the target", () => {
		const target = document.createElement("div");
		document.body.append(target);

		const interaction = new Interaction(target);
		const handler = vi.fn<() => void>();

		interaction.on("outside-click", handler);
		target.dispatchEvent(pointerEvent("pointerdown"));
		expect(handler).not.toHaveBeenCalled();

		document.body.dispatchEvent(pointerEvent("pointerdown"));
		expect(handler).toHaveBeenCalledOnce();
		expect(handler).toHaveBeenLastCalledWith(
			expect.objectContaining({ type: "outside-click" }),
			expect.objectContaining({ element: target }),
		);

		interaction.close();
	});

	it("rejects outside-click for non-Node targets", () => {
		const interaction = new Interaction(new EventTarget());
		const error = getError(() => interaction.on("outside-click", () => {}));

		expect(error).toBeInstanceOf(InteractionError);
		expect(error).toMatchObject({
			code: InteractionErrorCode.UnsupportedTarget,
		});

		interaction.close();
	});

	it("returns an inactive subscription when its signal is already aborted", () => {
		const target = document.createElement("button");
		const interaction = new Interaction(target);
		const controller = new AbortController();
		const handler = vi.fn<() => void>();

		controller.abort();
		const subscription = interaction.on("click", handler, {
			signal: controller.signal,
		});
		target.dispatchEvent(new MouseEvent("click", { bubbles: true }));

		expect(subscription.active).toBe(false);
		expect(handler).not.toHaveBeenCalled();
		expect(interaction.closed).toBe(false);

		interaction.close();
	});

	it("cancels listeners when their abort signal fires", () => {
		const target = document.createElement("button");
		const interaction = new Interaction(target);
		const controller = new AbortController();
		const handler = vi.fn<() => void>();

		const subscription = interaction.on("click", handler, {
			signal: controller.signal,
		});
		controller.abort();
		target.dispatchEvent(new MouseEvent("click", { bubbles: true }));

		expect(subscription.active).toBe(false);
		expect(handler).not.toHaveBeenCalled();
		expect(interaction.closed).toBe(false);

		interaction.close();
	});

	it("closes when the constructor signal fires", () => {
		const target = document.createElement("button");
		const controller = new AbortController();
		const interaction = new Interaction(target, {
			signal: controller.signal,
		});
		const handler = vi.fn<() => void>();

		interaction.on("click", handler);
		controller.abort();
		target.dispatchEvent(new MouseEvent("click", { bubbles: true }));

		expect(handler).not.toHaveBeenCalled();
		expect(interaction.closed).toBe(true);

		const error = getError(() => interaction.on("click", () => {}));
		expect(error).toBeInstanceOf(InteractionError);
		expect(error).toMatchObject({ code: InteractionErrorCode.Closed });
	});

	it("closes all listeners and rejects new registrations", () => {
		const target = document.createElement("button");
		const interaction = new Interaction(target);
		const handler = vi.fn<() => void>();

		interaction.on("click", handler);
		interaction.close();
		interaction.close();
		target.dispatchEvent(new MouseEvent("click", { bubbles: true }));

		expect(handler).not.toHaveBeenCalled();
		expect(interaction.closed).toBe(true);

		const error = getError(() => interaction.on("click", () => {}));
		expect(error).toBeInstanceOf(InteractionError);
		expect(error).toMatchObject({ code: InteractionErrorCode.Closed });
	});

	it("rejects invalid targets", () => {
		const error = getError(createInvalidInteraction);

		expect(createInvalidInteraction).toThrowError(InteractionError);
		expect(error).toBeInstanceOf(InteractionError);
		expect(error).toMatchObject({
			code: InteractionErrorCode.InvalidTarget,
		});
	});

	it("rejects invalid handlers", () => {
		const interaction = new Interaction(document.createElement("div"));
		const error = getError(() =>
			interaction.on("click", null as unknown as () => void),
		);

		expect(error).toBeInstanceOf(InteractionError);
		expect(error).toMatchObject({
			code: InteractionErrorCode.InvalidHandler,
		});

		interaction.close();
	});

	it("rejects raw native event names", () => {
		const interaction = new Interaction(document.createElement("div"));
		const registerRawEvent = (name: string) =>
			(
				interaction as unknown as {
					on(name: string, handler: () => void): unknown;
				}
			).on(name, () => {});

		const error = getError(() => registerRawEvent("dblclick"));
		expect(error).toBeInstanceOf(InteractionError);
		expect(error).toMatchObject({
			code: InteractionErrorCode.InvalidEvent,
		});

		interaction.close();
	});
});
