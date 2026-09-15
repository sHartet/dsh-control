/**
 * dsh-harness-control — Host half.
 *
 * There is nothing for the Host to do. This plugin is a pair of browser-side
 * controls, so the Host row exists only because a bundle-layer plugin is
 * mounted by the cordis loader as a Host plugin, and `dsh-client-modules`
 * discovers the browser half from this package's `dsh.client` declaration
 * (see package.json → `./client`).
 *
 * Deliberately inert, and deliberately not a second restart implementation:
 *
 *   - Restart goes through the dsh Market's own one-click restart endpoint,
 *     which already owns the platform-correct relaunch (a detached helper that
 *     waits for the serving port to be released), the loopback + same-origin
 *     guard, the supervisor/debugger refusals, and the in-flight-operation
 *     lock. A plugin that re-implemented that would be a second way to kill the
 *     Host, with none of the guards.
 *   - Reload needs no Host support at all.
 *
 * Keeping the Host half empty is also what keeps this package installable on
 * any DSH web profile: no services are injected, no routes are registered, and
 * nothing is written to disk.
 */

/** Cordis plugin name (diagnostics only). */
export const name = "harness-control";

/** No services: this half does nothing. */
export const inject = [];

/**
 * Mount point required by the loader.
 */
export function apply() {
	// Intentional no-op — see the module docstring.
}
