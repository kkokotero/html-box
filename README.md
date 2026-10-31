<img src="./misc/banner.svg" alt="HTML Tools" />

<p align="center">
  <a href="./LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="license" />
  </a>
  <a href="https://www.npmjs.com/package/html-tools">
    <img src="https://img.shields.io/npm/v/html-tools.svg" alt="version" />
  </a>
  <a href="https://www.npmjs.com/package/html-tools">
    <img src="https://img.shields.io/npm/dm/html-tools.svg" alt="downloads" />
  </a>
  <a href="https://bundlephobia.com/result?p=html-tools">
    <img src="https://img.shields.io/bundlephobia/min/html-tools" alt="Bundle Size" />
  </a>
  <a href="https://bundlephobia.com/result?p=html-tools">
    <img src="https://img.shields.io/bundlephobia/minzip/html-tools" alt="Bundle Size (gzip)" />
  </a>
</p>

# HTML Tools

**Expressive JavaScript and TypeScript utilities for working with the DOM.**

HTML Tools is a collection of lightweight, independent utilities for DOM work. The current release provides the Query API for selector-based lookups, the Interaction API for native events and gestures, the Pointer API for pointer tracking, the HTML API for secure template rendering, the SafeZone API for geometric interaction zones, the Viewport API for element geometry and visibility monitoring, the Keyboard API for typed keyboard shortcuts, and the Scheduler API for cancelable timers and animation frames.

## Installation

```bash
npm install html-tools
```

## Module imports

Import each API from its package subpath. The package exposes only these modular entry points.

```ts
import { html, createHtml, unsafeHtml } from "html-tools/html";
import { Interaction } from "html-tools/interaction";
import { Keyboard } from "html-tools/keyboard";
import { Pointer } from "html-tools/pointer";
import { Query, hasDocument } from "html-tools/query";
import { SafeZone } from "html-tools/safe-zone";
import { Scheduler } from "html-tools/scheduler";
import { Viewport } from "html-tools/viewport";
```

| Import path              | Module                       |
| ------------------------ | ---------------------------- |
| `html-tools/query`       | Query utilities              |
| `html-tools/interaction` | Native events and gestures   |
| `html-tools/pointer`     | Pointer tracking             |
| `html-tools/html`        | HTML template rendering      |
| `html-tools/safe-zone`   | Geometric interaction zones  |
| `html-tools/viewport`    | Element geometry monitoring  |
| `html-tools/keyboard`    | Typed keyboard shortcuts     |
| `html-tools/scheduler`   | Cancelable timers and frames |

## Query API

`Query` is a document-backed query scope. It returns `undefined` or an empty array when no element matches, and it is safe to call in environments without a DOM.

### Basic queries

```ts
import { Query } from "html-tools/query";

const button = Query.one("button");
const items = Query.all("li");
const title = Query.byId("title");

const hasErrors = Query.exists(".error");
const itemCount = Query.count("li");
```

### Required elements

Use `must` when a missing element indicates a bug. Use `one` when the element is optional.

```ts
const form = Query.must("form");
const email = Query.must("#email", HTMLInputElement);
```

`must` and `mustById` throw when the requested element does not exist. `one`, `all`, `byId`, `exists`, and `count` return empty results instead.

### Typed results

Tag-name selectors are narrowed automatically. An optional constructor adds a runtime `instanceof` check.

```ts
const input = Query.one("#email", HTMLInputElement);
const inputs = Query.all("input", HTMLInputElement);
const maybeEmail = Query.byId("email", HTMLInputElement);
```

### Scoped queries

Use `Query.from` to bind the same query API to an element, document, or document fragment.

```ts
const form = Query.from(Query.must("form"));

const email = form.one("#email", HTMLInputElement);
const errors = form.all(".error");
const fieldset = form.closest("fieldset");

form.matches("form");
form.parent();
form.contains(email);
```

`Query.from(null)` returns an empty scope, so a missing root does not require a separate `null` check.

### Query helpers

```ts
Query.first("li");
Query.last("li");
Query.at<HTMLLIElement>("li", -1);
```

