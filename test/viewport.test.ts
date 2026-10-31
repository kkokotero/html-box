import { afterEach, describe, expect, it, vi } from "vitest";

import { Viewport, ViewportError, ViewportErrorCode } from "../src/viewport";
import type { ViewportHandler } from "../src/viewport";

function setRect(element: Element, rect: Partial<DOMRect>): void {
	vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
		x: rect.x ?? rect.left ?? 0,
		y: rect.y ?? rect.top ?? 0,
		left: rect.left ?? 0,
		top: rect.top ?? 0,
		right: rect.right ?? (rect.left ?? 0) + (rect.width ?? 100),
		bottom: rect.bottom ?? (rect.top ?? 0) + (rect.height ?? 50),
		width: rect.width ?? 100,
		height: rect.height ?? 50,
		toJSON: () => ({}),
	} as DOMRect);
}

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("Viewport", () => {
	it("reads live geometry and exposes a combined snapshot", () => {
		const element = document.createElement("div");
		setRect(element, { left: 12, top: 24, width: 80, height: 40 });
		const viewport = new Viewport(element);

		expect(viewport.element).toBe(element);
		expect(viewport.closed).toBe(false);
		expect(viewport.size).toEqual({ width: 80, height: 40 });
		expect(viewport.position).toMatchObject({
			x: 12,
			y: 24,
			left: 12,
			top: 24,
			right: 92,
			bottom: 64,
		});
		expect(viewport.snapshot()).toMatchObject({
			size: { width: 80, height: 40 },
			position: { x: 12, y: 24 },
			visible: true,
			ratio: 1,
		});
		viewport.close();
	});

	it("creates an inert instance for a null target", () => {
		const viewport = new Viewport(null);
		expect(viewport.size).toEqual({ width: 0, height: 0 });
		expect(viewport.position).toMatchObject({ x: 0, y: 0, pageX: 0, pageY: 0 });
		expect(viewport.visible).toBe(false);
		expect(viewport.on("move", vi.fn()).active).toBe(false);
		viewport.close();
	});

	it("validates targets and visibility options", () => {
		expect(() => new Viewport({} as Element)).toThrowError(
			expect.objectContaining({ code: ViewportErrorCode.InvalidTarget }),
		);
		expect(
			() => new Viewport(document.createElement("div"), { threshold: 2 }),
		).toThrowError(
			expect.objectContaining({ code: ViewportErrorCode.InvalidOption }),
		);
	});

	it("reports position changes on explicit updates", () => {
		const element = document.createElement("div");
		setRect(element, { left: 10, top: 10 });
		const viewport = new Viewport(element);
		const handler = vi.fn<ViewportHandler<"move">>();
		viewport.on("move", handler);
		(element.getBoundingClientRect as ReturnType<typeof vi.fn>).mockReturnValue(
			{
				x: 25,
				y: 35,
				left: 25,
				top: 35,
				right: 125,
				bottom: 85,
				width: 100,
				height: 50,
				toJSON: () => ({}),
			} as DOMRect,
		);

		viewport.update();
		expect(handler).toHaveBeenCalledWith(
			expect.objectContaining({
				type: "move",
				deltaX: 15,
				deltaY: 25,
				cause: "update",
			}),
			expect.any(Object),
		);
		viewport.close();
	});

	it("pauses observers and change events while retaining subscriptions", () => {
		const element = document.createElement("div");
		setRect(element, { left: 0, top: 0 });
		const viewport = new Viewport(element);
		const handler = vi.fn<ViewportHandler<"move">>();
		const subscription = viewport.on("move", handler);

		viewport.pause();
		setRect(element, { left: 10, top: 0 });
		viewport.update();
		expect(viewport.paused).toBe(true);
		expect(subscription.active).toBe(true);
		expect(handler).not.toHaveBeenCalled();

		viewport.resume();
		setRect(element, { left: 20, top: 0 });
		viewport.update();
		expect(viewport.paused).toBe(false);
		expect(handler).toHaveBeenCalledTimes(1);
		viewport.close();
	});

	it("reports resize changes and supports one-shot subscriptions", () => {
		const element = document.createElement("div");
		setRect(element, { width: 100, height: 50 });
		const viewport = new Viewport(element);
		const handler = vi.fn<ViewportHandler<"resize">>();
		const subscription = viewport.once("resize", handler);
		(element.getBoundingClientRect as ReturnType<typeof vi.fn>).mockReturnValue(
			{
				x: 0,
				y: 0,
				left: 0,
				top: 0,
				right: 120,
				bottom: 60,
				width: 120,
				height: 60,
				toJSON: () => ({}),
			} as DOMRect,
		);

		viewport.update();
		viewport.update();
		expect(handler).toHaveBeenCalledTimes(1);
		expect(subscription.active).toBe(false);
		viewport.close();
	});

	it("supports cancellation, listener counts, and close semantics", () => {
		const viewport = new Viewport(document.createElement("div"));
		const handler = vi.fn<ViewportHandler<"move">>();
		const subscription = viewport.on("move", handler);
		expect(viewport.listenerCount()).toBe(1);
		expect(viewport.listenerCount("move")).toBe(1);
		viewport.off("move", handler);
		expect(subscription.active).toBe(false);
		expect(viewport.listenerCount()).toBe(0);

		viewport.close();
		viewport.close();
		expect(viewport.closed).toBe(true);
		expect(() => viewport.update()).toThrowError(
			expect.objectContaining({ code: ViewportErrorCode.Closed }),
		);
	});

	it("closes when its abort signal fires", () => {
		const controller = new AbortController();
		const viewport = new Viewport(document.createElement("div"), {
			signal: controller.signal,
		});
		controller.abort();
		expect(viewport.closed).toBe(true);
	});

	it("emits visibility transitions from IntersectionObserver", () => {
		type ObserverCallback = ConstructorParameters<
			typeof IntersectionObserver
		>[0];
		let callback: ObserverCallback | undefined;
		class MockIntersectionObserver {
			constructor(cb: ObserverCallback) {
				callback = cb;
			}
			observe(): void {}
			disconnect(): void {}
			unobserve(): void {}
			takeRecords(): IntersectionObserverEntry[] {
				return [];
			}
			readonly root = null;
			readonly rootMargin = "0px";
			readonly thresholds = [0];
		}
		vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
		const element = document.createElement("div");
		setRect(element, { left: 0, top: 0, width: 100, height: 50 });
		const viewport = new Viewport(element);
		const enter = vi.fn<ViewportHandler<"enter">>();
		viewport.on("enter", enter);
		const entry = {
			target: element,
			isIntersecting: true,
			intersectionRatio: 0.75,
			boundingClientRect: element.getBoundingClientRect(),
			intersectionRect: element.getBoundingClientRect(),
			rootBounds: {
				left: 0,
				top: 0,
				right: 100,
				bottom: 100,
				width: 100,
				height: 100,
			} as DOMRectReadOnly,
			time: 0,
		} as IntersectionObserverEntry;

		callback?.([entry], {} as IntersectionObserver);
		expect(enter).toHaveBeenCalledWith(
			expect.objectContaining({ type: "enter", ratio: 0.75 }),
			expect.any(Object),
		);
		expect(viewport.visible).toBe(true);
		viewport.close();
	});

	it("throws the exported error class with its stable code", () => {
		const error = new ViewportError(
			ViewportErrorCode.InvalidEvent,
			"Unsupported event",
		);
		expect(error).toBeInstanceOf(Error);
		expect(error.name).toBe("ViewportError");
		expect(error.code).toBe("INVALID_EVENT");
	});
});
