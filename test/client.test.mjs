/**
 * Behaviour tests for the browser half, run against the real `lib/client.js`
 * with no dependencies: `node --test test/`.
 *
 * They cover what a syntax check cannot — the rows mount, both dictionaries
 * carry every key the rows ask for, the restart really is two-step, 刷新 really
 * clears the caches before reloading, a refusing host ends at 重启失败 — and
 * they pin the stylesheet to the sidebar-foot geometry it exists to match,
 * including against the installed first-party settings bundle when one is
 * present (set DSH_HOME to run that half).
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createPage } from "./shim.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

const page = createPage(join(ROOT, "lib", "client.js"));
page.apply();

const foot = page.slots.find((slot) => slot.entry.name === "sidebar.footer.action");
const render = (wide, runtime) => page.render(foot.Component, { wide, t: (key) => `«${key}»` }, runtime);
const zh = page.dictionaries[0].dict.zh;
const en = page.dictionaries[0].dict.en;
const stylesheet = page.styles[0]?.textContent ?? "";

/** Parse the declarations of `.selector{...}` into a map. */
function ruleDeclarations(cssText, selector) {
	const at = cssText.indexOf(`${selector}{`);
	if (at === -1) return null;
	const map = new Map();
	for (const part of cssText.slice(at + selector.length + 1, cssText.indexOf("}", at)).split(";")) {
		const colon = part.indexOf(":");
		if (colon !== -1) map.set(part.slice(0, colon).trim(), part.slice(colon + 1).trim());
	}
	return map;
}

/** Find the first rule whose declarations satisfy `predicate` (first-party class names are hashed). */
function findRule(cssText, predicate) {
	for (const match of cssText.matchAll(/\.([A-Za-z0-9_-]+)\{([^}]*)\}/g)) {
		const map = new Map();
		for (const part of match[2].split(";")) {
			const colon = part.indexOf(":");
			if (colon !== -1) map.set(part.slice(0, colon).trim(), part.slice(colon + 1).trim());
		}
		if (predicate(map)) return map;
	}
	return null;
}

/** The installed first-party settings bundle, when this machine has DSH. */
function installedSettingsBundle() {
	const homes = [process.env.DSH_HOME, process.env.USERPROFILE && join(process.env.USERPROFILE, ".dsh"), process.env.HOME && join(process.env.HOME, ".dsh")].filter(Boolean);
	for (const home of homes) {
		for (const base of [join(home, "profiles", "node_modules"), join(home, "profiles", "web", "node_modules")]) {
			const path = join(base, "@deepseek-ai", "dsh-client-ui-settings-general", "lib", "client.js");
			if (existsSync(path)) return readFileSync(path, "utf8");
		}
	}
	return null;
}

test("registers exactly one client module under the plugin id", () => {
	assert.equal(page.id, "dsh-harness-control");
	assert.equal(page.registrations.length, 1);
});

test("the bundle id is the package name, as the client loader requires", () => {
	const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
	// dsh-client-modules identifies a browser module BY its package name, and two
	// active sources for one name are a composition error — so the registered id
	// and the package name have to stay the same string.
	assert.equal(page.id, pkg.name);
	assert.equal(pkg.dsh.client.platform, "web");
	assert.deepEqual(pkg.dsh.client.inject, page.exports.inject);
	assert.equal(pkg.dsh.bundle.patch, "./cordis.patch.yml");
	assert.ok(existsSync(join(ROOT, "cordis.patch.yml")), "the declared bundle patch is missing");
	assert.ok(pkg.exports["./client"], "the ./client subpath must be exported: it is where the shell serves the bundle from");
	assert.ok(existsSync(join(ROOT, "lib", "client.js")));
	assert.ok(existsSync(join(ROOT, "lib", "index.js")));
});

test("declares the services the browser half needs", () => {
	assert.deepEqual(page.exports.inject, ["slots", "locale"]);
});

