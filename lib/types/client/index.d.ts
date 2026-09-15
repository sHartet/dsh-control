/**
 * Type surface of the browser half.
 *
 * The bundle is loaded by the web shell through `window.__ModuleLoader__`
 * rather than imported by other packages, so this file describes the two
 * members the shell's client loader actually consumes: the service list it
 * waits for, and the apply function it calls once they exist.
 */

/** Services required before `apply` runs. */
export declare const inject: readonly ["slots", "locale"];

/**
 * Register the plugin's dictionaries and its `sidebar.footer.action` row.
 * @param ctx - client root context (the shell's own cordis face).
 */
export declare function apply(ctx: unknown): void;
