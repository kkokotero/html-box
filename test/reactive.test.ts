import { describe, expect, it, vi } from "vitest";

import { Reactive, ReactiveError, ReactiveErrorCode } from "../src/reactive";

describe("Reactive", () => {
	it("reads, replaces, updates, patches, mutates, notifies, and resets values", () => {
		const state = Reactive.create({ count: 0, label: "initial" });
		const handler = vi.fn<(...args: unknown[]) => void>();
		state.subscribe(handler);

		state.patch({ count: 1 });
		state.update((value) => ({ ...value, label: "updated" }));
		expect(state.value).toEqual({ count: 1, label: "updated" });
		expect(handler).toHaveBeenCalledTimes(2);

		const items = Reactive.create([1]);
		const itemHandler = vi.fn<(...args: unknown[]) => void>();
		items.subscribe(itemHandler);
		items.mutate((value) => value.push(2));
		expect(items.get()).toEqual([1, 2]);
		expect(itemHandler).toHaveBeenCalledWith(
			items.get(),
			items.get(),
			expect.any(Object),
		);

		state.notify();
		state.reset();
		expect(state.get()).toEqual({ count: 0, label: "initial" });
		expect(handler).toHaveBeenCalledTimes(4);
		expect(state.version).toBe(4);
	});

	it("uses configured and shallow equality to suppress unchanged values", () => {
		const custom = Reactive.create(1, { equals: (a, b) => a % 2 === b % 2 });
		const handler = vi.fn<(...args: unknown[]) => void>();
		custom.subscribe(handler);
		custom.set(3);
		custom.set(4);
		expect(handler).toHaveBeenCalledOnce();

		const object = Reactive.create(
			{ count: 1 },
			{ equals: Reactive.shallowEqual },
		);
		const objectHandler = vi.fn<(...args: unknown[]) => void>();
		object.subscribe(objectHandler);
		object.set({ count: 1 });
		object.set({ count: 2 });
		expect(objectHandler).toHaveBeenCalledOnce();
	});

	it("supports immediate, selected, once, and cancelable subscriptions", () => {
		const state = Reactive.create({ count: 1, label: "one" });
		const selected = vi.fn<(...args: unknown[]) => void>();
		const handle = state.subscribe(selected, {
			select: (value: { count: number; label: string }) => value.count,
			immediate: true,
		});
		state.patch({ label: "still one" });
		state.patch({ count: 2 });
		expect(selected).toHaveBeenNthCalledWith(1, 1, 1, handle);
		expect(selected).toHaveBeenNthCalledWith(2, 2, 1, handle);

		const once = vi.fn<(...args: unknown[]) => void>();
		const onceHandle = state.once(once);
		state.patch({ count: 3 });
		state.patch({ count: 4 });
		expect(once).toHaveBeenCalledOnce();
		expect(onceHandle.active).toBe(false);

		handle.unsubscribe();
		expect(handle.active).toBe(false);
		expect(state.subscriberCount).toBe(0);
	});

	it("pauses subscriptions and values, then flushes or discards missed changes", () => {
		const state = Reactive.create(0);
		const subscriber = vi.fn<(...args: unknown[]) => void>();
		const handle = state.subscribe(subscriber);

		handle.pause();
		state.set(1);
		state.set(2);
		expect(subscriber).not.toHaveBeenCalled();
		handle.resume();
		expect(subscriber).toHaveBeenCalledOnce();
		expect(subscriber).toHaveBeenCalledWith(2, 0, handle);

		state.pause();
		state.set(3);
		state.set(4);
		state.resume({ flush: false });
		expect(subscriber).toHaveBeenCalledOnce();
		state.set(5);
		expect(subscriber).toHaveBeenCalledTimes(2);
		expect(subscriber).toHaveBeenLastCalledWith(5, 4, handle);
	});

	it("batches nested changes and emits only the final value", () => {
		const state = Reactive.create(0);
		const handler = vi.fn<(...args: unknown[]) => void>();
		state.subscribe(handler);

		const result = Reactive.batch(() => {
			state.set(1);
			Reactive.batch(() => {
				state.set(2);
				state.set(3);
			});
			return "complete";
		});
		expect(result).toBe("complete");
		expect(handler).toHaveBeenCalledOnce();
		expect(handler).toHaveBeenCalledWith(3, 0, expect.any(Object));

		Reactive.batch(() => {
			state.set(4);
			state.set(3);
		});
		expect(handler).toHaveBeenCalledOnce();
	});

	it("stops a subscriber feedback loop and clears pending notifications", () => {
		const state = Reactive.create(0);
		const subscription = state.subscribe((value) => state.set(value + 1));

		expect(() => state.set(1)).toThrow(
			expect.objectContaining({ code: ReactiveErrorCode.Cycle }),
		);
		subscription.cancel();
		expect(() => state.set(2000)).not.toThrow();
		expect(state.get()).toBe(2000);
	}, 5000);

	it("bounds reentrant updates started by an immediate subscription", () => {
		const state = Reactive.create(0);

		expect(() =>
			state.subscribe((value) => state.set(value + 1), { immediate: true }),
		).toThrow(expect.objectContaining({ code: ReactiveErrorCode.Cycle }));
	}, 5000);

	it("limits cycles that alternate between reactive values", () => {
		const first = Reactive.create(0);
		const second = Reactive.create(0);
		first.subscribe((value) => second.set(value + 1));
		second.subscribe((value) => first.set(value + 1));

		expect(() => first.set(1)).toThrow(
			expect.objectContaining({ code: ReactiveErrorCode.Cycle }),
		);
	}, 5000);

	it("derives read-only values and updates diamond graphs without glitches", () => {
		const left = Reactive.create(1);
		const right = Reactive.create(2);
		const sum = Reactive.derive([left, right], (a, b) => a + b);
		const doubled = sum.map((value) => value * 2);
		const observed = vi.fn<(...args: unknown[]) => void>();
		doubled.subscribe(observed);

		Reactive.batch(() => {
			left.set(3);
			right.set(4);
		});
		expect(sum.get()).toBe(7);
		expect(doubled.get()).toBe(14);
		expect(observed).toHaveBeenCalledOnce();
		expect(observed).toHaveBeenCalledWith(14, 6, expect.any(Object));
		expect(sum.readonly).toBe(true);
		expect(() => sum.set(0)).toThrow(
			expect.objectContaining({ code: ReactiveErrorCode.ReadOnly }),
		);

		doubled.close();
		sum.close();
	});

	it("resolves immediately when the current value matches", async () => {
		const state = Reactive.create(0);
		await expect(state.when((value) => value === 0)).resolves.toBe(0);
	});

	it("resolves when promises on change and rejects them when closed", async () => {
		const state = Reactive.create(0);
		const pending = state.when((value) => value >= 2);
		state.set(1);
		state.set(2);
		await expect(pending).resolves.toBe(2);

		const waiting = state.when((value) => value > 2);
		state.close();
		await expect(waiting).rejects.toMatchObject({
			code: ReactiveErrorCode.Closed,
		});
	});

	it("handles abort signals for reactive values, subscriptions, and waits", async () => {
		const reactiveController = new AbortController();
		const state = Reactive.create(0, { signal: reactiveController.signal });
		reactiveController.abort();
		expect(state.closed).toBe(true);

		const subscriptionController = new AbortController();
		const active = Reactive.create(0);
		const handle = active.subscribe(vi.fn<(...args: unknown[]) => void>(), {
			signal: subscriptionController.signal,
		});
		subscriptionController.abort();
		expect(handle.active).toBe(false);

		const waitController = new AbortController();
		const waiting = active.when((value) => value > 0, {
			signal: waitController.signal,
		});
		waitController.abort("cancelled");
		await expect(waiting).rejects.toBe("cancelled");
	});

	it("isolates subscriber errors and reports them through onError", () => {
		const error = new Error("subscriber failed");
		const onError = vi.fn<(...args: unknown[]) => void>();
		const state = Reactive.create(0, { onError });
		const succeeding = vi.fn<(...args: unknown[]) => void>();
		state.subscribe(() => {
			throw error;
		});
		state.subscribe(succeeding);

		expect(() => state.set(1)).not.toThrow();
		expect(onError).toHaveBeenCalledWith(error);
		expect(succeeding).toHaveBeenCalledOnce();
	});

	it("validates arguments and rejects operations on closed values", () => {
		const state = Reactive.create({ count: 0 });
		expect(Reactive.isReactive(state)).toBe(true);
		expect(Reactive.isReactive({})).toBe(false);
		expect(() => state.patch(new Map() as never)).toThrow(ReactiveError);
		expect(() => state.update(null as never)).toThrow(ReactiveError);
		expect(() => Reactive.derive([state], null as never)).toThrow(
			ReactiveError,
		);
		expect(() => Reactive.create(0, { equals: null as never })).toThrow(
			ReactiveError,
		);

		state.close();
		state.close();
		expect(state.closed).toBe(true);
		expect(state.get()).toEqual({ count: 0 });
		expect(() => state.set({ count: 1 })).toThrow(
			expect.objectContaining({ code: ReactiveErrorCode.Closed }),
		);
		expect(() =>
			state.subscribe(vi.fn<(...args: unknown[]) => void>()),
		).toThrow(expect.objectContaining({ code: ReactiveErrorCode.Closed }));
	});
});
