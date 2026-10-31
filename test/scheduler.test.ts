import { afterEach, describe, expect, it, vi } from "vitest";

import { Scheduler } from "../src/scheduler";

describe("Scheduler", () => {
	afterEach(() => vi.useRealTimers());

	it("debounces calls and exposes call, cancel, flush, and state", () => {
		vi.useFakeTimers();
		const callback = vi.fn<(...args: unknown[]) => void>();
		const task = Scheduler.debounce(callback, 300);

		task.call("first");
		task("latest");
		vi.advanceTimersByTime(299);
		expect(callback).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);
		expect(callback).toHaveBeenCalledExactlyOnceWith("latest");
		expect(task.canceled).toBe(false);

		task("flushed");
		task.flush();
		expect(callback).toHaveBeenLastCalledWith("flushed");
		task("canceled");
		task.cancel();
		vi.runAllTimers();
		expect(callback).toHaveBeenCalledTimes(2);
		expect(task.canceled).toBe(true);
	});

	it("throttles calls and cancels trailing work", () => {
		vi.useFakeTimers();
		const callback = vi.fn<(...args: unknown[]) => void>();
		const task = Scheduler.throttle(callback, 100);

		task(1);
		task(2);
		expect(callback).toHaveBeenCalledExactlyOnceWith(1);
		vi.advanceTimersByTime(100);
		expect(callback).toHaveBeenLastCalledWith(2);
		task(3);
		task.cancel();
		vi.runAllTimers();
		expect(callback).toHaveBeenCalledTimes(2);
	});

	it("supports cancelable delays with or without a callback", async () => {
		vi.useFakeTimers();
		const callback = vi.fn<(...args: unknown[]) => void>();
		const task = Scheduler.delay(100, callback);
		vi.advanceTimersByTime(50);
		task.cancel();
		vi.advanceTimersByTime(100);
		expect(callback).not.toHaveBeenCalled();
		expect(task.canceled).toBe(true);
		await expect(task.promise).resolves.toBeUndefined();
		expect(() => Scheduler.delay(100)).not.toThrow();
	});

	it("schedules cancelable animation frame and next-frame callbacks", () => {
		vi.useFakeTimers();
		const raf = vi.fn<(...args: unknown[]) => void>();
		const frame = Scheduler.raf(raf);
		frame.cancel();
		vi.runAllTimers();
		expect(raf).not.toHaveBeenCalled();

		const nextFrame = vi.fn<(...args: unknown[]) => void>();
		Scheduler.nextFrame(nextFrame);
		vi.runAllTimers();
		expect(nextFrame).toHaveBeenCalledOnce();
	});

	it("repeats callbacks and supports pause, resume, and cancel", () => {
		vi.useFakeTimers();
		const callback = vi.fn<(...args: unknown[]) => void>();
		const task = Scheduler.repeat(callback, 100);
		vi.advanceTimersByTime(200);
		expect(callback).toHaveBeenCalledTimes(2);

		task.pause();
		vi.advanceTimersByTime(200);
		expect(callback).toHaveBeenCalledTimes(2);
		task.resume();
		vi.advanceTimersByTime(100);
		expect(callback).toHaveBeenCalledTimes(3);
		task.cancel();
		vi.advanceTimersByTime(200);
		expect(callback).toHaveBeenCalledTimes(3);
		expect(task.canceled).toBe(true);
	});

	it("validates timer durations", () => {
		expect(() => Scheduler.delay(-1)).toThrow(RangeError);
		expect(() =>
			Scheduler.debounce(vi.fn<(...args: unknown[]) => void>(), Number.NaN),
		).toThrow(RangeError);
		expect(() =>
			Scheduler.repeat(
				vi.fn<(...args: unknown[]) => void>(),
				Number.POSITIVE_INFINITY,
			),
		).toThrow(RangeError);
	});
});
