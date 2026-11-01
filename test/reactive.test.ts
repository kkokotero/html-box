import { afterEach, describe, expect, it, vi } from "vitest";

import { Reactive, ReactiveError, ReactiveErrorCode } from "../src/reactive";
import type { ReactiveHandler } from "../src/reactive";

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("Reactive", () => {
	it("creates values and emits ordered changes through set, update, and value", () => {
		const count = Reactive.create(0);
		const handler = vi.fn<ReactiveHandler<number>>();
		const subscription = count.subscribe(handler);

		expect(count.get()).toBe(0);
		expect(count.value).toBe(0);
		expect(count.version).toBe(0);
		expect(count.closed).toBe(false);
		expect(count.readonly).toBe(false);
		expect(count.subscriberCount).toBe(1);

		count.set(1);
		count.update((value) => value + 1);
		count.value++;

		expect(handler).toHaveBeenCalledTimes(3);
		expect(handler).toHaveBeenNthCalledWith(
			1,
			1,
			0,
			expect.objectContaining({ active: true }),
		);
		expect(handler).toHaveBeenNthCalledWith(3, 3, 2, expect.any(Object));
		expect(count.get()).toBe(3);
		expect(count.version).toBe(3);

		count.set(3);
		expect(handler).toHaveBeenCalledTimes(3);

		subscription.cancel();
		expect(subscription.active).toBe(false);
		expect(count.subscriberCount).toBe(0);
		subscription.cancel();
		expect(subscription.active).toBe(false);
	});

	it("patches plain objects only when a field changes", () => {
		const user = Reactive.create({ name: "Ada", age: 36 });
		const handler = vi.fn<ReactiveHandler<{ name: string; age: number }>>();
		user.subscribe(handler);

		user.patch({ age: 36 });
		expect(handler).not.toHaveBeenCalled();

		user.patch({ age: 37 });
		expect(handler).toHaveBeenCalledOnce();
		expect(user.get()).toEqual({ name: "Ada", age: 37 });
		expect(handler.mock.calls[0]?.[1]).toEqual({ name: "Ada", age: 36 });

		const number = Reactive.create(1);
		expect(() => number.patch({} as never)).toThrowError(
			expect.objectContaining({ code: ReactiveErrorCode.InvalidArgument }),
		);
	});

	it("mutates in place, forces emission, and notifies after a failed mutator", () => {
		const list = Reactive.create([1]);
		const handler = vi.fn<ReactiveHandler<number[]>>();
		list.subscribe(handler);

		list.mutate((value) => {
			value.push(2);
		});

		expect(list.get()).toEqual([1, 2]);
		expect(handler).toHaveBeenCalledOnce();
		expect(handler.mock.calls[0]?.[0]).toBe(handler.mock.calls[0]?.[1]);

		const error = new Error("mutation failed");
		expect(() =>
			list.mutate((value) => {
				value.push(3);
				throw error;
			}),
		).toThrow(error);
		expect(list.get()).toEqual([1, 2, 3]);
		expect(handler).toHaveBeenCalledTimes(2);
	});

	it("forces notifications and resets to the initial value", () => {
		const count = Reactive.create(1);
		const handler = vi.fn<ReactiveHandler<number>>();
		count.subscribe(handler);

		count.notify();
		expect(handler).toHaveBeenCalledOnce();
		expect(handler.mock.calls[0]?.[0]).toBe(1);
		expect(handler.mock.calls[0]?.[1]).toBe(1);

		count.set(5);
		count.reset();
		expect(count.get()).toBe(1);
		expect(handler).toHaveBeenCalledTimes(3);
	});

	it("supports immediate, once, select, and custom equality subscriptions", () => {
		const user = Reactive.create({ name: "Ada", age: 36 });
		const immediate = vi.fn<ReactiveHandler<{ name: string; age: number }>>();
		user.subscribe(immediate, { immediate: true });
		expect(immediate).toHaveBeenCalledWith(
			user.get(),
			user.get(),
			expect.any(Object),
		);

		const names = vi.fn<ReactiveHandler<string>>();
		const selected = user.subscribe(names, {
			select: (value) => value.name,
		});

		user.patch({ age: 37 });
		expect(names).not.toHaveBeenCalled();

		user.patch({ name: "Grace" });
		expect(names).toHaveBeenCalledExactlyOnceWith("Grace", "Ada", selected);

		const once = vi.fn<ReactiveHandler<number>>();
		const count = Reactive.create(0);
		const onceSubscription = count.once(once);
		count.set(1);
		count.set(2);
		expect(once).toHaveBeenCalledOnce();
		expect(onceSubscription.active).toBe(false);
	});

	it("removes subscriptions by handler or all at once", () => {
		const count = Reactive.create(0);
		const first = vi.fn<ReactiveHandler<number>>();
		const second = vi.fn<ReactiveHandler<number>>();
		count.subscribe(first);
		count.subscribe(second);
		count.subscribe(first);

		count.off(first);
		expect(count.subscriberCount).toBe(1);

		count.set(1);
		expect(first).not.toHaveBeenCalled();
		expect(second).toHaveBeenCalledOnce();

		count.off();
		expect(count.subscriberCount).toBe(0);
	});

	it("pauses one subscription and delivers one grouped notification", () => {
		const count = Reactive.create(0);
		const handler = vi.fn<ReactiveHandler<number>>();
		const subscription = count.subscribe(handler);

		subscription.pause();
		count.set(1);
		count.set(2);
		expect(handler).not.toHaveBeenCalled();
		expect(subscription.paused).toBe(true);
		expect(count.get()).toBe(2);

		subscription.resume();
		expect(handler).toHaveBeenCalledExactlyOnceWith(2, 0, subscription);
		expect(subscription.paused).toBe(false);

		subscription.pause();
		count.set(3);
		subscription.resume({ flush: false });
		expect(handler).toHaveBeenCalledOnce();

		count.set(4);
		expect(handler).toHaveBeenLastCalledWith(4, 3, subscription);
	});

	it("pauses all notifications and resumes with the latest value", () => {
		const count = Reactive.create(0);
		const first = vi.fn<ReactiveHandler<number>>();
		const second = vi.fn<ReactiveHandler<number>>();
		count.subscribe(first);
		count.subscribe(second);

		count.pause();
		count.set(1);
		count.set(2);
		expect(count.paused).toBe(true);
		expect(first).not.toHaveBeenCalled();
		expect(second).not.toHaveBeenCalled();

		count.resume();
		expect(first).toHaveBeenCalledExactlyOnceWith(2, 0, expect.any(Object));
		expect(second).toHaveBeenCalledOnce();
		expect(count.paused).toBe(false);
	});

	it("cancels subscriptions and closes values through abort signals", () => {
		const subscriptionController = new AbortController();
		const count = Reactive.create(0);
		const handler = vi.fn<ReactiveHandler<number>>();
		const subscription = count.subscribe(handler, {
			signal: subscriptionController.signal,
		});

		subscriptionController.abort();
		expect(subscription.active).toBe(false);
		count.set(1);
		expect(handler).not.toHaveBeenCalled();

		const aborted = new AbortController();
		aborted.abort();
		expect(count.subscribe(handler, { signal: aborted.signal }).active).toBe(
			false,
		);

		const closeController = new AbortController();
		const closed = Reactive.create(0, { signal: closeController.signal });
		closeController.abort();
		expect(closed.closed).toBe(true);
		expect(closed.get()).toBe(0);
		expect(() => closed.set(1)).toThrowError(
			expect.objectContaining({ code: ReactiveErrorCode.Closed }),
		);
		expect(() => closed.subscribe(handler)).toThrowError(
			expect.objectContaining({ code: ReactiveErrorCode.Closed }),
		);

		const alreadyAborted = new AbortController();
		alreadyAborted.abort();
		expect(Reactive.create(0, { signal: alreadyAborted.signal }).closed).toBe(
			true,
		);
	});

	it("batches changes and emits each value once", () => {
		const first = Reactive.create(0);
		const second = Reactive.create(0);
		const firstHandler = vi.fn<ReactiveHandler<number>>();
		const secondHandler = vi.fn<ReactiveHandler<number>>();
		first.subscribe(firstHandler);
		second.subscribe(secondHandler);

		const result = Reactive.batch(() => {
			first.set(1);
			first.set(2);
			second.set(1);
			Reactive.batch(() => first.set(3));
			first.set(4);
			return "done";
		});

		expect(result).toBe("done");
		expect(firstHandler).toHaveBeenCalledExactlyOnceWith(
			4,
			0,
			expect.any(Object),
		);
		expect(secondHandler).toHaveBeenCalledOnce();

		firstHandler.mockClear();
		Reactive.batch(() => {
			first.set(5);
			first.set(4);
		});
		expect(firstHandler).not.toHaveBeenCalled();
		expect(() => Reactive.batch(null as never)).toThrowError(
			ReactiveErrorCode.InvalidArgument,
		);
	});

	it("derives and maps values with explicit dependencies", () => {
		const price = Reactive.create(10);
		const quantity = Reactive.create(2);
		const total = Reactive.derive([price, quantity], (p, q) => p * q);
		const label = total.map((value) => `${value} €`);

		expect(total.get()).toBe(20);
		expect(total.readonly).toBe(true);
		expect(label.get()).toBe("20 €");

		const handler = vi.fn<ReactiveHandler<string>>();
		label.subscribe(handler);
		price.set(15);
		expect(label.get()).toBe("30 €");
		expect(handler).toHaveBeenCalledWith("30 €", "20 €", expect.any(Object));
	});

	it("updates diamond graphs once per change", () => {
		const source = Reactive.create(1);
		const left = source.map((value) => value + 1);
		const right = source.map((value) => value * 2);
		const compute = vi.fn((l: number, r: number) => l + r);
		const total = Reactive.derive([left, right], compute);
		const handler = vi.fn<ReactiveHandler<number>>();
		total.subscribe(handler);

		expect(total.get()).toBe(4);
		expect(compute).toHaveBeenCalledOnce();

		source.set(2);
		expect(total.get()).toBe(7);
		expect(compute).toHaveBeenCalledTimes(2);
		expect(handler).toHaveBeenCalledExactlyOnceWith(7, 4, expect.any(Object));
	});

	it("rejects writes to derived values and validates derive arguments", () => {
		const source = Reactive.create(1);
		const derived = source.map((value) => value * 2);

		expect(() => derived.set(2)).toThrowError(
			expect.objectContaining({ code: ReactiveErrorCode.ReadOnly }),
		);
		expect(() => derived.update(() => 3)).toThrowError(
			ReactiveErrorCode.ReadOnly,
		);
		expect(() => derived.mutate(() => {})).toThrowError(
			ReactiveErrorCode.ReadOnly,
		);
		expect(() => derived.reset()).toThrowError(ReactiveErrorCode.ReadOnly);

		expect(() => Reactive.derive([1] as never, () => 0)).toThrowError(
			expect.objectContaining({
				code: ReactiveErrorCode.InvalidArgument,
			}),
		);
		expect(() => Reactive.derive([source], null as never)).toThrowError(
			ReactiveErrorCode.InvalidArgument,
		);
	});

	it("detaches closed derived values from their sources", () => {
		const source = Reactive.create(1);
		const derived = source.map((value) => value * 2);

		derived.close();
		derived.close();
		expect(derived.closed).toBe(true);
		expect(derived.get()).toBe(2);

		source.set(5);
		expect(derived.get()).toBe(2);
		expect(source.subscriberCount).toBe(0);
	});

	it("resolves when() immediately, after a change, or by rejection", async () => {
		const count = Reactive.create(1);
		await expect(count.when((value) => value === 1)).resolves.toBe(1);

		const wait = count.when((value) => value === 3);
		count.set(2);
		count.set(3);
		await expect(wait).resolves.toBe(3);

		const controller = new AbortController();
		const aborted = count.when((value) => value === 10, {
			signal: controller.signal,
		});
		const reason = new Error("stop");
		controller.abort(reason);
		await expect(aborted).rejects.toBe(reason);

		const error = new Error("predicate failed");
		await expect(
			count.when(() => {
				throw error;
			}),
		).rejects.toBe(error);

		const closedWait = count.when((value) => value === 20);
		count.close();
		await expect(closedWait).rejects.toMatchObject({
			code: ReactiveErrorCode.Closed,
		});
		await expect(count.when(() => true)).rejects.toMatchObject({
			code: ReactiveErrorCode.Closed,
		});
	});

	it("reports handler errors without stopping other handlers", () => {
		const onError = vi.fn<(error: unknown) => void>();
		const count = Reactive.create(0, { onError });
		const error = new Error("handler failed");
		const second = vi.fn<ReactiveHandler<number>>();
		count.subscribe(() => {
			throw error;
		});
		count.subscribe(second);

		count.set(1);

		expect(onError).toHaveBeenCalledExactlyOnceWith(error);
		expect(second).toHaveBeenCalledOnce();
	});

	it("reports uncaught handler errors and nested onError failures", () => {
		const reportError = vi.fn<(error: unknown) => void>();
		vi.stubGlobal("reportError", reportError);
		const error = new Error("handler failed");
		const count = Reactive.create(0);
		count.subscribe(() => {
			throw error;
		});
		count.set(1);
		expect(reportError).toHaveBeenCalledExactlyOnceWith(error);

		reportError.mockClear();
		const nested = new Error("onError failed");
		const withHandler = Reactive.create(0, {
			onError: () => {
				throw nested;
			},
		});
		withHandler.subscribe(() => {
			throw error;
		});
		withHandler.set(1);
		expect(reportError).toHaveBeenCalledExactlyOnceWith(nested);
	});

	it("reports derived computation errors and preserves the previous value", () => {
		const onError = vi.fn<(error: unknown) => void>();
		const source = Reactive.create(1);
		const error = new Error("compute failed");
		const derived = Reactive.derive(
			[source],
			(value) => {
				if (value === 2) throw error;
				return value * 2;
			},
			{ onError },
		);

		expect(derived.get()).toBe(2);
		source.set(2);
		expect(onError).toHaveBeenCalledExactlyOnceWith(error);
		expect(() => derived.get()).toThrow(error);
	});

	it("detects update cycles", () => {
		const count = Reactive.create(0);
		count.subscribe((value) => count.set(value + 1));

		expect(() => count.set(1)).toThrowError(
			expect.objectContaining({ code: ReactiveErrorCode.Cycle }),
		);
	});

	it("compares shallow values and validates options", () => {
		expect(Reactive.shallowEqual({ a: 1 }, { a: 1 })).toBe(true);
		expect(Reactive.shallowEqual({ a: 1 }, { a: 2 })).toBe(false);
		expect(Reactive.shallowEqual([1, 2], [1, 2])).toBe(true);
		expect(Reactive.shallowEqual([1], { 0: 1 })).toBe(false);
		expect(
			Reactive.shallowEqual({ nested: { a: 1 } }, { nested: { a: 1 } }),
		).toBe(false);
		expect(Reactive.shallowEqual(null, null)).toBe(true);
		expect(Reactive.shallowEqual(null, {})).toBe(false);

		expect(Reactive.isReactive(Reactive.create(0))).toBe(true);
		expect(Reactive.isReactive(0)).toBe(false);

		expect(() => Reactive.create(0, { equals: 1 as never })).toThrowError(
			expect.objectContaining({
				code: ReactiveErrorCode.InvalidOption,
			}),
		);
		expect(() => Reactive.create(0, { onError: "no" as never })).toThrowError(
			ReactiveErrorCode.InvalidOption,
		);
		expect(() => Reactive.create(0, "options" as never)).toThrowError(
			ReactiveErrorCode.InvalidOption,
		);
	});

	it("validates write and subscription arguments", () => {
		const count = Reactive.create(0);
		expect(() => count.update(null as never)).toThrowError(
			ReactiveErrorCode.InvalidArgument,
		);
		expect(() => count.mutate(null as never)).toThrowError(
			ReactiveErrorCode.InvalidArgument,
		);
		expect(() => count.subscribe(null as never)).toThrowError(
			ReactiveErrorCode.InvalidArgument,
		);
		expect(() =>
			count.subscribe(() => {}, {
				select: "no" as never,
			}),
		).toThrowError(ReactiveErrorCode.InvalidOption);
		expect(() =>
			count.subscribe(() => {}, {
				equals: "no" as never,
			}),
		).toThrowError(ReactiveErrorCode.InvalidOption);
		expect(() => new ReactiveError(ReactiveErrorCode.Closed, "closed")).toThrow(
			"closed",
		);
	});
});
