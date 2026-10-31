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

HTML Tools is a collection of lightweight, independent utilities for DOM work. The current release provides the Query API: a consistent, type-safe interface for selector-based lookups across documents, document fragments, and elements.

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

## TypeScript Support

HTML Tools is written in TypeScript and ships with generated `.d.ts` declarations.

The Query API narrows known HTML and SVG tag names to their concrete element interfaces and supports optional runtime type filters through element constructors.

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