| Method                               | Result                                                          |
| ------------------------------------ | --------------------------------------------------------------- |
| `one(selector, type?)`               | First match, or `undefined`                                     |
| `all(selector, type?)`               | Array of matches                                                |
| `must(selector, type?)`              | First match, or throws                                          |
| `exists(selector)`                   | `true` when a match exists                                      |
| `count(selector)`                    | Number of matches                                               |
| `first(selector)` / `last(selector)` | First or last match, or `undefined`                             |
| `at(selector, index)`                | Match at a zero-based index; negative values count from the end |
| `byId(id, type?)`                    | Element by ID, or `undefined`                                   |
| `existsById(id)`                     | `true` when the ID exists                                       |
| `mustById(id, type?)`                | Element by ID, or throws                                        |
| `from(root)`                         | Scope bound to a document, fragment, element, or empty root     |

### Without a DOM

`Query` is safe to import in server-side rendering, workers, and Node.js environments where `document` is unavailable.

```ts
import { hasDocument, Query } from "html-tools/query";

const button = Query.one("button"); // undefined without a DOM

if (hasDocument) {
	console.log(document.title);
}
```

`hasDocument` is evaluated when the module loads.

## Interaction API

`Interaction` groups listeners for a single target. Native events use kebab-case aliases such as `double-click` and `key-down`. Every registration returns a subscription that can be cancelled independently. `pause()` temporarily detaches listeners and gestures without cancelling subscriptions; `resume()` restores them, while `close()` permanently cancels them.

### Native events

```ts
import { Interaction } from "html-tools/interaction";

const button = document.querySelector("button");

if (button) {
	const interaction = new Interaction(button);

	const clickSubscription = interaction.on("click", (event) => {
		console.log(event.clientX, event.clientY);
	});

	interaction.once("key-down", (event) => {
		console.log(event.key);
	});

	clickSubscription.cancel();
	interaction.close();
}
```

### Delegated listeners

Use `delegate` to handle events from matching descendants. The handler receives the matched element through `ctx.element`.

```ts
const list = document.querySelector("ul");

if (list) {
	const interaction = new Interaction(list);

	interaction.on(
		"click",
		(event, ctx) => {
			console.log(event.type, ctx.element);
		},
		{ delegate: "button[data-action]" },
	);
}
```

### Built-in gestures

The package includes `hover`, `long-press`, and `outside-click` gestures.

```ts
const card = document.querySelector(".card");

if (card) {
	const interaction = new Interaction(card);

	interaction.on("hover", (event) => {
		console.log(event.hovering);
	});

	interaction.on(
		"long-press",
		(event) => {
			console.log(event.x, event.y, event.duration);
		},
		{ delay: 600, tolerance: 12 },
	);

	interaction.on("outside-click", () => {
		console.log("clicked outside");
	});
}
```

### Custom events

Type the custom event map to get a typed `detail` field. Native and gesture names are reserved and cannot be emitted.

```ts
const interaction = new Interaction<{
	"app:ready": { id: string };
}>(document.body);

interaction.on("app:ready", (event) => {
	console.log(event.detail.id);
});

interaction.emit("app:ready", { id: "main" });
```

### Cleanup

Aborting an `AbortSignal` cancels a listener or closes the entire interaction. `off()` removes every listener for an event, or only a specific handler.

```ts
const controller = new AbortController();
const interaction = new Interaction(document.body, {
	signal: controller.signal,
});

const onKeyDown = (event: KeyboardEvent) => {
	console.log(event.key);
};

interaction.on("key-down", onKeyDown);
interaction.off("key-down", onKeyDown);

controller.abort(); // closes the interaction and removes remaining listeners
```

| Method                          | Result                                                         |
| ------------------------------- | -------------------------------------------------------------- |
| `on(name, handler, options?)`   | Registers a listener and returns a `Subscription`              |
| `once(name, handler, options?)` | Registers a listener that runs at most once                    |
| `off(name, handler?)`           | Removes listeners for an event                                 |
| `emit(name, detail?, init?)`    | Dispatches a typed `CustomEvent` from the target               |
| `close()`                       | Cancels all listeners and marks the interaction as closed      |
| `pause()` / `resume()`          | Temporarily suspends or restores listener and gesture dispatch |

## HTML API

The `html` template tag renders a static HTML template with typed bindings for child content, attributes, properties, booleans, and events. Dynamic strings are inserted as text nodes by default. Use `html.fragment` for multiple roots, or `createHtml` to share an `AbortSignal` across event listeners.

