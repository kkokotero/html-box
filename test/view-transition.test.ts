import { afterEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

import {
	ReducedMotion,
	TransitionScope,
	ViewTransition,
	ViewTransitionError,
	ViewTransitionErrorCode,
} from "../src/view-transition";
import type {
	NativeViewTransition,
	UpdateCallback,
	ViewTransitionTypes,
} from "../src/view-transition";

/** Waits for pending promise callbacks to run. */
const tick = (): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Creates a controllable native transition mock.
 *
 * By default the update callback, `ready`, and `finished` resolve on the next
 * microtask. Individual promises can be overridden to exercise failures.
 */
function createNativeTransition(
	update: UpdateCallback = () => undefined,
	overrides: Partial<NativeViewTransition> = {},
): NativeViewTransition {
	const updateCallbackDone =
		overrides.updateCallbackDone ??
		Promise.resolve()
			.then(() => update())
			.then(() => undefined);

	return {
		updateCallbackDone,
		ready: overrides.ready ?? Promise.resolve(),
		finished: overrides.finished ?? updateCallbackDone.then(() => undefined),
		...(overrides.types === undefined ? {} : { types: overrides.types }),
		skipTransition: overrides.skipTransition ?? vi.fn<() => void>(),
	};
}

/** Extracts the update callback from either supported start signature. */
function updateFrom(argument: unknown): UpdateCallback {
	if (typeof argument === "function") return argument as UpdateCallback;
	return (argument as { update: UpdateCallback }).update;
}

/** Defines an own property that can be removed after the test. */
function install(target: object, key: string, value: unknown): void {
	Object.defineProperty(target, key, {
		configurable: true,
		writable: true,
		value,
	});
}

/** Installs a document-scoped transition starter. */
function installDocumentTransition(
	start: (argument?: unknown) => NativeViewTransition,
): Mock<(argument?: unknown) => NativeViewTransition> {
	const mock = vi.fn<(argument?: unknown) => NativeViewTransition>(start);
	install(document, "startViewTransition", mock);
	return mock;
}

/** Installs an element-scoped transition starter on the prototype. */
function installElementTransition(
	start: (argument?: unknown) => NativeViewTransition,
): Mock<(argument?: unknown) => NativeViewTransition> {
	const mock = vi.fn<(argument?: unknown) => NativeViewTransition>(start);
	install(Element.prototype, "startViewTransition", mock);
	return mock;
}

/** Enables native transition types in the fake browser. */
function enableTypes(types: ViewTransitionTypes = new Set()): void {
	vi.stubGlobal("ViewTransition", { prototype: { types } });
}

/** Overrides `matchMedia` for reduced-motion checks. */
function setReducedMotion(matches: boolean): void {
	vi.stubGlobal(
		"matchMedia",
		vi.fn<(media: string) => { matches: boolean; media: string }>((media) => ({
			matches,
			media,
		})),
	);
}

afterEach(() => {
	Reflect.deleteProperty(document, "startViewTransition");
	Reflect.deleteProperty(document, "activeViewTransition");
	Reflect.deleteProperty(Element.prototype, "startViewTransition");
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("ViewTransition", () => {
	it("runs the update without animation when the API is unavailable", async () => {
		const order: string[] = [];
		const update = vi.fn<() => void>(() => {
			order.push("update");
		});
		const onStart = vi.fn<() => void>(() => order.push("start"));
		const onReady = vi.fn<() => void>(() => order.push("ready"));
		const onFinish = vi.fn<() => void>(() => order.push("finish"));
		const onError = vi.fn<(error: unknown) => void>();

		const transition = ViewTransition.start(update, {
			types: ["navigation", "navigation"],
			onStart,
			onReady,
			onFinish,
			onError,
		});

		expect(onStart).toHaveBeenCalledOnce();
		expect(order).toEqual(["start"]);
		expect(ViewTransition.supported()).toBe(false);
		expect(ViewTransition.current()).toBe(transition);
		expect(transition.types).toEqual(new Set(["navigation"]));
		expect(update).not.toHaveBeenCalled();

		await expect(transition.ready).rejects.toMatchObject({
			name: "AbortError",
		});
		await expect(transition.updateCallbackDone).resolves.toBeUndefined();
		await expect(transition.finished).resolves.toBeUndefined();

		expect(update).toHaveBeenCalledOnce();
		expect(onError).not.toHaveBeenCalled();
		expect(onReady).not.toHaveBeenCalled();
		expect(onFinish).toHaveBeenCalledOnce();
		expect(order).toEqual(["start", "update", "finish"]);
		expect(ViewTransition.current()).toBeNull();
	});

	it("starts a native document transition and wires lifecycle callbacks", async () => {
		const start = installDocumentTransition((argument) =>
			createNativeTransition(updateFrom(argument)),
		);
		const order: string[] = [];
		const onStart = vi.fn<() => void>(() => order.push("start"));
		const onReady = vi.fn<() => void>(() => order.push("ready"));
		const onFinish = vi.fn<() => void>(() => order.push("finish"));

		const transition = ViewTransition.start(
			() => {
				order.push("update");
			},
			{ onStart, onReady, onFinish },
		);

		expect(start).toHaveBeenCalledOnce();
		expect(start.mock.calls[0]?.[0]).toBeTypeOf("function");
		expect(order).toEqual(["start"]);
		expect(ViewTransition.supported()).toBe(true);
		expect(ViewTransition.supported(TransitionScope.Document)).toBe(true);
		expect(ViewTransition.current()).toBe(transition);

		await tick();

		expect(order[0]).toBe("start");
		expect(order).toContain("update");
		expect(order).toContain("ready");
		expect(order.at(-1)).toBe("finish");
		expect(onReady).toHaveBeenCalledOnce();
		expect(onFinish).toHaveBeenCalledOnce();
		expect(ViewTransition.current()).toBeNull();
	});

	it("passes deduplicated types only when the browser supports them", async () => {
		enableTypes();
		const start = installDocumentTransition((argument) =>
			createNativeTransition(updateFrom(argument)),
		);

		ViewTransition.start(() => undefined, {
			types: ["navigation", "modal", "navigation"],
		});

		expect(start).toHaveBeenCalledExactlyOnceWith({
			update: expect.any(Function),
			types: ["navigation", "modal"],
		});
		await tick();

		vi.unstubAllGlobals();
		start.mockClear();

		const update = vi.fn<() => void>();
		ViewTransition.start(update, {
			types: ["navigation", "modal", "navigation"],
		});

		expect(start).toHaveBeenCalledExactlyOnceWith(update);
		await tick();
	});

	it("uses the callback signature when transition types are unsupported", async () => {
		const start = installDocumentTransition((argument) =>
			createNativeTransition(updateFrom(argument)),
		);
		const update = vi.fn<() => void>();

		ViewTransition.start(update, { types: ["modal"] });

		expect(start).toHaveBeenCalledExactlyOnceWith(update);
		await tick();
	});

	it("supports element-scoped transitions independently", async () => {
		const start = installElementTransition((argument) =>
			createNativeTransition(updateFrom(argument)),
		);
		const element = document.createElement("div");

		expect(ViewTransition.supported()).toBe(false);
		expect(ViewTransition.supported("element")).toBe(true);
		expect(ViewTransition.supported(TransitionScope.Element)).toBe(true);
		expect(ViewTransition.supported(element)).toBe(true);

		const transition = ViewTransition.start(element, () => undefined);

		expect(start).toHaveBeenCalledOnce();
		expect(ViewTransition.current(element)).toBe(transition);
		expect(ViewTransition.current()).toBeNull();

		await tick();
		expect(ViewTransition.current(element)).toBeNull();
	});

	it("does not switch to document scope when element scope is unsupported", async () => {
		const documentStart = installDocumentTransition((argument) =>
			createNativeTransition(updateFrom(argument)),
		);
		const element = document.createElement("div");

		const transition = ViewTransition.start(element, () => undefined);

		expect(documentStart).not.toHaveBeenCalled();
		expect(ViewTransition.supported(element)).toBe(false);
		expect(ViewTransition.current(element)).toBe(transition);
		await expect(transition.ready).rejects.toMatchObject({
			name: "AbortError",
		});
		await expect(transition.finished).resolves.toBeUndefined();
		expect(ViewTransition.current(element)).toBeNull();
	});

	it("respects reduced motion unless explicitly ignored", async () => {
		const start = installDocumentTransition((argument) =>
			createNativeTransition(updateFrom(argument)),
		);
		setReducedMotion(true);

		const respected = ViewTransition.start(() => undefined);

		expect(start).not.toHaveBeenCalled();
		await expect(respected.finished).resolves.toBeUndefined();

		const ignored = ViewTransition.start(() => undefined, {
			reducedMotion: ReducedMotion.Ignore,
		});

		expect(start).toHaveBeenCalledOnce();
		await expect(ignored.finished).resolves.toBeUndefined();
	});

	it("skips the active native transition", async () => {
		const skipTransition = vi.fn<() => void>();
		installDocumentTransition((argument) =>
			createNativeTransition(updateFrom(argument), { skipTransition }),
		);

		expect(ViewTransition.skip()).toBe(false);

		const transition = ViewTransition.start(() => undefined);

		expect(ViewTransition.skip()).toBe(true);
		expect(skipTransition).toHaveBeenCalledOnce();
		await expect(transition.finished).resolves.toBeUndefined();
		expect(ViewTransition.skip()).toBe(false);
	});

	it("uses the first type as the CSS name and restores the previous value", async () => {
		const start = installDocumentTransition((argument) =>
			createNativeTransition(updateFrom(argument)),
		);
		const root = document.documentElement;
		root.style.setProperty("view-transition-name", "previous");

		const first = ViewTransition.start(() => undefined, {
			types: ["navigation", "modal"],
		});

		expect(start).toHaveBeenCalledOnce();
		expect(root.style.getPropertyValue("view-transition-name")).toBe(
			"navigation",
		);
		await expect(first.finished).resolves.toBeUndefined();
		expect(root.style.getPropertyValue("view-transition-name")).toBe(
			"previous",
		);

		const second = ViewTransition.start(() => undefined, {
			types: ["navigation"],
			name: "page",
		});

		expect(root.style.getPropertyValue("view-transition-name")).toBe("page");
		await expect(second.finished).resolves.toBeUndefined();
		expect(root.style.getPropertyValue("view-transition-name")).toBe(
			"previous",
		);

		const third = ViewTransition.start(() => undefined, {
			types: ["navigation"],
			name: null,
		});

		expect(root.style.getPropertyValue("view-transition-name")).toBe(
			"previous",
		);
		await expect(third.finished).resolves.toBeUndefined();
		root.style.removeProperty("view-transition-name");
	});

	it("applies the type name to from and to across the update", async () => {
		let resolveFinished!: () => void;
		const finished = new Promise<void>((resolve) => {
			resolveFinished = resolve;
		});
		installDocumentTransition((argument) =>
			createNativeTransition(updateFrom(argument), { finished }),
		);
		const from = document.createElement("div");
		const to = document.createElement("div");
		document.body.append(from);
		from.style.setProperty("view-transition-name", "from-before");
		to.style.setProperty("view-transition-name", "to-before");
		const update = vi.fn<() => void>(() => {
			document.body.append(to);
		});

		const transition = ViewTransition.start(from, to, update, {
			types: ["card"],
		});

		expect(from.style.getPropertyValue("view-transition-name")).toBe("card");
		expect(to.style.getPropertyValue("view-transition-name")).toBe("to-before");
		expect(update).not.toHaveBeenCalled();

		await tick();

		expect(update).toHaveBeenCalledOnce();
		expect(to.isConnected).toBe(true);
		expect(from.style.getPropertyValue("view-transition-name")).toBe(
			"from-before",
		);
		expect(to.style.getPropertyValue("view-transition-name")).toBe("card");

		resolveFinished();
		await expect(transition.finished).resolves.toBeUndefined();
		expect(to.style.getPropertyValue("view-transition-name")).toBe("to-before");
	});

	it("supports the same element for from and to", async () => {
		installDocumentTransition((argument) =>
			createNativeTransition(updateFrom(argument)),
		);
		const element = document.createElement("div");
		element.style.setProperty("view-transition-name", "before");

		const transition = ViewTransition.start(element, element, () => undefined, {
			types: ["card"],
		});

		expect(element.style.getPropertyValue("view-transition-name")).toBe("card");
		await expect(transition.finished).resolves.toBeUndefined();
		expect(element.style.getPropertyValue("view-transition-name")).toBe(
			"before",
		);
		element.style.removeProperty("view-transition-name");
	});

	it("leaves pair names alone when no animation runs", async () => {
		const from = document.createElement("div");
		const to = document.createElement("div");
		from.style.setProperty("view-transition-name", "from-before");
		to.style.setProperty("view-transition-name", "to-before");

		const transition = ViewTransition.start(from, to, () => undefined, {
			types: ["card"],
		});

		expect(from.style.getPropertyValue("view-transition-name")).toBe(
			"from-before",
		);
		expect(to.style.getPropertyValue("view-transition-name")).toBe("to-before");
		await expect(transition.finished).resolves.toBeUndefined();
		expect(from.style.getPropertyValue("view-transition-name")).toBe(
			"from-before",
		);
		expect(to.style.getPropertyValue("view-transition-name")).toBe("to-before");
	});

	it("applies the type name to an element-scoped host", async () => {
		installElementTransition((argument) =>
			createNativeTransition(updateFrom(argument)),
		);
		const element = document.createElement("div");
		element.style.setProperty("view-transition-name", "before");

		const transition = ViewTransition.start(element, () => undefined, {
			types: ["card"],
		});

		expect(element.style.getPropertyValue("view-transition-name")).toBe("card");
		await expect(transition.finished).resolves.toBeUndefined();
		expect(element.style.getPropertyValue("view-transition-name")).toBe(
			"before",
		);
		element.style.removeProperty("view-transition-name");
	});

	it("keeps author CSS names when no animation runs", async () => {
		const root = document.documentElement;
		root.style.setProperty("view-transition-name", "author");

		const transition = ViewTransition.start(() => undefined, {
			types: ["navigation"],
		});

		expect(root.style.getPropertyValue("view-transition-name")).toBe("author");
		expect(
			document.getElementById("html-box-view-transition-interactive"),
		).toBeNull();
		await expect(transition.finished).resolves.toBeUndefined();
		expect(root.style.getPropertyValue("view-transition-name")).toBe("author");
		root.style.removeProperty("view-transition-name");
	});

	it("restores the CSS name when the browser fails to start", async () => {
		const error = new Error("cannot start");
		install(document, "startViewTransition", () => {
			throw error;
		});
		const root = document.documentElement;
		root.style.setProperty("view-transition-name", "author");
		const onError = vi.fn<(value: unknown) => void>();

		const transition = ViewTransition.start(() => undefined, {
			types: ["navigation"],
			onError,
		});

		expect(root.style.getPropertyValue("view-transition-name")).toBe("author");
		await expect(transition.finished).resolves.toBeUndefined();
		expect(onError).toHaveBeenCalledExactlyOnceWith(error);
		root.style.removeProperty("view-transition-name");
	});

	it("injects interaction styles by default and can opt out", async () => {
		installDocumentTransition((argument) =>
			createNativeTransition(updateFrom(argument)),
		);
		const selector = "#html-box-view-transition-interactive";

		const first = ViewTransition.start(() => undefined);

		expect(document.querySelector(selector)?.textContent).toContain(
			"::view-transition { pointer-events: none; }",
		);
		await expect(first.finished).resolves.toBeUndefined();

		const second = ViewTransition.start(() => undefined);

		expect(document.querySelectorAll(selector)).toHaveLength(1);
		await expect(second.finished).resolves.toBeUndefined();

		document.querySelector(selector)?.remove();
		const third = ViewTransition.start(() => undefined, {
			interactive: false,
		});

		expect(document.querySelector(selector)).toBeNull();
		await expect(third.finished).resolves.toBeUndefined();
	});

	it("prefers the native activeViewTransition property", () => {
		const native = createNativeTransition();
		install(document, "activeViewTransition", native);

		expect(ViewTransition.current()).toBe(native);
	});

	it("reports update errors once and clears the active transition", async () => {
		installDocumentTransition((argument) =>
			createNativeTransition(updateFrom(argument)),
		);
		const error = new Error("render failed");
		const onError = vi.fn<(error: unknown) => void>();

		const transition = ViewTransition.start(() => Promise.reject(error), {
			onError,
		});

		await expect(transition.updateCallbackDone).rejects.toBe(error);
		await expect(transition.finished).rejects.toBe(error);

		expect(onError).toHaveBeenCalledExactlyOnceWith(error);
		expect(ViewTransition.current()).toBeNull();
	});

	it("reports update errors as uncaught when no handler is provided", async () => {
		installDocumentTransition((argument) =>
			createNativeTransition(updateFrom(argument)),
		);
		const reportError = vi.fn<(error: unknown) => void>();
		vi.stubGlobal("reportError", reportError);
		const error = new Error("render failed");

		const transition = ViewTransition.start(() => {
			throw error;
		});

		await expect(transition.finished).rejects.toBe(error);
		expect(reportError).toHaveBeenCalledExactlyOnceWith(error);
	});

	it("reports unexpected ready failures but ignores aborts", async () => {
		const start = installDocumentTransition((argument) =>
			createNativeTransition(updateFrom(argument)),
		);
		const onError = vi.fn<(error: unknown) => void>();
		const error = new Error("ready failed");

		start.mockImplementationOnce((argument) =>
			createNativeTransition(updateFrom(argument), {
				ready: Promise.reject(error),
				finished: Promise.resolve(),
			}),
		);
		ViewTransition.start(() => undefined, { onError });
		await tick();
		expect(onError).toHaveBeenCalledExactlyOnceWith(error);

		const abort = Object.assign(new Error("skipped"), {
			name: "AbortError",
		});
		start.mockImplementationOnce((argument) =>
			createNativeTransition(updateFrom(argument), {
				ready: Promise.reject(abort),
				finished: Promise.resolve(),
			}),
		);
		ViewTransition.start(() => undefined, { onError });
		await tick();
		expect(onError).toHaveBeenCalledOnce();
	});

	it("validates arguments, scopes, and options", () => {
		const element = document.createElement("div");

		expect(() => ViewTransition.start({} as never)).toThrowError(
			expect.objectContaining({
				code: ViewTransitionErrorCode.InvalidArgument,
			}),
		);
		expect(() => ViewTransition.start(element, 1 as never)).toThrowError(
			ViewTransitionError,
		);
		expect(() =>
			ViewTransition.start(element, document.createElement("div"), 1 as never),
		).toThrowError(
			expect.objectContaining({
				code: ViewTransitionErrorCode.InvalidArgument,
			}),
		);
		expect(() =>
			ViewTransition.start(element, {} as Element, () => undefined),
		).toThrowError(
			expect.objectContaining({
				code: ViewTransitionErrorCode.InvalidArgument,
			}),
		);
		expect(() =>
			ViewTransition.start(() => undefined, "options" as never),
		).toThrowError(ViewTransitionError);
		expect(() =>
			ViewTransition.start(() => undefined, {
				onReady: "not a function" as never,
			}),
		).toThrowError(
			expect.objectContaining({
				code: ViewTransitionErrorCode.InvalidOption,
			}),
		);
		expect(() =>
			ViewTransition.start(() => undefined, {
				reducedMotion: "sometimes" as never,
			}),
		).toThrowError(ViewTransitionError);
		expect(() =>
			ViewTransition.start(() => undefined, {
				types: ["navigation", ""],
			}),
		).toThrowError(
			expect.objectContaining({
				code: ViewTransitionErrorCode.InvalidOption,
			}),
		);
		expect(() =>
			ViewTransition.start(() => undefined, { name: "" }),
		).toThrowError(
			expect.objectContaining({
				code: ViewTransitionErrorCode.InvalidOption,
			}),
		);
		expect(() =>
			ViewTransition.start(() => undefined, {
				interactive: "yes" as never,
			}),
		).toThrowError(
			expect.objectContaining({
				code: ViewTransitionErrorCode.InvalidOption,
			}),
		);
		expect(() => ViewTransition.current({} as Element)).toThrowError(
			ViewTransitionError,
		);
		expect(() => ViewTransition.supported("window" as never)).toThrowError(
			ViewTransitionError,
		);
	});
});
