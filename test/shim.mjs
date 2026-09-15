/**
 * Test shim: a zero-dependency stand-in for the two things the browser half
 * needs and Node does not have — React, and the page the bundle is loaded into.
 *
 * Nothing here touches a global. The client bundle is compiled with
 * `new Function` and handed `window`, `document`, `location`, `caches`,
 * `fetch`, `setTimeout` and `clearTimeout` as parameters, so the bundle's bare
 * references resolve to these stubs while the real globals — including the
 * test runner's own timers — stay untouched.
 *
 * The React stand-in implements only what a function component in this plugin
 * uses (useState, useCallback, useEffect, useRef, useMemo, useId) plus the
 * element shape `react.createElement` produces. Rendering is the element tree
 * being walked: components are called, and host elements are serialized to
 * text so tests can assert on markup.
 */
import { readFileSync } from "node:fs";

/** Parameter names passed to the compiled bundle, in order. */
const SANDBOX_PARAMS = ["require", "window", "document", "location", "caches", "fetch", "setTimeout", "clearTimeout"];

/** Serialize an element tree to markup (components are called, not mounted). */
export function toText(node) {
	if (node === null || node === undefined || typeof node === "boolean") return "";
	if (typeof node === "string" || typeof node === "number") return String(node);
	if (Array.isArray(node)) return node.map(toText).join("");
	const { type, props } = node;
	if (typeof type === "function") return toText(type(props));
	const attrs = Object.entries(props)
		.filter(([key, value]) => key !== "children" && typeof value !== "function" && value !== undefined)
		.map(([key, value]) => (value === true ? ` ${key}` : ` ${key}="${String(value)}"`))
		.join("");
	return `<${type}${attrs}>${toText(props.children)}</${type}>`;
}

/** Every host element of one tag, in document order. */
export function collect(node, tag, out = []) {
	if (node === null || node === undefined || typeof node === "boolean") return out;
	if (Array.isArray(node)) {
		for (const child of node) collect(child, tag, out);
		return out;
	}
	if (typeof node !== "object") return out;
	const { type, props } = node;
	if (typeof type === "function") return collect(type(props), tag, out);
	if (type === tag) out.push(node);
	collect(props.children, tag, out);
	return out;
}

/** A fresh hook store. One per scenario, so a re-render keeps the state a click produced. */
export function createHooks() {
	return { cells: [], index: 0 };
}

/** Build the React stand-in bound to a hook store. */
export function createReact(getRuntime) {
	const at = (fallback) => {
		const runtime = getRuntime();
		const slot = runtime.index++;
		if (!(slot in runtime.cells)) runtime.cells[slot] = typeof fallback === "function" ? fallback() : fallback;
		return slot;
	};
	return {
		Fragment: Symbol("Fragment"),
		createElement: (type, props, ...children) => ({
			type,
			props: {
				...(props ?? {}),
				...(children.length === 0 ? {} : { children: children.length === 1 ? children[0] : children })
			}
		}),
		useState: (initial) => {
			const slot = at(initial);
			const runtime = getRuntime();
			return [runtime.cells[slot], (next) => {
				const current = getRuntime();
				current.cells[slot] = typeof next === "function" ? next(current.cells[slot]) : next;
			}];
		},
		useCallback: (fn) => {
			getRuntime().index++;
			return fn;
		},
		useRef: (initial) => {
			getRuntime().index++;
			return { current: initial };
		},
		useEffect: () => {
			getRuntime().index++;
		},
		useLayoutEffect: () => {
			getRuntime().index++;
		},
		useMemo: (fn) => {
			getRuntime().index++;
			return fn();
		},
		useId: () => {
			getRuntime().index++;
			return "test-id";
		}
	};
}

/**
 * Install one page and load one client bundle into it.
 * @param bundlePath - absolute path of the `lib/client.js` to load.
 * @returns the page: captured registrations, the page's own clocks and caches,
 * route control for `fetch`, and the async helpers a click needs.
 */