test("injects its stylesheet once, tagged for the plugin", () => {
	assert.equal(page.styles.length, 1);
	assert.equal(page.styles[0].dataset.plugin, "dsh-harness-control");
	assert.match(page.styles[0].dataset.pluginCss, /^dsh-harness-control\/style$/);
});

test("takes the sidebar foot seat with a stable id", () => {
	assert.ok(foot, "nothing registered in sidebar.footer.action");
	assert.equal(foot.entry.id, "harness-control");
	assert.equal(foot.entry.order, 0);
	assert.equal(foot.entry.locale, "harness-control");
	assert.match(foot.entry.label(), /harness-control\.restart/);
});

test("binds its own translator as well as the locale seat's", () => {
	const injected = foot.entry.inject();
	assert.equal(typeof injected.t, "function");
	assert.equal(injected.t("restart"), "«harness-control.restart»");
});

test("keeps zh and en at the same key set, with no empty copy", () => {
	assert.deepEqual(Object.keys(zh).sort(), Object.keys(en).sort());
	for (const [key, value] of Object.entries(zh)) {
		assert.equal(typeof value, "string");
		assert.ok(value.length > 0, `zh ${key} is empty`);
		assert.ok(String(en[key]).length > 0, `en ${key} is empty`);
	}
	assert.equal(zh["restart"], "重启");
	assert.equal(zh["refresh"], "刷新");
	assert.equal(zh["restart.confirm"], "确认重启");
	assert.equal(en["restart"], "Restart");
});

test("every key the rendered rows ask for exists in both dictionaries", () => {
	const asked = new Set();
	const t = (key) => {
		asked.add(key);
		return `«${key}»`;
	};
	// Resting rows, in both column states.
	for (const wide of [true, false]) page.render(foot.Component, { wide, t }, page.useRuntime());
	// Armed restart row, in both column states.
	for (const wide of [true, false]) {
		const runtime = page.useRuntime();
		page.render(foot.Component, { wide, t }, runtime).buttons[0].props.onClick();
		page.render(foot.Component, { wide, t }, runtime);
	}
	// The refresh row's in-flight label.
	const refreshing = page.useRuntime();
	page.render(foot.Component, { wide: true, t }, refreshing).buttons[1].props.onClick();
	page.render(foot.Component, { wide: true, t }, refreshing);
	for (const key of asked) {
		assert.ok(zh[key] !== undefined, `zh is missing ${key}`);
		assert.ok(en[key] !== undefined, `en is missing ${key}`);
	}
	assert.ok(asked.has("restart.confirm") && asked.has("restart.cancel") && asked.has("refresh.busy"), `saw ${[...asked].join(", ")}`);
});

test("wide column renders 重启 then 刷新", () => {
	const wide = render(true);
	assert.equal(wide.buttons.length, 2);
	const [restart, refresh] = wide.buttons;
	assert.equal(restart.props["aria-label"], "«restart»");
	assert.equal(refresh.props["aria-label"], "«refresh»");
	assert.ok(wide.html.indexOf("«restart»") < wide.html.indexOf("«refresh»"));
	assert.ok(wide.html.includes('d="M12.5 5.35A5.5 5.5 0 1 1 3.5 5.35"'), "the restart power glyph is missing");
	assert.ok(wide.html.includes('data-stub="IconRefreshOutline16"'), "the 16px refresh icon is missing");
	assert.match(String(restart.props.title), /restart\.hint/);
	assert.match(String(refresh.props.title), /refresh\.hint/);
});

test("collapsed rail renders icon-only buttons", () => {
	const rail = render(false);
	assert.equal(rail.buttons.length, 2);
	assert.match(String(rail.buttons[0].props.className), /hc-trigger-rail/);
	assert.equal(rail.buttons[0].props.children[1], null, "the rail row rendered a text label");
	assert.ok(rail.html.includes('data-stub="IconRefreshOutline14"'), "the 14px refresh icon is missing");
});

