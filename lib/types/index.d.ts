/**
 * Type surface of the Host half. The plugin injects nothing and applies
 * nothing; these declarations exist so a consumer's TypeScript build can
 * import the package without reaching for `any`.
 */

/** Cordis plugin name. */
export declare const name: "harness-control";

/** Services required by the Host half (none). */
export declare const inject: readonly string[];

/** Mount point required by the loader. */
export declare function apply(): void;
