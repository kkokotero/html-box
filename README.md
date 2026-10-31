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

HTML Tools is a collection of lightweight, independent utilities for DOM work. The current release provides the Query API for selector-based lookups and the Interaction API for native events, delegated listeners, and built-in gestures.

## Installation

```bash
npm install html-tools
```

## Query API

`Query` is a document-backed query scope. It returns `undefined` or an empty array when no element matches, and it is safe to call in environments without a DOM.

### Basic queries

```ts
import { Query } from "html-tools";

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
import { hasDocument, Query } from "html-tools";

const button = Query.one("button"); // undefined without a DOM

if (hasDocument) {
	console.log(document.title);
}
```

`hasDocument` is evaluated when the module loads.

## Interaction API

`Interaction` groups listeners for a single target. Native events use kebab-case aliases such as `double-click` and `key-down`. Every registration returns a subscription that can be cancelled independently, and `close()` cancels every listener owned by the instance.

### Native events

```ts
import { Interaction } from "html-tools";

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

| Method                          | Result                                                    |
| ------------------------------- | --------------------------------------------------------- |
| `on(name, handler, options?)`   | Registers a listener and returns a `Subscription`         |
| `once(name, handler, options?)` | Registers a listener that runs at most once               |
| `off(name, handler?)`           | Removes listeners for an event                            |
| `emit(name, detail?, init?)`    | Dispatches a typed `CustomEvent` from the target          |
| `close()`                       | Cancels all listeners and marks the interaction as closed |

## Pointer API

`Pointer` tracks Pointer Events on one element and provides typed samples with viewport, document, and element-local coordinates. Samples also include movement, displacement, pressure, button state, and pointer type. The API supports mouse, pen, and touch input.

### Tracking pointer events

```ts
import { Pointer } from "html-tools";

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

`primaryOnly` defaults to `true`, and `types` defaults to all pointer kinds. `touchAction` temporarily sets the target's CSS `touch-action` value and restores the previous value when the instance closes.

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

| Member | Result |
| --- | --- |
| `on(name, handler, options?)` / `once(name, handler, options?)` | Subscribe to typed pointer samples |
| `off(name, handler?)` | Remove listeners for an event |
| `position` / `pointers` / `pressed` | Read current pointer state |
| `capture(id?)` / `release(id?)` / `hasCapture(id?)` | Manage pointer capture |
| `proximity(element, options?)` / `nearest(elements, options?)` | Measure pointer proximity |
| `listenerCount(name?)` | Count active listeners |
| `close()` | Remove listeners and release owned resources |

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

The Interaction API uses `addEventListener`, Pointer Events, `CustomEvent`, and `AbortSignal`.

## TypeScript Support

HTML Tools is written in TypeScript and ships with generated `.d.ts` declarations.

The Query API narrows known HTML and SVG tag names to their concrete element interfaces and supports optional runtime type filters through element constructors.

The Interaction API infers native event payloads from their names and types custom event details through the `Events` generic.

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
