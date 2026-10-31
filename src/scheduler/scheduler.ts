import type {
	CancelableTask,
	CancelableDelay,
	FlushableTask,
	RepeatTask,
	ScheduledCall,
} from "./types";

type Callback<Args extends unknown[] = []> = (...args: Args) => void;

function createTask(onCancel: () => void): CancelableTask {
	let canceled = false;
	return {
		get canceled() {
			return canceled;
		},
		cancel() {
			if (canceled) return;
			canceled = true;
			onCancel();
		},
	};
}

function assertDelay(delay: number, name = "delay"): void {
	if (!Number.isFinite(delay) || delay < 0) {
		throw new RangeError(`${name} must be a finite non-negative number.`);
	}
}

function invokeSafely(callback: Callback): void {
	callback();
}

/**
 * Creates cancelable timers and frame tasks, and controls callback frequency.
 * All returned task handles expose `cancel()` and a read-only `canceled` state.
 */
export class Scheduler {
	private constructor() {}

	/** Delay a callback. Canceling prevents it from running. */
	static delay<Args extends unknown[]>(
		wait: number,
		callback: Callback<Args> = (() => {}) as Callback<Args>,
		...args: Args
	): CancelableDelay {
		assertDelay(wait);
		const timer: { id?: ReturnType<typeof setTimeout> } = {};
		let resolveWait!: () => void;
		const promise = new Promise<void>((resolve) => {
			resolveWait = resolve;
		});
		const task = createTask(() => {
			if (timer.id !== undefined) clearTimeout(timer.id);
			resolveWait();
		});
		timer.id = setTimeout(() => {
			if (task.canceled) return;
			try {
				callback(...args);
			} finally {
				task.cancel();
			}
		}, wait);
		return Object.assign(task, { promise });
	}

	/** Schedule a callback for the next animation frame, with a timer fallback. */
	static raf(callback: FrameRequestCallback): CancelableTask {
		let frame: number | undefined;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const cancelFrame = () => {
			if (frame !== undefined && typeof cancelAnimationFrame === "function")
				cancelAnimationFrame(frame);
			if (timer !== undefined) clearTimeout(timer);
		};
		const task = createTask(cancelFrame);
		if (typeof requestAnimationFrame === "function") {
			frame = requestAnimationFrame((time) => {
				try {
					if (!task.canceled) callback(time);
				} finally {
					task.cancel();
				}
			});
		} else {
			timer = setTimeout(() => {
				try {
					if (!task.canceled) callback(Date.now());
				} finally {
					task.cancel();
				}
			}, 16);
		}
		return task;
	}

	/** Schedule a callback after the browser has had two animation frames. */
	static nextFrame(callback: FrameRequestCallback): CancelableTask {
		const firstRef: { task?: CancelableTask } = {};
		let second: CancelableTask | undefined;
		const task = createTask(() => {
			firstRef.task?.cancel();
			second?.cancel();
		});
		firstRef.task = Scheduler.raf((time) => {
			if (!task.canceled) {
				second = Scheduler.raf((nextTime) => {
					if (!task.canceled) callback(nextTime || time);
					task.cancel();
				});
			}
		});
		return task;
	}

	/** Create a debounced function with cancel and flush controls. */
	static debounce<Args extends unknown[]>(
		callback: Callback<Args>,
		wait: number,
	): ScheduledCall<Args> & FlushableTask {
		assertDelay(wait);
		let timer: ReturnType<typeof setTimeout> | undefined;
		let latestArgs: Args | undefined;
		let canceled = false;
		const run = () => {
			if (latestArgs === undefined || canceled) return;
			const args = latestArgs;
			latestArgs = undefined;
			callback(...args);
		};
		const result = ((...args: Args) => {
			if (canceled) return;
			latestArgs = args;
			if (timer !== undefined) clearTimeout(timer);
			timer = setTimeout(() => {
				timer = undefined;
				run();
			}, wait);
		}) as ScheduledCall<Args> & FlushableTask;
		Object.defineProperties(result, {
			canceled: { get: () => canceled },
			call: {
				value: (...args: Args) => result(...args),
			},
			cancel: {
				value: () => {
					if (canceled) return;
					canceled = true;
					if (timer !== undefined) clearTimeout(timer);
					timer = undefined;
					latestArgs = undefined;
				},
			},
			flush: {
				value: () => {
					if (timer !== undefined) clearTimeout(timer);
					timer = undefined;
					run();
				},
			},
		});
		return result;
	}

	/** Create a throttled function with cancel and flush controls. */
	static throttle<Args extends unknown[]>(
		callback: Callback<Args>,
		wait: number,
	): ScheduledCall<Args> & FlushableTask {
		assertDelay(wait);
		let timer: ReturnType<typeof setTimeout> | undefined;
		let latestArgs: Args | undefined;
		let canceled = false;
		const run = () => {
			if (latestArgs === undefined || canceled) return;
			const args = latestArgs;
			latestArgs = undefined;
			callback(...args);
		};
		const result = ((...args: Args) => {
			if (canceled) return;
			latestArgs = args;
			if (timer !== undefined) return;
			run();
			timer = setTimeout(() => {
				timer = undefined;
				if (latestArgs !== undefined) {
					run();
					timer = setTimeout(() => {
						timer = undefined;
						run();
					}, wait);
				}
			}, wait);
		}) as ScheduledCall<Args> & FlushableTask;
		Object.defineProperties(result, {
			canceled: { get: () => canceled },
			call: { value: (...args: Args) => result(...args) },
			cancel: {
				value: () => {
					if (canceled) return;
					canceled = true;
					if (timer !== undefined) clearTimeout(timer);
					timer = undefined;
					latestArgs = undefined;
				},
			},
			flush: {
				value: () => {
					if (timer !== undefined) clearTimeout(timer);
					timer = undefined;
					run();
				},
			},
		});
		return result;
	}

	/** Repeatedly invoke a callback until the task is canceled. */
	static repeat(
		callback: Callback,
		interval: number,
		options: { immediate?: boolean } = {},
	): RepeatTask {
		assertDelay(interval, "interval");
		let timer: ReturnType<typeof setTimeout> | undefined;
		let canceled = false;
		let paused = false;
		const schedule = () => {
			if (canceled || paused) return;
			timer = setTimeout(() => {
				timer = undefined;
				if (canceled || paused) return;
				invokeSafely(callback);
				schedule();
			}, interval);
		};
		const task: RepeatTask = {
			get canceled() {
				return canceled;
			},
			get paused() {
				return paused;
			},
			cancel() {
				if (canceled) return;
				canceled = true;
				if (timer !== undefined) clearTimeout(timer);
				timer = undefined;
			},
			pause() {
				if (canceled || paused) return this;
				paused = true;
				if (timer !== undefined) clearTimeout(timer);
				timer = undefined;
				return this;
			},
			resume() {
				if (canceled || !paused) return this;
				paused = false;
				schedule();
				return this;
			},
		};
		if (options.immediate) invokeSafely(callback);
		schedule();
		return task;
	}
}