```ts
import { createHtml, html, unsafeHtml } from "html-tools/html";

const title = "Welcome";
const button = html`
	<button
		class="button ${"primary"}"
		?disabled=${false}
		.value=${title}
		@click.once=${(event) => console.log(event.currentTarget)}
	>
		${title}
	</button>
`;

const nodes = html.fragment`<h1>${title}</h1>
	<p>Ready</p>`;
const trusted = html`<section>
	${unsafeHtml("<strong>Trusted markup</strong>")}
</section>`;
```

Child bindings accept strings, numbers, bigints, DOM nodes, iterables of supported values, `null`, `undefined`, and booleans. Ordinary strings are always text. `unsafeHtml(markup)` explicitly opts into parsing trusted markup and must never receive untrusted user content.

Standard attributes accept primitive values; `null` and `undefined` remove a whole-value attribute. Use `?attribute=${condition}` for boolean attributes and `.property=${value}` for DOM property bindings. Event bindings use `@event=${handler}` and support `.once`, `.capture`, `.passive`, `.prevent`, and `.stop` modifiers. A handler may be a function or an `EventListenerObject`.

The compiler rejects interpolations in tag or attribute names, comments, and raw-text elements. It also blocks `<script>`, inline `on*` attributes, `srcdoc`, dangerous property bindings, and unsafe URL schemes. Each render creates new nodes; this is a one-time renderer, not a reactive update system.

| API                           | Result                                                |
| ----------------------------- | ----------------------------------------------------- |
| `html\`...\``                 | Renders one root element                              |
| `html.fragment\`...\``        | Renders a `DocumentFragment` with any number of roots |
| `createHtml({ signal? })`     | Creates a tag with shared event-listener cleanup      |
| `unsafeHtml(markup)`          | Explicitly marks trusted markup for raw insertion     |
| `HtmlError` / `HtmlErrorCode` | Error class and machine-readable error enum           |

## Pointer API

`Pointer` tracks Pointer Events on one element and provides typed samples with viewport, document, and element-local coordinates. Samples also include movement, displacement, pressure, button state, and pointer type. The API supports mouse, pen, and touch input.

### Tracking pointer events

```ts
import { Pointer } from "html-tools/pointer";

const canvas = document.querySelector("canvas");

if (canvas) {
	const pointer = new Pointer(canvas);

	pointer.on("move", ({ x, y, localX, localY, deltaX, deltaY }) => {
		console.log({ x, y, localX, localY, deltaX, deltaY });
	});

	pointer.on("down", ({ pointerType, pressure }) => {
		console.log(pointerType, pressure);
	});

	pointer.close();
}
```

The supported event names are `enter`, `leave`, `down`, `up`, `move`, and `cancel`. Each `on` or `once` registration returns a subscription with `cancel()`. Listener options support `once` and `AbortSignal`; `off()` removes listeners by event name, optionally matching a specific handler.

### Pointer state and capture

`position` returns the latest primary pointer position or `null` when no position is available. `pointers` lists active pointers, and `pressed` indicates whether any tracked pointer is down. With capture enabled, a pressed pointer continues generating events after it leaves the target; you can also manage capture with `capture()`, `release()`, and `hasCapture()`.

```ts
const pointer = new Pointer(canvas, {
	primaryOnly: false,
	types: ["pen", "touch"],
	capture: true,
	touchAction: "none",
});

console.log(pointer.position?.ratioX, pointer.pointers.length);
```

`primaryOnly` defaults to `true`, and `types` defaults to all pointer kinds. `touchAction` temporarily sets the target's CSS `touch-action` value and restores the previous value when the instance closes or pauses. `resume()` reapplies the configured value and restores pointer tracking without recreating the instance.

### Proximity

Use `proximity()` to measure the current pointer against one element, or `nearest()` to find the closest candidate. Both return `null` if no pointer position is available. The default metric measures distance to the nearest edge with a radius of `0` pixels; use `metric: "center"` or a larger radius to change the measurement.

```ts
const result = pointer.proximity(document.querySelector(".drop-zone"), {
	radius: 48,
	metric: "edge",
});

if (result?.near) {
	console.log(result.element, result.distance, result.ratio);
}

const closest = pointer.nearest(document.querySelectorAll("[data-target]"), {
	metric: "center",
});
```

