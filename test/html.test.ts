import { describe, expect, it, vi } from "vitest";

import {
	createHtml,
	HtmlError,
	HtmlErrorCode,
	html,
	TrustedHtml,
	unsafeHtml,
} from "../src/html";

describe("HTML template API", () => {
	describe("error codes", () => {
		it("exposes stable string enum values", () => {
			expect(HtmlErrorCode.NotATemplate).toBe("NOT_A_TEMPLATE");
			expect(HtmlErrorCode.NoDom).toBe("NO_DOM");
			expect(HtmlErrorCode.InvalidPosition).toBe("INVALID_POSITION");
			expect(HtmlErrorCode.InvalidValue).toBe("INVALID_VALUE");
			expect(HtmlErrorCode.InvalidName).toBe("INVALID_NAME");
			expect(HtmlErrorCode.InvalidRoot).toBe("INVALID_ROOT");
			expect(HtmlErrorCode.UnsafeUrl).toBe("UNSAFE_URL");
			expect(HtmlErrorCode.UnsafeAttribute).toBe("UNSAFE_ATTRIBUTE");
			expect(HtmlErrorCode.UnsafeProperty).toBe("UNSAFE_PROPERTY");
			expect(HtmlErrorCode.UnsafeElement).toBe("UNSAFE_ELEMENT");
		});

		it("stores its code on HtmlError", () => {
			const error = new HtmlError(HtmlErrorCode.InvalidValue, "Invalid value.");
			expect(error).toBeInstanceOf(Error);
			expect(error.name).toBe("HtmlError");
			expect(error.code).toBe(HtmlErrorCode.InvalidValue);
		});
	});

	describe("root and child rendering", () => {
		it("renders a single root and inserts strings as text", () => {
			const text = "<img src=x onerror=alert(1)>";
			const element = html`<p>${text}</p>`;
			expect(element.tagName).toBe("P");
			expect(element.textContent).toBe(text);
			expect(element.querySelector("img")).toBeNull();
		});

		it("renders multiple roots in a fragment", () => {
			const fragment = html.fragment`<h1>Title</h1>
				${"body"}
				<p>End</p>`;
			expect(fragment.childNodes.length).toBeGreaterThanOrEqual(3);
			expect(fragment.querySelector("h1")?.textContent).toBe("Title");
			expect(fragment.querySelector("p")?.textContent).toBe("End");
			expect(fragment.textContent).toContain("body");
		});

		it("ignores top-level whitespace and comments", () => {
			const element = html`
				<!-- comment -->
				<div>root</div>
			`;
			expect(element.tagName).toBe("DIV");
		});

		it("rejects templates without exactly one root", () => {
			expect(() => html``).toThrowError(HtmlError);
			expect(() => html`<i></i><b></b>`).toThrowError(HtmlError);
			expect(
				() =>
					html`text
						<div></div>`,
			).toThrowError(HtmlError);
		});

		it("requires tagged template invocation", () => {
			expect(() =>
				(html as unknown as (markup: string) => Element)("<p />"),
			).toThrowError(HtmlError);
		});

		it("renders primitives, omits nullish and boolean values, and flattens iterables", () => {
			const node = document.createElement("em");
			node.textContent = "node";
			const element = html`<div>
				${["a", [node, "b", null, false]]}${7}${9n}
			</div>`;
			expect(element.textContent).toContain("anodeb79");
			expect(element.querySelector("em")).toBe(node);
		});

		it("parses explicitly trusted markup", () => {
			const trusted = unsafeHtml("<strong>trusted</strong>");
			expect(trusted).toBeInstanceOf(TrustedHtml);
			expect(
				html`<div>${trusted}</div>`.querySelector("strong")?.textContent,
			).toBe("trusted");
			expect(() => unsafeHtml(1 as never)).toThrowError(HtmlError);
		});

		it("rejects unsupported values and deeply nested iterables", () => {
			expect(() => html`<div>${{ value: 1 }}</div>`).toThrowError(HtmlError);
			let value: unknown = "end";
			for (let index = 0; index < 35; index++) value = [value];
			expect(() => html`<div>${value}</div>`).toThrowError(HtmlError);
		});
	});

	describe("attribute and property bindings", () => {
		it("renders primitive attributes and mixed static segments", () => {
			const element = html`<div
				data-count=${3}
				class="item ${"active"} ${false}"
			></div>`;
			expect(element.getAttribute("data-count")).toBe("3");
			expect(element.getAttribute("class")).toBe("item active false");
		});

		it("removes null whole attributes and empties nullish segments", () => {
			const element = html`<div
				title=${null}
				class="before${undefined}after"
			></div>`;
			expect(element.hasAttribute("title")).toBe(false);
			expect(element.getAttribute("class")).toBe("beforeafter");
		});

		it("requires primitive values for regular attributes", () => {
			expect(() => html`<div title=${{ value: 1 }}></div>`).toThrowError(
				HtmlError,
			);
		});

		it("toggles boolean attributes and assigns safe properties", () => {
			const enabled = html`<button ?disabled=${true}></button>`;
			const disabled = html`<button ?disabled=${false}></button>`;
			const state = { ready: true };
			const element = html`<div
				.customState=${state}
			></div>` as HTMLDivElement & { customState: typeof state };
			expect(enabled.hasAttribute("disabled")).toBe(true);
			expect(disabled.hasAttribute("disabled")).toBe(false);
			expect(element.customState).toBe(state);
		});

		it("allows relative and raster-image data URLs", () => {
			expect(html`<a href=${"/path"}></a>`.getAttribute("href")).toBe("/path");
			expect(
				html`<img src=${"data:image/png;base64,AAAA"} />`.getAttribute("src"),
			).toBe("data:image/png;base64,AAAA");
		});
	});

	describe("event bindings", () => {
		it("supports function and EventListenerObject handlers", () => {
			const functionHandler = vi.fn<() => void>();
			const objectHandler = vi.fn<() => void>();
			const button = html`<button
				@click=${functionHandler}
				@focus=${{ handleEvent: objectHandler }}
			></button>`;
			button.dispatchEvent(new MouseEvent("click"));
			button.dispatchEvent(new FocusEvent("focus"));
			expect(functionHandler).toHaveBeenCalledTimes(1);
			expect(objectHandler).toHaveBeenCalledTimes(1);
		});

		it("supports once, capture, prevent, stop, and passive modifiers", () => {
			const parentHandler = vi.fn<() => void>();
			const handler = vi.fn<() => void>();
			const parent = document.createElement("div");
			parent.addEventListener("click", parentHandler);
			const button = html`<button
				@click.once.prevent.stop.capture=${handler}
			></button>`;
			parent.append(button);
			const event = new MouseEvent("click", {
				bubbles: true,
				cancelable: true,
			});
			button.dispatchEvent(event);
			button.dispatchEvent(
				new MouseEvent("click", { bubbles: true, cancelable: true }),
			);
			expect(handler).toHaveBeenCalledTimes(1);
			expect(parentHandler).toHaveBeenCalledTimes(1);
			expect(handler).toHaveBeenCalledTimes(1);
		});

		it("skips nullish handlers and rejects unsupported handler values", () => {
			const button = html`<button @click=${null}></button>`;
			expect(() => button.dispatchEvent(new MouseEvent("click"))).not.toThrow();
			expect(() => html`<button @click=${"invalid"}></button>`).toThrowError(
				HtmlError,
			);
		});

		it("removes listeners when the configured signal aborts", () => {
			const controller = new AbortController();
			const configuredHtml = createHtml({ signal: controller.signal });
			const handler = vi.fn<() => void>();
			const button = configuredHtml`<button @click=${handler}></button>`;
			controller.abort();
			button.dispatchEvent(new MouseEvent("click"));
			expect(handler).not.toHaveBeenCalled();
		});
	});

	describe("validation and security", () => {
		it("rejects interpolation in unsupported contexts", () => {
			expect(() => html`<${"div"}></div>`).toThrowError(HtmlError);
			expect(() => html`<div ${"title"}="x"></div>`).toThrowError(HtmlError);
			expect(
				() =>
					html`<!-- ${"value"} -->
						<p></p>`,
			).toThrowError(HtmlError);
			expect(
				() =>
					html`<style>
						${"body{}"}
					</style>`,
			).toThrowError(HtmlError);
		});

		it("blocks script elements, inline event attributes, and srcdoc", () => {
			expect(
				() =>
					html`<script>
						alert(1);
					</script>`,
			).toThrowError(HtmlError);
			expect(() => html`<img onerror="alert(1)" />`).toThrowError(HtmlError);
			expect(() => html`<iframe srcdoc="<p>x</p>"></iframe>`).toThrowError(
				HtmlError,
			);
		});

		it("rejects unsafe URL schemes and accepts safe ones", () => {
			expect(() => html`<a href=${"javascript:alert(1)"}></a>`).toThrowError(
				HtmlError,
			);
			expect(() => html`<img src="java${"script"}:alert(1)" />`).toThrowError(
				HtmlError,
			);
			expect(() => html`<a .href=${"data:text/html,evil"}></a>`).toThrowError(
				HtmlError,
			);
			expect(() => html`<a href="java	script:alert(1)"></a>`).toThrowError(
				HtmlError,
			);
		});

		it("blocks dangerous property names and malformed event modifiers", () => {
			expect(() => html`<div .innerHTML=${"<img>"}></div>`).toThrowError(
				HtmlError,
			);
			expect(
				() => html`<div .onclick=${vi.fn<() => void>()}></div>`,
			).toThrowError(HtmlError);
			expect(
				() => html`<button @click.unknown=${vi.fn<() => void>()}></button>`,
			).toThrowError(HtmlError);
		});
	});
});