test("the first click only arms the restart row", async () => {
	const requestsBefore = page.requests.length;
	const runtime = page.useRuntime();
	render(true, runtime).buttons[0].props.onClick();
	await page.micro();
	assert.equal(page.requests.length, requestsBefore, "arming must not touch the host");
	const armed = render(true, runtime);
	assert.equal(armed.buttons.length, 3, "expected confirm + cancel + refresh");
	assert.equal(armed.buttons[0].props["aria-label"], "«restart.confirm»");
	assert.equal(armed.buttons[1].props["aria-label"], "«restart.cancel»");
	assert.match(String(armed.buttons[0].props.className), /hc-trigger-danger/);
	assert.ok(armed.html.includes('data-stub="IconCloseOutline16"'), "the cancel button has no close icon");
	assert.match(String(armed.buttons[0].props.title), /restart\.confirm\.hint/);
});

test("cancel disarms without restarting", () => {
	const requestsBefore = page.requests.length;
	const runtime = page.useRuntime();
	render(true, runtime).buttons[0].props.onClick();
	render(true, runtime).buttons[1].props.onClick();
	const disarmed = render(true, runtime);
	assert.equal(disarmed.buttons.length, 2);
	assert.equal(disarmed.buttons[0].props["aria-label"], "«restart»");
	assert.equal(page.requests.length, requestsBefore);
});

test("the armed rail keeps one button and no cancel", () => {
	const runtime = page.useRuntime();
	render(false, runtime).buttons[0].props.onClick();
	const armed = render(false, runtime);
	assert.equal(armed.buttons.length, 2, "expected confirm + refresh in the rail");
	assert.equal(armed.buttons[0].props["aria-label"], "«restart.confirm»");
	assert.equal(armed.html.includes("IconCloseOutline16"), false, "the rail must not render a cancel button");
});

test("the second click restarts and reloads on a new boot id", async () => {
	let boot = "boot-1";
	const posts = [];
	page.route = (path, init) => {
		if (path === "/dsh-market/api/v1/capabilities") {
			return { status: 200, body: { bootId: boot, restart: { supported: true }, endpoints: { restart: "/dsh-market/api/v1/restart" } } };
		}
		if (path === "/dsh-market/api/v1/restart" && init?.method === "POST") {
			posts.push(path);
			boot = "boot-2";
			return { status: 202, body: { result: { ok: true } } };
		}
		return { status: 404, body: {} };
	};
	const reloadsBefore = page.reloads.length;
	const runtime = page.useRuntime();
	render(true, runtime).buttons[0].props.onClick();
	render(true, runtime).buttons[0].props.onClick();
	await page.settle();
	assert.deepEqual(posts, ["/dsh-market/api/v1/restart"]);
	assert.equal(page.reloads.length, reloadsBefore + 1, "the page did not reload after the new boot id");
});

test("falls back to the legacy Market pair when v1 is absent", async () => {
	let boot = "boot-a";
	const posts = [];
	page.route = (path, init) => {
		if (path === "/dsh-market/status") return { status: 200, body: { boot, restart: true } };
		if (path === "/dsh-market/restart" && init?.method === "POST") {
			posts.push(path);
			boot = "boot-b";
			return { status: 202, body: { ok: true } };
		}
		return { status: 404, body: {} };
	};
	const reloadsBefore = page.reloads.length;
	const runtime = page.useRuntime();
	render(true, runtime).buttons[0].props.onClick();
	render(true, runtime).buttons[0].props.onClick();
	await page.settle();
	assert.deepEqual(posts, ["/dsh-market/restart"]);
	assert.equal(page.reloads.length, reloadsBefore + 1);
});

test("a host that refuses self-restart ends at 重启失败", async () => {
	page.route = () => ({ status: 200, body: { bootId: "boot-3", restart: { supported: false }, endpoints: {} } });
	const runtime = page.useRuntime();
	render(true, runtime).buttons[0].props.onClick();
	render(true, runtime).buttons[0].props.onClick();
	await page.micro(30);
	const after = render(true, runtime);
	assert.equal(after.buttons.length, 2, "the armed row did not collapse");
	assert.equal(after.buttons[0].props["aria-label"], "«restart.failed»");
	assert.match(String(after.buttons[0].props.title), /error\.refused/);
});

