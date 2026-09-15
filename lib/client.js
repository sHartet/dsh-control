/**
 * dsh-harness-control — browser half.
 *
 * Two rows on the sidebar foot, directly above the 「设置」 button:
 *
 *   重启   restart the Harness Host process (what a host-side plugin change
 *          needs: anything under `app/node_modules/**` or the profile)
 *   刷新   reload this page (what an interface-side plugin change needs: the
 *          `*.client.js` bundles the page loads)
 *   设置   the button they sit above — untouched, and the model for their look
 *
 * Design notes, because the interesting decisions are all constraints:
 *
 * 1. SEAT. The rows are registered into `sidebar.footer.action`, the list slot
 *    ui-sidebar declares for the sidebar foot. The shell renders it in
 *    `footerActions`, which precedes `settingsArea` in the DOM — so a
 *    registrant lands above Settings without touching the settings plugin, and
 *    without a second copy of the sidebar. Registering it (rather than
 *    patching ui-settings-general) is what makes this package installable on
 *    any DSH web profile and uninstallable again.
 *
 * 2. LOOK. The slot hands a registrant only the column state (`wide`), so the
 *    row geometry cannot be imported from the settings plugin — its CSS-module
 *    class names are private and hashed. The stylesheet below therefore
 *    restates that geometry with its own `hc-` names: the same 42px row, 12px
 *    radius, 8px gap, 14px label, hover fill and 36px circle in the collapsed
 *    rail, all on the same `--dsw-*` tokens. `test/client.test.mjs` asserts
 *    those declarations, and on a machine with DSH installed it also diffs
 *    them against the settings plugin's own stylesheet so drift shows up as a
 *    failing test instead of as a row that quietly stops matching.
 *
 * 3. RESTART. The row drives the dsh Market's own one-click restart (the one
 *    its banner uses) and reloads once a different boot id answers. That is a
 *    deliberate dependency: the Market already owns the platform-correct
 *    relaunch, the loopback same-origin guard, the supervisor/debugger refusal
 *    and the operation lock. Without the Market the row says so instead of
 *    guessing — it never tries to be a second way to kill the Host.
 *
 * 4. TWO STEPS. Restarting the Host ends whatever it was doing, so the first
 *    click only arms the row: a destructive confirm button takes its place,
 *    Escape and a 6s timeout disarm it, and the wide column also gets an
 *    explicit cancel button. The collapsed rail cannot fit two buttons, so
 *    there the armed state is the same 36px button in the error colour. All of
 *    it is inline rather than a modal, so the confirmation is anchored where
 *    the click happened and never competes for the page's z-order with other
 *    plugins.
 *
 * 5. RELOAD. Client bundles are served `immutable` with a content revision, so
 *    a plain reload can be answered from cache. The row drops every Cache
 *    Storage bucket first, then reloads.
 */