### Cleanup

`close()` removes DOM listeners, releases captures, restores `touch-action`, cancels subscriptions, and clears tracked state. It is safe to call more than once. An instance created with a `null` or `undefined` target is inert, and an `AbortSignal` can close the instance automatically.

| Member                                                          | Result                                        |
| --------------------------------------------------------------- | --------------------------------------------- |
| `on(name, handler, options?)` / `once(name, handler, options?)` | Subscribe to typed pointer samples            |
| `off(name, handler?)`                                           | Remove listeners for an event                 |
| `position` / `pointers` / `pressed`                             | Read current pointer state                    |
| `capture(id?)` / `release(id?)` / `hasCapture(id?)`             | Manage pointer capture                        |
| `proximity(element, options?)` / `nearest(elements, options?)`  | Measure pointer proximity                     |
| `listenerCount(name?)`                                          | Count active listeners                        |
| `close()`                                                       | Remove listeners and release owned resources  |
| `pause()` / `resume()`                                          | Suspend or restore tracking and subscriptions |

## SafeZone API

`SafeZone` detects when a source enters, leaves, or remains inside a zone formed by one or more elements. A source can be the global pointer, an element rectangle, or a callback returning a viewport point or rectangle. The zone can use the convex hull (`"hull"`, default), the union of target rectangles (`"union"`), or their bounding box (`"bounds"`).

```ts
import { SafeZone } from "html-tools/safe-zone";

const zone = new SafeZone("pointer", [trigger, submenu], {
	padding: 8,
	shape: "hull",
	leaveDelay: 150,
});

zone.on("leave", () => closeMenu());
zone.on("enter", ({ point, zone: geometry }) => {
	console.log(point, geometry.bounds);
});

// Re-measure after a transform or animation that did not trigger layout events.
zone.update();
zone.close();
```

Use `mode` for element sources: `"intersect"` checks for any overlap, `"contain"` requires the source rectangle to fit inside the zone, and `"center"` tests only its center. `padding` accepts a number or per-edge values. `enterDelay` and `leaveDelay` add transition delays. `poll: true` re-measures every animation frame while the zone is active.

The zone starts observing only while it has listeners or a visualization overlay. It batches evaluation with `requestAnimationFrame`, tracks layout changes through scroll, resize, and `ResizeObserver`, and supports `AbortSignal` cleanup. `pause()` stops monitoring and cancels pending transitions while keeping subscriptions and the overlay; `resume()` re-measures and continues. `show()` adds an SVG debug overlay; `hide()` removes it. This is a geometry and event utility, not a DOM renderer.

| API                                                             | Result                                                   |
| --------------------------------------------------------------- | -------------------------------------------------------- |
| `new SafeZone(source, target, options?)`                        | Creates a zone monitor                                   |
| `on(name, handler, options?)` / `once(name, handler, options?)` | Subscribes to `enter`, `leave`, or `inside`              |
| `add(target)` / `remove(target)`                                | Changes the target elements                              |
| `measure()` / `contains(x, y)` / `update()`                     | Reads geometry or evaluates synchronously                |
| `show(options?)` / `hide()`                                     | Controls the SVG visualization                           |
| `close()`                                                       | Removes listeners, observers, overlay, and subscriptions |
| `pause()` / `resume()`                                          | Suspends or restarts zone monitoring                     |
| `SafeZoneError` / `SafeZoneErrorCode`                           | Error class and machine-readable error enum              |

## Viewport API

`Viewport` reads an element's current visual size and position and reports its movement and visibility. Measurements use `getBoundingClientRect()`, so CSS transforms are included. `IntersectionObserver` provides visibility updates when available; otherwise, the module estimates intersection with the viewport synchronously.

```ts
import { Viewport } from "html-tools/viewport";

const viewport = new Viewport(document.querySelector("main"), {
	threshold: 0.25,
	rootMargin: "100px",
});

console.log(viewport.size, viewport.position, viewport.visible);

viewport.on("resize", ({ size, previous }) => {
	console.log("size changed", previous, size);
});

viewport.on("move", ({ position, deltaX, deltaY, cause }) => {
	console.log("element moved", position, deltaX, deltaY, cause);
});

viewport.on("enter", ({ ratio, side }) => console.log("entered", ratio, side));
viewport.on("leave", ({ ratio, side }) => console.log("left", ratio, side));

viewport.close();
```

