import { describe, expect, it } from "vitest";

import { Element } from "../src/element";

describe("Element", () => {
	it("creates detached elements with inferred DOM types", () => {
		const button = Element.create("button");
		button.type = "button";
		expect(button).toBeInstanceOf(HTMLButtonElement);
		expect(button.isConnected).toBe(false);
	});

	it("creates correctly namespaced, typed SVG elements", () => {
		const svg = Element.createSvg("svg");
		const circle = Element.createSvg("circle");
		svg.append(circle);

		expect(svg).toBeInstanceOf(SVGSVGElement);
		expect(circle.namespaceURI).toBe("http://www.w3.org/2000/svg");
		expect(circle.ownerSVGElement).toBe(svg);
	});

	it("creates elements in arbitrary namespaces", () => {
		const custom = Element.createNS("urn:example", "widget");
		expect(custom.namespaceURI).toBe("urn:example");
		expect(custom.localName).toBe("widget");
	});

	it("removes elements and returns the same reference", () => {
		const element = document.createElement("div");
		document.body.append(element);

		expect(Element.remove(element)).toBe(element);
		expect(element.isConnected).toBe(false);
		Element.remove(element);
		expect(element.isConnected).toBe(false);
	});

	it("replaces an element and returns the detached original", () => {
		const current = document.createElement("div");
		const next = document.createElement("button");
		document.body.append(current);

		expect(Element.replace(current, next)).toBe(current);
		expect(document.body.lastElementChild).toBe(next);
		expect(current.isConnected).toBe(false);
	});

	it("clones elements deeply by default or shallowly on request", () => {
		const element = document.createElement("section");
		element.innerHTML = "<span>content</span>";
		const deepClone = Element.clone(element);
		const shallowClone = Element.clone(element, false);

		expect(deepClone).not.toBe(element);
		expect(deepClone.innerHTML).toBe("<span>content</span>");
		expect(shallowClone.childNodes).toHaveLength(0);
		expect(deepClone.isConnected).toBe(false);
	});

	it("appends nodes and text and can clear an element", () => {
		const container = document.createElement("div");
		const child = document.createElement("span");
		expect(Element.append(container, child, "text")).toBe(container);
		expect(container.childNodes).toHaveLength(2);
		expect(container.textContent).toBe("text");
		expect(Element.empty(container)).toBe(container);
		expect(container.childNodes).toHaveLength(0);
	});

	it("checks containment including the parent itself", () => {
		const parent = document.createElement("div");
		const child = document.createElement("span");
		parent.append(child);
		expect(Element.contains(parent, parent)).toBe(true);
		expect(Element.contains(parent, child)).toBe(true);
		expect(Element.contains(child, parent)).toBe(false);
	});

	it("sets and removes regular and namespaced SVG attributes", () => {
		const use = Element.createSvg("use");
		Element.setAttributes(use, {
			width: 24,
			"xlink:href": "#icon",
			focusable: false,
			"aria-hidden": true,
		});

		expect(use.getAttribute("width")).toBe("24");
		expect(use.getAttributeNS("http://www.w3.org/1999/xlink", "href")).toBe(
			"#icon",
		);
		expect(use.hasAttribute("focusable")).toBe(false);
		expect(use.getAttribute("aria-hidden")).toBe("");
		Element.setAttributes(use, { "xlink:href": null });
		expect(use.hasAttributeNS("http://www.w3.org/1999/xlink", "href")).toBe(
			false,
		);
	});
});