test("no Market at all is reported, not guessed at", async () => {
	page.route = () => ({ status: 404, body: {} });
	const runtime = page.useRuntime();
	render(true, runtime).buttons[0].props.onClick();
	render(true, runtime).buttons[0].props.onClick();
	await page.micro(30);
	const after = render(true, runtime);
	assert.equal(after.buttons[0].props["aria-label"], "«restart.failed»");
	assert.match(String(after.buttons[0].props.title), /error\.unavailable/);
});

test("刷新 clears Cache Storage, then reloads", async () => {
	page.route = () => ({ status: 404, body: {} });
	const reloadsBefore = page.reloads.length;
	const cachesBefore = page.deletedCaches.length;
	render(true).buttons[1].props.onClick();
	await page.micro(30);
	assert.deepEqual(page.deletedCaches.slice(cachesBefore), ["dsh-module-bundles"]);
	assert.equal(page.reloads.length, reloadsBefore + 1);
});

test("the stylesheet restates the sidebar-foot geometry", () => {
	const trigger = ruleDeclarations(stylesheet, ".hc-trigger");
	assert.ok(trigger, "no .hc-trigger rule");
	assert.equal(trigger.get("height"), "42px");
	assert.equal(trigger.get("border-radius"), "12px");
	assert.equal(trigger.get("padding"), "0 10px 0 8px");
	assert.equal(trigger.get("gap"), "8px");
	assert.equal(trigger.get("font-size"), "14px");
	assert.equal(trigger.get("line-height"), "22px");
	assert.equal(trigger.get("color"), "var(--dsw-alias-label-primary)");
	assert.equal(trigger.get("display"), "flex");
	assert.equal(ruleDeclarations(stylesheet, ".hc-trigger:hover").get("background"), "var(--dsw-alias-interactive-bg-hover)");
	assert.equal(ruleDeclarations(stylesheet, ".hc-trigger-danger").get("color"), "var(--dsw-alias-state-error-primary)");
	const rail = ruleDeclarations(stylesheet, ".hc-trigger-rail");
	assert.equal(rail.get("width"), "36px");
	assert.equal(rail.get("height"), "36px");
	assert.equal(rail.get("border-radius"), "50%");
	assert.match(stylesheet, /\.hc-foot\{[^}]*flex-direction:column/);
});

test("matches the installed first-party trigger declarations", (t) => {
	const installed = installedSettingsBundle();
	if (installed === null) {
		t.skip("no DSH install found — set DSH_HOME to check parity against the settings plugin");
		return;
	}
	const theirs = findRule(installed, (declarations) =>
		declarations.get("height") === "42px"
		&& declarations.get("padding") === "0 10px 0 8px"
		&& declarations.get("font-size") === "14px"
		&& declarations.get("border-radius") === "12px");
	assert.ok(theirs, "the installed settings bundle has no recognizable trigger rule");
	const mine = ruleDeclarations(stylesheet, ".hc-trigger");
	for (const property of [
		"box-sizing", "cursor", "width", "min-width", "height", "color", "background", "border",
		"border-radius", "flex", "align-items", "gap", "margin", "padding", "font-family",
		"font-size", "line-height", "display", "overflow"
	]) {
		if (!mine.has(property) || !theirs.has(property)) continue;
		assert.equal(mine.get(property), theirs.get(property), `${property} drifted from the first-party trigger`);
	}
	const theirRail = findRule(installed, (declarations) =>
		declarations.get("width") === "36px" && declarations.get("height") === "36px" && declarations.get("border-radius") === "50%");
	if (theirRail === null) return;
	const myRail = ruleDeclarations(stylesheet, ".hc-trigger-rail");
	for (const property of ["width", "height", "border-radius", "padding", "gap", "justify-content"]) {
		if (!myRail.has(property) || !theirRail.has(property)) continue;
		assert.equal(myRail.get(property), theirRail.get(property), `${property} drifted from the first-party rail button`);
	}
});