`move` events are coalesced to at most one check per animation frame and are triggered by relevant scroll, window resize, or element resize events. Use `poll: true` or call `update()` to detect position changes caused by transforms or animations that do not trigger browser events. Event-specific observers and listeners are active only while relevant subscriptions exist. `pause()` disconnects observers and listeners without cancelling subscriptions; `resume()` restores monitoring and resets movement baselines. `AbortSignal` can close the instance or cancel individual subscriptions.

| API                                                             | Result                                              |
| --------------------------------------------------------------- | --------------------------------------------------- |
| `new Viewport(element, options?)`                               | Creates a viewport monitor                          |
| `size` / `position` / `visible` / `ratio`                       | Reads current element geometry and visibility       |
| `snapshot()` / `update()`                                       | Reads all values or checks for changes immediately  |
| `on(name, handler, options?)` / `once(name, handler, options?)` | Subscribes to `resize`, `move`, `enter`, or `leave` |
| `off(name, handler?)` / `listenerCount(name?)`                  | Removes or counts event subscriptions               |
| `close()`                                                       | Disconnects observers and cancels subscriptions     |
| `pause()` / `resume()`                                          | Suspends or restores observers and event monitoring |
| `ViewportError` / `ViewportErrorCode`                           | Error class and machine-readable error enum         |

## Keyboard API

`Keyboard` registers typed shortcuts on an element, `document`, or `window`. Shortcut strings are normalized and validated at runtime, while TypeScript validates literal shortcuts and provides editor suggestions for individual keys and common modifier combinations. `pause()` detaches native keyboard listeners while retaining shortcuts and keypress subscriptions; `resume()` reattaches them.

```ts
import { Keyboard } from "html-tools/keyboard";

const keyboard = new Keyboard(document, {
	defaults: { preventDefault: true },
	shortcuts: {
		"ctrl+k": () => openCommandMenu(),
		escape: () => closeCommandMenu(),
	},
});

keyboard.on(["ctrl+shift+p", "meta+shift+p"], (event, context) => {
	console.log(context.shortcut, event.key);
});

const handle = keyboard.register("shift+enter", submitForm);
handle.enabled = false;
handle.close();

keyboard.keypress(({ key, combo, editable }) => {
	console.log({ key, combo, editable });
});

keyboard.close();
```

`on`, `once`, and `register` accept single keys (for example `"a"`, `"escape"`, or `"f5"`) and modifier combinations such as `"ctrl+k"`, `"shift+enter"`, and `"mod+shift+p"`. The exported `Shortcut` type provides finite editor completions for keys and combinations with up to three modifiers; literal strings outside those suggestions are still checked by `ValidShortcut` and validated at runtime when dynamic.

By default, shortcuts require an exact modifier match and ignore most printable keys from editable fields. Set `exact: false` to allow additional modifiers, configure `inputs` as `"allow"` or `"ignore"`, or use `match: "code"` for physical-key bindings such as WASD. `mod` resolves to Meta on Apple platforms and Ctrl elsewhere. IME composition and AltGr text input do not trigger shortcuts. Use `keypress()` when a handler should receive every normalized key event.

| API                                             | Result                                           |
| ----------------------------------------------- | ------------------------------------------------ |
| `new Keyboard(target, options?)`                | Creates a keyboard shortcut manager              |
| `on(shortcut, handler, options?)` / `once(...)` | Registers one or more typed shortcuts            |
| `register(shortcut, handler, options?)`         | Registers a shortcut with an enable/close handle |
| `keypress(handler, options?)`                   | Receives normalized keyboard events              |
| `off(shortcut?, handler?)` / `has(shortcut)`    | Removes or checks shortcut registrations         |
| `Keyboard.matches(event, shortcut, options?)`   | Tests an event without creating a listener       |
| `close()`                                       | Removes all listeners and shortcuts              |
| `pause()` / `resume()`                          | Suspends or restores native keyboard dispatch    |
| `KeyboardError` / `KeyboardErrorCode`           | Error class and machine-readable error enum      |

## Scheduler API

