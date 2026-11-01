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
		expect(() => ViewTransition.current({} as Element)).toThrowError(
			ViewTransitionError,
		);
		expect(() => ViewTransition.supported("window" as never)).toThrowError(
			ViewTransitionError,
		);
	});
});