/* global window, document, fetch, caches, location */
window.__ModuleLoader__.load({
	id: "dsh-harness-control",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const react = require("react");
		const primitives = require("@deepseek-ai/dsh-client-ui-primitives");

		//#region styles
		/**
		 * The sidebar-foot geometry, restated on the `--dsw-*` tokens the rest of
		 * the shell uses. Kept as one array of rules so the parity test can read
		 * the same strings this file ships.
		 */
		const css = [
			/* The foot column: one full-width row per action, stacked. */
			".hc-foot{flex:1 1 auto;min-width:0;display:flex;flex-direction:column}",
			/* One 42px row, inset like the settings trigger row it sits above. */
			".hc-row{flex:none;align-items:center;gap:8px;width:calc(100% + 4px);margin:4px -2px;display:flex}",
			/* Collapsed rail: the row shrinks to the icon button's own square. */
			".hc-row-rail{width:36px;margin:8px 0 10px}",
			/* The trigger itself. */
			".hc-trigger{box-sizing:border-box;cursor:pointer;width:auto;min-width:0;height:42px;color:var(--dsw-alias-label-primary);background:0 0;border:none;border-radius:12px;flex:1;align-items:center;gap:8px;margin:0;padding:0 10px 0 8px;font-family:inherit;font-size:14px;line-height:22px;display:flex;overflow:hidden}",
			".hc-trigger:hover{background:var(--dsw-alias-interactive-bg-hover)}",
			".hc-trigger:focus-visible{outline:2px solid var(--dsw-alias-label-primary);outline-offset:-2px}",
			/* In flight: the row stays put and stops accepting clicks. */
			".hc-trigger[disabled]{cursor:default;opacity:.55}",
			/* Collapsed rail: a 36px circle, icon only. */
			".hc-trigger-rail{corner-shape:round;border-radius:50%;flex:none;justify-content:center;gap:0;width:36px;height:36px;margin:0;padding:0}",
			/* The armed restart button, and only it, wears the error token. */
			".hc-trigger-danger{color:var(--dsw-alias-state-error-primary)}",
			".hc-label{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
		].join("");
		const tagId = "dsh-harness-control/style";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-harness-control";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		//#endregion

		//#region copy
		/** Dictionary namespace owned by this plugin. */
		const NS = "harness-control";
		/** Simplified Chinese dictionary (the key-set source of truth). */
		const zh = {
			"restart": "重启",
			"refresh": "刷新",
			"restart.busy": "重启中…",
			"refresh.busy": "刷新中…",
			"restart.failed": "重启失败",
			"restart.confirm": "确认重启",
			"restart.cancel": "取消",
			"restart.hint": "重启 Harness 服务进程（宿主端插件改动后需要，点一下先确认）",
			"restart.confirm.hint": "再次点击即立即重启，正在运行的任务会被中断",
			"refresh.hint": "重新加载页面（界面端插件改动后需要）",
			"error.unavailable": "没有找到 dsh Market 的重启接口，无法从界面重启",
			"error.refused": "当前宿主不允许自行重启（受 supervisor 或调试器保护）",
			"error.timeout": "等待 Harness 重启超时，请手动重启"
		};
		/** English dictionary, checked complete against the zh key set. */
		const en = {
			"restart": "Restart",
			"refresh": "Refresh",
			"restart.busy": "Restarting…",
			"refresh.busy": "Refreshing…",
			"restart.failed": "Restart failed",
			"restart.confirm": "Confirm restart",
			"restart.cancel": "Cancel",
			"restart.hint": "Restart the Harness host process (needed after host-side plugin changes; asks to confirm first)",
			"restart.confirm.hint": "Click again to restart now — running tasks are interrupted",
			"refresh.hint": "Reload this page (needed after interface-side plugin changes)",
			"error.unavailable": "No dsh Market restart endpoint found — cannot restart from the UI",
			"error.refused": "This host refuses self-restart (supervisor or debugger attached)",
			"error.timeout": "Timed out waiting for Harness to restart — restart it manually"
		};
		//#endregion

		//#region restart + reload
		/** How long the restart row waits for a fresh boot id before giving up. */
		const RESTART_TIMEOUT_MS = 9e4;
		/** Delay between boot-id polls while a restart is in flight. */
		const RESTART_POLL_MS = 1500;
		/** How long a failed row keeps its error label before returning to rest. */
		const FAILURE_LABEL_MS = 6e3;
		/** How long the restart row stays armed for its second click. */
		const CONFIRM_MS = 6e3;
		/** Resolve after `ms`. */
		function sleep(ms) {
			return new Promise((resolve) => {
				setTimeout(resolve, ms);
			});
		}
		/** Drop a failure label back to the resting one after a moment. */
		function scheduleReset(setPhase) {
			setTimeout(() => {
				setPhase(null);
			}, FAILURE_LABEL_MS);
		}
		/**
		 * Read the host's restart capability and its current boot id.
		 *
		 * The versioned dsh-market endpoint is the documented contract; the
		 * legacy pair is what the Market's own restart banner calls. Either one
		 * answering is enough for the row to work, and neither answering (Market
		 * missing or disabled) is reported rather than guessed at.
		 * @returns the boot id, whether a restart may be requested, and the path
		 * to POST it to — or null when no restart surface is reachable.
		 */
		async function readHarnessHost() {
			try {
				const response = await fetch("/dsh-market/api/v1/capabilities", { cache: "no-store" });
				if (response.ok) {
					const raw = await response.json();
					const body = raw !== null && typeof raw === "object" ? raw : {};
					const restart = body.restart !== null && typeof body.restart === "object" ? body.restart : void 0;
					const endpoints = body.endpoints !== null && typeof body.endpoints === "object" ? body.endpoints : void 0;
					return {
						boot: typeof body.bootId === "string" ? body.bootId : null,
						canRestart: restart !== void 0 && restart.supported === true,
						path: endpoints !== void 0 && typeof endpoints.restart === "string" ? endpoints.restart : "/dsh-market/api/v1/restart"
					};
				}
			} catch {
				/* fall through to the legacy pair */
			}
			try {
				const response = await fetch("/dsh-market/status", { cache: "no-store" });
				if (response.ok) {
					const raw = await response.json();
					const body = raw !== null && typeof raw === "object" ? raw : {};
					return {
						boot: typeof body.boot === "string" ? body.boot : null,
						canRestart: body.restart === true,
						path: "/dsh-market/restart"
					};
				}
			} catch {
				/* no Market at all */
			}
			return null;
		}
		/**
		 * Restart the Harness Host through the Market's own one-click restart and
		 * reload this page once a different boot id answers.
		 *
		 * The POST races the host's SIGTERM, so a network error on it means
		 * "restart under way" rather than a failure; a 409 means a plugin
		 * operation still owns the lock and is retried for a few seconds.
		 * @param setPhase - local phase setter ('restarting' | 'failed' | null).
		 * @param setDetail - local failure-detail setter (tooltip text).
		 * @param t - translator bound to this plugin's namespace.
		 */
		async function runHarnessRestart(setPhase, setDetail, t) {
			setPhase("restarting");
			const before = await readHarnessHost();
			if (before === null) {
				setPhase("failed");
				setDetail(t("error.unavailable"));
				scheduleReset(setPhase);
				return;
			}
			if (!before.canRestart) {
				setPhase("failed");
				setDetail(t("error.refused"));
				scheduleReset(setPhase);
				return;
			}
			const post = async () => {
				try {
					return await fetch(before.path, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: "{}"
					});
				} catch {
					return null;
				}
			};
			let response = await post();
			for (let attempt = 0; response !== null && response.status === 409 && attempt < 8; attempt++) {
				await sleep(RESTART_POLL_MS);
				response = await post();
			}
			if (response !== null && !response.ok) {
				let detail = "HTTP " + String(response.status);
				try {
					const body = await response.json();
					if (body !== null && typeof body === "object" && typeof body.error === "string") detail = body.error;
				} catch {
					/* keep the status line */
				}
				setPhase("failed");
				setDetail(detail);
				scheduleReset(setPhase);
				return;
			}
			const deadline = Date.now() + RESTART_TIMEOUT_MS;
			while (Date.now() < deadline) {
				await sleep(RESTART_POLL_MS);
				const next = await readHarnessHost();
				if (next !== null && before.boot !== null && next.boot !== null && next.boot !== before.boot) {
					location.reload();
					return;
				}
			}
			setPhase("failed");
			setDetail(t("error.timeout"));
			scheduleReset(setPhase);
		}
		/**
		 * Reload the page after dropping every Cache Storage bucket, so a patched
		 * client bundle is fetched again instead of being answered from a cache
		 * the shell marked immutable.
		 * @param setPhase - local phase setter ('refreshing').
		 */
		async function runClientRefresh(setPhase) {
			setPhase("refreshing");
			try {
				if (typeof caches !== "undefined") {
					const names = await caches.keys();
					await Promise.all(names.map((name) => caches.delete(name)));
				}
			} catch {
				/* a shell without Cache Storage still reloads */
			}
			location.reload();
		}
		//#endregion

		//#region rows
		/**
		 * Power glyph for the restart row. The shared icon set ships no restart
		 * mark, so this one is drawn to the same contract as its neighbours: a
		 * currentColor outline on a 16-unit grid that scales with the rail.
		 * @param props - requested square edge in pixels.
		 */
		function PowerIcon({ size }) {
			return react.createElement("svg", {
				width: size,
				height: size,
				viewBox: "0 0 16 16",
				fill: "none",
				xmlns: "http://www.w3.org/2000/svg",
				"aria-hidden": "true"
			}, react.createElement("path", {
				d: "M8 2.3v5.2",
				stroke: "currentColor",
				strokeWidth: "1.4",
				strokeLinecap: "round"
			}), react.createElement("path", {
				d: "M12.5 5.35A5.5 5.5 0 1 1 3.5 5.35",
				stroke: "currentColor",
				strokeWidth: "1.4",
				strokeLinecap: "round",
				fill: "none"
			}));
		}
		/**
		 * One action row: icon plus label when the column is wide, an icon-only
		 * 36px circle when it is collapsed.
		 * @param props - column state, icon element, label, tooltip, busy flag, click.
		 */
		function ActionRow({ wide, icon, label, hint, busy, onClick }) {
			return react.createElement("div", {
				className: wide ? "hc-row" : "hc-row hc-row-rail"
			}, react.createElement("button", {
				type: "button",
				className: wide ? "hc-trigger" : "hc-trigger hc-trigger-rail",
				"aria-label": label,
				"aria-busy": busy ? "true" : void 0,
				title: hint,
				disabled: busy,
				onClick
			}, icon, wide ? react.createElement("span", { className: "hc-label" }, label) : null));
		}
		/**
		 * The armed restart row: the second step of the confirmation. It takes
		 * the restart row's place, so nothing else on the foot moves.
		 * @param props - column state, labels, tooltip, and the confirm/cancel clicks.
		 */
		function ConfirmRow({ wide, label, hint, cancelLabel, onConfirm, onCancel }) {
			return react.createElement("div", {
				className: wide ? "hc-row" : "hc-row hc-row-rail"
			}, react.createElement("button", {
				type: "button",
				className: wide ? "hc-trigger hc-trigger-danger" : "hc-trigger hc-trigger-rail hc-trigger-danger",
				"aria-label": label,
				title: hint,
				onClick: onConfirm
			}, react.createElement(PowerIcon, { size: wide ? 16 : 18 }), wide ? react.createElement("span", { className: "hc-label" }, label) : null),
			/* The rail has no room for a second button: Escape and the timeout cancel it. */
			wide ? react.createElement("button", {
				type: "button",
				className: "hc-trigger hc-trigger-rail",
				"aria-label": cancelLabel,
				title: cancelLabel,
				onClick: onCancel
			}, react.createElement(primitives.IconCloseOutline16, { size: 14 })) : null);
		}
		/**
		 * The sidebar-foot registrant: the 重启 and 刷新 rows, in that order,
		 * above Settings.
		 * @param props - column state (`wide`) from the slot, plus the translator.
		 */
		function HarnessControlFoot(props) {
			const wide = props.wide === true;
			const t = typeof props.t === "function" ? props.t : (key) => key;
			/**
			 * null = resting, 'confirm' = armed for the second click,
			 * 'restarting' | 'refreshing' = in flight, 'failed' = last attempt failed.
			 */
			const [phase, setPhase] = react.useState(null);
			const [detail, setDetail] = react.useState(null);
			/** In-flight work only: the armed state is not busy, so it can be cancelled. */
			const busy = phase === "restarting" || phase === "refreshing";
			/** First step: arm the restart row; the second click is what restarts. */
			const armRestart = react.useCallback(() => {
				if (busy) return;
				setDetail(null);
				setPhase("confirm");
			}, [busy]);
			/** Second step: the user confirmed. */
			const confirmRestart = react.useCallback(() => {
				if (busy) return;
				setDetail(null);
				runHarnessRestart(setPhase, setDetail, t);
			}, [busy, t]);
			const cancelRestart = react.useCallback(() => {
				setDetail(null);
				setPhase(null);
			}, []);
			const refresh = react.useCallback(() => {
				if (busy) return;
				setDetail(null);
				runClientRefresh(setPhase);
			}, [busy]);
			/**
			 * Keep an armed row from staying armed: Escape disarms it, and so does
			 * the timeout. The listener and the timer live and die with the armed
			 * state, which is why they are mounted from an effect rather than set up
			 * in the click handler.
			 */
			react.useEffect(() => {
				if (phase !== "confirm") return;
				const disarm = () => {
					setPhase(null);
				};
				const onKeyDown = (event) => {
					if (event.key === "Escape") disarm();
				};
				document.addEventListener("keydown", onKeyDown);
				const timer = window.setTimeout(disarm, CONFIRM_MS);
				return () => {
					document.removeEventListener("keydown", onKeyDown);
					window.clearTimeout(timer);
				};
			}, [phase]);
			/** Fold the last failure detail into the tooltip, so it explains itself. */
			const hint = (base) => (detail === null ? base : base + " — " + detail);
			const restartRow = phase === "confirm"
				? react.createElement(ConfirmRow, {
					wide,
					label: t("restart.confirm"),
					hint: t("restart.confirm.hint"),
					cancelLabel: t("restart.cancel"),
					onConfirm: confirmRestart,
					onCancel: cancelRestart
				})
				: react.createElement(ActionRow, {
					wide,
					icon: react.createElement(PowerIcon, { size: wide ? 16 : 18 }),
					label: t(phase === "restarting" ? "restart.busy" : phase === "failed" ? "restart.failed" : "restart"),
					hint: hint(t("restart.hint")),
					busy,
					onClick: armRestart
				});
			const refreshRow = react.createElement(ActionRow, {
				wide,
				icon: wide
					? react.createElement(primitives.IconRefreshOutline16, { size: 16 })
					: react.createElement(primitives.IconRefreshOutline14, { size: 18 }),
				label: t(phase === "refreshing" ? "refresh.busy" : "refresh"),
				hint: hint(t("refresh.hint")),
				busy,
				onClick: refresh
			});
			return react.createElement("div", { className: "hc-foot" }, restartRow, refreshRow);
		}
		//#endregion

		//#region plugin
		/** Services required by the browser half. */
		const inject = ["slots", "locale"];
		/**
		 * Register the dictionaries and the foot rows.
		 * @param ctx - client root context.
		 */
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "harness-control: dictionaries");
			const t = ctx.locale.bind(NS);
			/**
			 * The slot is declared by ui-sidebar, whose activation order relative
			 * to this one is not constrained — `slots.inject` is what waits for the
			 * declaration instead of assuming it.
			 */
			ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
				name: "sidebar.footer.action",
				id: "harness-control",
				order: 0,
				label: () => t("restart") + " / " + t("refresh"),
				locale: NS,
				/**
				 * The same dictionary, bound a second time: one translator arrives
				 * from the slot's locale seat, this one from the registrant's own
				 * inject face. Whichever the shell fills first, the rows keep their
				 * copy.
				 */
				inject: () => ({ t })
			}, HarnessControlFoot));
		}
		//#endregion

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