`Scheduler` creates cancelable timers and animation frame tasks, and provides debounced, throttled, and repeating callbacks. Timer, frame, and repeat handles expose `cancel()` and a `canceled` state. Debounced and throttled functions can be called directly or through `.call()`; they also expose `cancel()`, `flush()`, and `canceled`.

```ts
import { Scheduler } from "html-tools/scheduler";

const search = Scheduler.debounce((query: string) => runSearch(query), 300);
search.call("keyboard shortcuts");
search.cancel();

const scroll = Scheduler.throttle(() => updatePosition(), 100);
window.addEventListener("scroll", scroll);

const wait = Scheduler.delay(1000, () => showMessage());
wait.cancel();

const frame = Scheduler.raf((time) => render(time));
const afterPaint = Scheduler.nextFrame(() => measureLayout());

const interval = Scheduler.repeat(() => refresh(), 5000);
interval.pause();
interval.resume();
interval.cancel();
```

`delay(wait)` can also be used without a callback when only a cancelable wait is needed. `repeat(callback, interval, { immediate: true })` invokes once immediately and then on each interval. `raf` falls back to a short timer when animation frame APIs are unavailable.

| API                                     | Result                                                                                           |
| --------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `debounce(callback, wait)`              | Callable task that runs after calls stop, with `cancel()` and `flush()`                          |
| `throttle(callback, wait)`              | Callable task that runs immediately and at most once per interval, with `cancel()` and `flush()` |
| `delay(wait, callback?)`                | Cancelable one-shot timer with a promise that resolves on completion or cancellation             |
| `raf(callback)` / `nextFrame(callback)` | Cancelable animation frame / after-paint task                                                    |
| `repeat(callback, interval, options?)`  | Cancelable repeating task with `pause()` and `resume()`                                          |

## Design Principles

HTML Tools is built around a few core principles:

- **Expressiveness first:** APIs should be intuitive, readable, and easy to understand.
- **Independent modules:** Each utility should be usable without requiring the entire library.
- **Native foundations:** Build on browser APIs instead of unnecessarily reinventing them.
- **Lifecycle management:** Utilities that own resources such as listeners or observers should make cleanup explicit.
- **Predictable behavior:** Abstractions should remain transparent and avoid unexpected side effects.
- **Developer experience:** Prioritize simplicity and usability without neglecting performance.

## Browser Support

HTML Tools is designed for modern browsers with support for the native Web APIs used by its modules.

The Query API uses standard DOM APIs such as `querySelector`, `querySelectorAll`, `getElementById`, `closest`, and `matches`.

The Interaction API uses `addEventListener`, Pointer Events, `CustomEvent`, and `AbortSignal.

The Pointer API uses Pointer Events, pointer capture, and `AbortSignal.

The HTML API uses inert `<template>` parsing, DOM node creation, `addEventListener`, and `AbortSignal.`

The SafeZone API uses element geometry, `requestAnimationFrame`, `ResizeObserver`, pointer events, and SVG for its optional overlay.

The Viewport API uses element geometry, `IntersectionObserver`, `ResizeObserver`, scroll events, and `requestAnimationFrame`.

The Keyboard API uses native `keydown` and `keyup` events and does not depend on other HTML Tools modules.

## TypeScript Support

HTML Tools is written in TypeScript and ships with generated `.d.ts` declarations.

The Query API narrows known HTML and SVG tag names to their concrete element interfaces and supports optional runtime type filters through element constructors.

The Interaction API infers native event payloads from their names and types custom event details through the `Events` generic.

The Pointer API provides typed pointer samples and device-specific pointer kinds.

The HTML API exposes typed template options, event handlers, and `HtmlErrorCode` values.

The SafeZone API exposes typed sources, geometry, options, event payloads, and `SafeZoneErrorCode` values.

The Viewport API exposes typed measurements, event payloads, options, and `ViewportErrorCode` values.

The Keyboard API validates shortcut literals at compile time and provides typed handler payloads, options, and `KeyboardErrorCode` values.

## Contributing

Contributions, suggestions, and bug reports are welcome.

Before opening a pull request, run:

```bash
npm run check
npm test
npm run build
```

If you find an issue or have an idea for improving HTML Tools, feel free to open an issue or submit a pull request.

## License

[MIT](LICENSE)
