import { beforeEach, describe, expect, it } from "vitest";

import { Query, QueryError, QueryErrorCode } from "../src";

const FIXTURE = `
	<main id="app">
		<h1 id="title">Title</h1>
		<form id="form">
			<input id="email" class="field" type="email" />
			<button id="submit" class="field" type="submit">Send</button>
		</form>
		<ul id="list">
			<li class="item">One</li>
			<li class="item">Two</li>
			<li class="item">Three</li>
		</ul>
		<svg><circle id="circle"></circle></svg>
	</main>
`;

const getError = (fn: () => void): unknown => {
	try {
		fn();
	} catch (error) {
		return error;
	}
	return undefined;
};

beforeEach(() => {
	document.body.innerHTML = FIXTURE;
});

describe("Query", () => {
	it("selects elements and reports their presence", () => {
		expect(Query.one("li")).toBeInstanceOf(HTMLLIElement);
		expect(Query.one("li")?.textContent).toBe("One");
		expect(Query.all("li")).toHaveLength(3);
		expect(Query.byId("title")).toBeInstanceOf(HTMLHeadingElement);
		expect(Query.exists(".item")).toBe(true);
		expect(Query.count("li")).toBe(3);
		expect(Query.exists(".missing")).toBe(false);
		expect(Query.count(".missing")).toBe(0);
	});

	it("supports typed results", () => {
		const input = Query.one("#email", HTMLInputElement);
		const inputs = Query.all(".field", HTMLInputElement);

		expect(input).toBeInstanceOf(HTMLInputElement);
		expect(inputs).toHaveLength(1);
		expect(Query.one("#email", HTMLButtonElement)).toBeUndefined();
		expect(Query.byId("email", HTMLInputElement)).toBeInstanceOf(
			HTMLInputElement,
		);
		expect(Query.byId("email", HTMLButtonElement)).toBeUndefined();
		expect(Query.must("input", HTMLInputElement)).toBeInstanceOf(
			HTMLInputElement,
		);
	});

	it("supports indexed helpers", () => {
		expect(Query.first("li")?.textContent).toBe("One");
		expect(Query.last("li")?.textContent).toBe("Three");
		expect(Query.at("li", 1)?.textContent).toBe("Two");
		expect(Query.at("li", -1)?.textContent).toBe("Three");
		expect(Query.at("li", 3)).toBeUndefined();
		expect(Query.at("li", -4)).toBeUndefined();
		expect(Query.first(".missing")).toBeUndefined();
		expect(Query.last(".missing")).toBeUndefined();
	});

	it("requires elements and reports missing matches", () => {
		expect(Query.must("li")).toBeInstanceOf(HTMLLIElement);
		expect(Query.mustById("title")).toBeInstanceOf(HTMLHeadingElement);

		const missing = getError(() => Query.must(".missing"));
		expect(missing).toBeInstanceOf(QueryError);
		expect(missing).toMatchObject({
			code: QueryErrorCode.NotFound,
			selector: ".missing",
		});

		const missingId = getError(() => Query.mustById("missing"));
		expect(missingId).toBeInstanceOf(QueryError);
		expect(missingId).toMatchObject({
			code: QueryErrorCode.NotFound,
			selector: "#missing",
		});

		const wrongType = getError(() => Query.must("button", HTMLInputElement));
		expect(wrongType).toBeInstanceOf(QueryError);
		expect(wrongType).toMatchObject({ code: QueryErrorCode.NotFound });
	});

	it("validates IDs", () => {
		expect(Query.byId("missing")).toBeUndefined();
		expect(Query.existsById("title")).toBe(true);
		expect(Query.existsById("missing")).toBe(false);

		const emptyId = getError(() => Query.byId(""));
		expect(emptyId).toBeInstanceOf(QueryError);
		expect(emptyId).toMatchObject({
			code: QueryErrorCode.InvalidSelector,
		});

		const missingId = getError(() => Query.mustById("missing"));
		expect(missingId).toBeInstanceOf(QueryError);
		expect(missingId).toMatchObject({
			code: QueryErrorCode.NotFound,
			selector: "#missing",
		});
	});

	it("reports invalid selectors", () => {
		for (const selector of ["", "   ", "["]) {
			const error = getError(() => Query.one(selector));
			expect(error).toBeInstanceOf(QueryError);
			expect(error).toMatchObject({
				code: QueryErrorCode.InvalidSelector,
				selector,
			});
		}
	});

	it("keeps document scopes live", () => {
		const scope = Query.from(document);
		const extra = document.createElement("li");
		extra.textContent = "Four";

		expect(scope.root).toBe(document);
		expect(scope.all("li")).toHaveLength(3);

		document.body.append(extra);
		expect(scope.all("li")).toHaveLength(4);
		expect(scope.last("li")?.textContent).toBe("Four");
	});

	it("scopes queries to document fragments", () => {
		const fragment = document.createDocumentFragment();
		const item = document.createElement("li");
		item.textContent = "Fragment";
		fragment.append(item);

		const scope = Query.from(fragment);
		expect(scope.root).toBe(fragment);
		expect(scope.one("li")?.textContent).toBe("Fragment");
		expect(scope.all("li")).toHaveLength(1);
	});

	it("supports element-relative traversal", () => {
		const list = Query.must("ul");
		const scope = Query.from(list);

		expect(scope.root).toBe(list);
		expect(scope.one("li")?.textContent).toBe("One");
		expect(scope.closest("main")).toBe(Query.one("main"));
		expect(scope.closest("body")).toBe(document.body);
		expect(scope.parent()).toBe(Query.one("main"));
		expect(scope.contains(scope.one("li"))).toBe(true);
		expect(scope.contains(document.body)).toBe(false);
		expect(scope.matches("#list")).toBe(true);
		expect(scope.matches(".missing")).toBe(false);
	});

	it("returns empty results for missing roots", () => {
		const scope = Query.from(null);

		expect(scope.root).toBeUndefined();
		expect(scope.one("li")).toBeUndefined();
		expect(scope.all("li")).toEqual([]);
		expect(scope.closest("main")).toBeUndefined();
		expect(scope.parent()).toBeUndefined();
		expect(scope.contains(document.body)).toBe(false);
		expect(scope.matches("#app")).toBe(false);

		expect(getError(() => scope.one(""))).toBeInstanceOf(QueryError);
		expect(getError(() => scope.closest(""))).toBeInstanceOf(QueryError);
		expect(getError(() => scope.matches(""))).toBeInstanceOf(QueryError);
	});

	it("throws from strict methods when the root is empty", () => {
		const scope = Query.from(null);
		const error = getError(() => scope.must("li"));

		expect(error).toBeInstanceOf(QueryError);
		expect(error).toMatchObject({
			code: QueryErrorCode.NotFound,
			selector: "li",
		});
	});

	it("narrows known SVG tag names", () => {
		const circle = Query.one("circle");

		expect(circle?.tagName.toLowerCase()).toBe("circle");
		expect(Query.all("circle")).toHaveLength(1);
	});
});
