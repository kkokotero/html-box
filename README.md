<img src="./misc/banner.svg" alt="HTML Box" />

<p align="center">
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT license" /></a>
  <a href="https://www.npmjs.com/package/html-box"><img src="https://img.shields.io/npm/v/html-box.svg" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/html-box"><img src="https://img.shields.io/npm/dm/html-box.svg" alt="monthly downloads" /></a>
</p>

# HTML Box

Small, typed utilities for everyday DOM work. Pick the modules you need and import them directly; there is no all-in-one entry point.

## Install

```bash
npm install html-box
```

## Modules

| Import                     | What it helps with                               |
| -------------------------- | ------------------------------------------------ |
| `html-box/query`           | Find and scope DOM queries                       |
| `html-box/reactive`        | Manage reactive values and derived state         |
| `html-box/element`         | Create and manipulate HTML and SVG elements      |
| `html-box/form`            | Read, reset, validate, and serialize forms       |
| `html-box/html`            | Render safe, typed HTML templates                |
| `html-box/interaction`     | Manage DOM events and common gestures            |
| `html-box/keyboard`        | Register typed keyboard shortcuts                |
| `html-box/pointer`         | Track pointer input and positions                |
| `html-box/safe-zone`       | Detect when a pointer or element enters a region |
| `html-box/viewport`        | Read and observe element geometry                |
| `html-box/scheduler`       | Schedule, repeat, and cancel work                |
| `html-box/view-transition` | Animate DOM updates with the View Transition API |
| `html-box/browser`         | Read device, screen, and network information     |

## Quick start

```ts
import { Interaction } from "html-box/interaction";
import { Query } from "html-box/query";

const button = Query.one("button[data-save]");

if (button) {
	const interaction = new Interaction(button);
	interaction.on("click", () => save());

	// Call when the feature is no longer active.
	interaction.close();
}
```

## Working with elements

`Query` returns `undefined` or an empty list when there is no match. Use `must` when a missing element should be treated as an error. Known tag names infer their element types, and `Query.from(root)` creates a reusable scope.

```ts
import { Query } from "html-box/query";

const form = Query.must("form");
const email = Query.one("input", HTMLInputElement);
const buttons = Query.from(form).all("button");
```

`Element` covers common operations and keeps HTML and SVG creation separate so SVG nodes get the correct namespace.

```ts
import { Element } from "html-box/element";

const svg = Element.createSvg("svg");
const circle = Element.createSvg("circle");
Element.setAttributes(circle, { cx: 12, cy: 12, r: 10, fill: "currentColor" });
Element.append(svg, circle);
```

Other helpers include `create`, `createNS`, `clone`, `replace`, `remove`, `empty`, and `contains`.

## Forms

`Form.values(form)` follows the browser's successful-control rules: disabled controls and unchecked checkboxes are omitted, repeated names become arrays, and file inputs remain `File` objects. `validate` uses native constraint validation; pass `true` to show the browser's validation UI. `reset` restores default values.

```ts
import { Form } from "html-box/form";

const form = document.querySelector("form");

if (form) {
	const values = Form.values(form);
	const query = Form.serialize(form); // URLSearchParams

	if (!Form.validate(form)) Form.validate(form, true);
}
```

URL-encoded serialization contains file names, not file contents. Use the browser's `new FormData(form)` when uploading files.

## Safe HTML templates

The `html` tag creates DOM nodes without treating interpolated strings as markup. Use `html.fragment` for multiple roots and `createHtml` to share an `AbortSignal` across event listeners.

```ts
import { html, unsafeHtml } from "html-box/html";

const label = "Profile";
const view = html`<button class="tab" @click=${openProfile}>${label}</button>`;
const trusted = html`<article>${unsafeHtml(trustedMarkup)}</article>`;
```

`unsafeHtml` is an explicit escape hatch for trusted markup. Never pass user-provided content to it. The renderer blocks scripts, inline event-handler attributes, unsafe URL schemes, and unsafe property bindings. It renders once; it is not a reactive framework.

## Events and input

`Interaction` groups listeners for a target. It supports native events, delegation, custom typed events, and `hover`, `long-press`, and `outside-click` gestures. Event aliases use kebab case, such as `key-down` and `double-click`.