export function createPage(bundlePath) {
	const page = {
		registrations: [],
		styles: [],
		reloads: [],
		deletedCaches: [],
		requests: [],
		dictionaries: [],
		slots: [],
		route: () => ({ status: 404, body: {} })
	};

	// --- the page the bundle is loaded into ---------------------------------
	const timers = new Map();
	let timerSeq = 0;
	const setTimeoutStub = (fn) => {
		const id = ++timerSeq;
		timers.set(id, fn);
		return id;
	};
	const clearTimeoutStub = (id) => {
		timers.delete(id);
	};
	page.timers = timers;
	/** Run every timer queued so far (the flows' sleeps and the disarm timeout). */
	page.runTimers = () => {
		const queued = [...timers.entries()];
		timers.clear();
		for (const [, fn] of queued) fn();
	};
	/** Let promise chains advance. */
	page.micro = async (rounds = 12) => {
		for (let i = 0; i < rounds; i++) await Promise.resolve();
	};
	/** Alternate draining timers and microtasks, which is what a click needs. */
	page.settle = async (rounds = 40) => {
		for (let i = 0; i < rounds; i++) {
			page.runTimers();
			await page.micro();
		}
	};

	const documentStub = {
		querySelector: () => null,
		createElement: () => ({ dataset: {}, textContent: "", style: {} }),
		head: { appendChild: (tag) => page.styles.push(tag) },
		addEventListener: () => {},
		removeEventListener: () => {}
	};
	const windowStub = {
		__ModuleLoader__: { load: (entry) => page.registrations.push(entry) },
		setTimeout: setTimeoutStub,
		clearTimeout: clearTimeoutStub
	};
	const locationStub = {
		href: "http://127.0.0.1:33637/",
		pathname: "/",
		search: "",
		reload: () => page.reloads.push(Date.now()),
		replace: () => page.reloads.push(Date.now())
	};
	const cachesStub = {
		keys: async () => ["dsh-module-bundles"],
		delete: async (name) => {
			page.deletedCaches.push(name);
			return true;
		}
	};
	const fetchStub = async (url, init) => {
		const path = String(url).split("?")[0];
		page.requests.push({ path, method: (init && init.method) || "GET" });
		const answer = page.route(path, init) ?? { status: 404, body: {} };
		return {
			ok: answer.status >= 200 && answer.status < 300,
			status: answer.status,
			json: async () => answer.body
		};
	};

	/** Icons and other primitives, as components that name themselves in markup. */
	const primitives = new Proxy({}, {
		get: (_target, name) => () => ({ type: "span", props: { "data-stub": String(name) } })
	});
	const runtimeRef = { current: createHooks() };
	const react = createReact(() => runtimeRef.current);
	const modules = {
		"react": react,
		"@deepseek-ai/dsh-client-ui-primitives": primitives
	};
	const fakeRequire = (name) => {
		if (name in modules) return modules[name];
		throw new Error(`unexpected require(${name})`);
	};

	const args = [fakeRequire, windowStub, documentStub, locationStub, cachesStub, fetchStub, setTimeoutStub, clearTimeoutStub];
	if (page.registrations.length === 0) {
		const code = readFileSync(bundlePath, "utf8");
		const compile = new Function(...SANDBOX_PARAMS, code);
		compile(...args);
	}
	if (page.registrations.length !== 1) throw new Error(`expected 1 module registration, saw ${page.registrations.length}`);
	page.id = page.registrations[0].id;
	page.exports = page.registrations[0].factory(fakeRequire);

	// --- drive the bundle's apply(ctx) --------------------------------------
	/** Select the hook store the next render uses. */
	page.useRuntime = (runtime = createHooks()) => {
		runtimeRef.current = runtime;
		return runtime;
	};
	/** Render a registered component with the plugin's hook store. */
	page.render = (component, props, runtime) => {
		runtimeRef.current = runtime ?? createHooks();
		runtimeRef.current.index = 0;
		const tree = component(props);
		return { tree, html: toText(tree), buttons: collect(tree, "button") };
	};
	page.apply = () => {
		const ctx = {
			effect: (fn) => fn(),
			locale: {
				register: (ns, dict) => {
					page.dictionaries.push({ ns, dict });
					return () => {};
				},
				bind: (ns) => (key) => `«${ns}.${key}»`,
				subscribe: () => () => {},
				getSnapshot: () => ({ revision: 0 })
			},
			slots: {
				inject: (_name, factory) => factory(),
				register: (entry, Component) => {
					page.slots.push({ entry, Component });
					return () => {};
				},
				entries: () => [],
				getVersion: () => 0,
				subscribe: () => () => {}
			}
		};
		page.exports.apply(ctx);
		return ctx;
	};
	return page;
}