```ts
import { Interaction } from "html-box/interaction";

const interaction = new Interaction(document.body);
interaction.on("long-press", (event) => console.log(event.duration), {
	delay: 600,
});

interaction.pause(); // Temporarily stop dispatch
interaction.resume();
interaction.close(); // Remove subscriptions permanently
```

`Keyboard` handles single keys and combinations with typed suggestions. For example: `"escape"`, `"a"`, `"ctrl+k"`, and `"mod+shift+p"`. By default, printable shortcuts are ignored in editable fields; configure `inputs` when needed. `mod` maps to Meta on Apple platforms and Ctrl elsewhere.

```ts
import { Keyboard } from "html-box/keyboard";

const keyboard = new Keyboard(document);
keyboard.on("mod+k", () => openCommandMenu());
keyboard.pause();
keyboard.resume();
keyboard.close();
```

`Pointer` tracks pointer events on one element. Its samples include viewport and element coordinates, movement, pressure, buttons, and pointer type. It also provides pointer capture and proximity helpers. `touchAction` can temporarily control browser touch gestures and is restored on pause or close.

```ts
import { Pointer } from "html-box/pointer";

const pointer = new Pointer(canvas, { capture: true, touchAction: "none" });
pointer.on("move", ({ localX, localY }) => drawAt(localX, localY));
pointer.close();
```

## Geometry

`SafeZone` watches whether a pointer, element, or custom point is inside one or more target elements. It supports padding, delayed transitions, and optional SVG visualization. `update()` forces an immediate measurement.

```ts
import { SafeZone } from "html-box/safe-zone";

const zone = new SafeZone("pointer", [trigger, menu], {
	padding: 8,
	leaveDelay: 150,
});
zone.on("leave", closeMenu);
zone.close();
```

`Viewport` reads an element's size, position, and visibility. It observes resize and visibility changes, and reports movement on relevant scroll or resize events. Use `poll: true` or `update()` for movement caused by transforms or animation that does not trigger those events.

```ts
import { Viewport } from "html-box/viewport";

const viewport = new Viewport(panel);
viewport.on("resize", ({ size }) => console.log(size));
viewport.on("move", ({ position }) => console.log(position));
viewport.close();
```

## Browser capabilities

`Browser.device`, `Browser.screen`, and `Browser.network` expose live device, display, and connection information. Their event listeners attach browser resources only while subscribed. `Browser.open()` creates a window handle, and `Browser.channel()` provides typed messaging between same-origin tabs.

```ts
import { Browser } from "html-box/browser";

const isOnline = Browser.network.online;
const device = Browser.device.info;
const subscription = Browser.screen.on("resize", ({ viewport }) => {
	console.log(viewport.width, viewport.height);
});

subscription.cancel();
```

## Scheduling

All scheduler operations can be canceled. Debounced and throttled tasks are callable and also expose `.call()`, `.cancel()`, and `.flush()`. `delay` returns a handle with an awaitable `promise`; canceling it resolves that promise. `repeat` can be paused and resumed.

```ts
import { Scheduler } from "html-box/scheduler";

const search = Scheduler.debounce(runSearch, 300);
search("query");
search.cancel();

const frame = Scheduler.raf(render);
const delayed = Scheduler.delay(1000);
const interval = Scheduler.repeat(refresh, 5000);
interval.pause();
interval.resume();
interval.cancel();
```

`Scheduler.nextFrame` runs after two animation frames. `raf` uses a timer fallback where animation frame APIs are unavailable.

## Reactive values

`Reactive` stores values without proxies or automatic dependency tracking. Update values with `set`, `update`, `patch`, or `mutate`; subscriptions run synchronously, and `batch` groups related changes. Derived values declare their sources explicitly and are read-only.

```ts
import { Reactive } from "html-box/reactive";

const price = Reactive.create(12);
const quantity = Reactive.create(2);
const total = Reactive.derive(
	[price, quantity],
	(unitPrice, count) => unitPrice * count,
);

total.subscribe((value) => console.log(value));
Reactive.batch(() => {
	price.set(15);
	quantity.set(3);
}); // Notifies once with 45

total.close();
```

Subscriptions and derived values can be paused or closed when no longer needed. Direct object mutations are not observed; use `mutate()` to change an object in place and notify subscribers.

## View transitions

`ViewTransition` wraps the browser View Transition API for document or element scopes. It returns the native transition instance, supports transition types and lifecycle callbacks, and respects `prefers-reduced-motion` by default. When the API is unavailable, the DOM update still runs without animation and `ready` rejects with an `AbortError`, so animation code can be skipped safely.

```ts
import { ReducedMotion, ViewTransition } from "html-box/view-transition";

const transition = ViewTransition.start(() => renderPage(), {
	types: ["navigation"],
	reducedMotion: ReducedMotion.Respect,
});

await transition.ready.then(animatePseudoElements, () => {});
ViewTransition.skip();
```

### Styling with CSS

The first transition type is also applied to the transition host as its CSS `view-transition-name`. For document transitions the host is the root element; for `start(element, ...)` it is the element. With `start(from, to, ...)`, the type is applied to both elements at their respective capture phases. This lets CSS reuse the type name directly:

```ts
ViewTransition.start(update, { types: ["navigation"] });
```

```css
::view-transition-old(navigation) {
	animation: fade-out 160ms ease-out;
}

::view-transition-new(navigation) {
	animation: fade-in 220ms ease-in;
}
```

Without `types`, the browser's default `root` name is used. Pass `name` to choose a different CSS name, or `name: null` to keep the names declared in your stylesheet:

```ts
ViewTransition.start(update, { types: ["navigation"], name: "page" });
ViewTransition.start(element, update, { name: null });
```

For shared-element transitions, pass the outgoing and incoming elements. The same type name is applied to `from` before the old snapshot and to `to` after the update callback, so both sides match:

```ts
ViewTransition.start(fromCard, toCard, update, { types: ["card"] });
```

Both arguments must be elements. `to` can be detached or hidden before the update, but the callback must insert it before it resolves.

```css
::view-transition-group(card) {
	animation-duration: 300ms;
}

::view-transition-old(card) {
	animation: slide-out 300ms ease;
}

::view-transition-new(card) {
	animation: slide-in 300ms ease;
}
```

Transition types also scope styles to a specific call:

```css
html:active-view-transition-type(navigation)::view-transition-old(navigation) {
	animation-name: slide-out;
}
```

### Interaction during transitions

By default the page remains interactive while the animation runs. The wrapper adds `::view-transition { pointer-events: none; }` once, so pointer input reaches the app instead of being captured by the transition overlay. Set `interactive: false` if your CSS already handles this.

If you use `ReducedMotion.Ignore`, disable animations in CSS when the user prefers reduced motion:

```css
@media (prefers-reduced-motion: reduce) {
	::view-transition-group(*),
	::view-transition-old(*),
	::view-transition-new(*) {
		animation: none !important;
	}
}
```

View transition names must be unique in the rendered document. Element-scoped transitions only capture the element subtree, but their names follow the same rule.

## Lifecycle and environments

Subscriptions can usually be canceled individually. Long-lived managers expose `close()`; `Interaction`, `Keyboard`, `Pointer`, `SafeZone`, and `Viewport` also expose `pause()` and `resume()` to suspend work without discarding subscriptions. Where supported, APIs accept an `AbortSignal` for cleanup.

Modules are designed for browser use. `Query` can be imported without a DOM, but operations that create or inspect elements need browser DOM APIs. Pointer, geometry, and frame behavior depend on the corresponding browser APIs; `Viewport` and `Scheduler.raf` include fallbacks for selected APIs.

## TypeScript

HTML Box ships TypeScript declarations. Tag-based queries, HTML and SVG creation, keyboard shortcuts, event payloads, form values, and module-specific error codes are typed. Dynamic strings are still checked at runtime where compile-time validation is not possible.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the development workflow, [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for community expectations, and [SECURITY.md](SECURITY.md) to report a vulnerability privately.

```bash
npm run check
npm test
npm run build
```

Bug reports and contributions are welcome.

## License

[MIT](LICENSE)
