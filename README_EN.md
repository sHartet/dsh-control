# dsh-harness-control

> Two buttons on the DSH sidebar foot — **Restart** and **Refresh** — so a plugin
> change no longer means leaving the interface for a terminal.

A DSH plugin has two halves, and they take effect differently:

| What you changed | What it needs |
| --- | --- |
| Interface side (`*.client.js`, styles, copy) | **a page reload** |
| Host side (plugins in the profile, packages in `node_modules`, routes, tools) | **a restart of the dsh process** |

Both used to mean switching to a terminal, or closing and reopening the desktop
app. This plugin puts them within reach, directly above Settings.

## What it looks like

Wide sidebar (default):

```
┌───────────────────────────┐
│  … session list …         │
│                           │
│  ⏻  Restart               │  ← new: after a host-side change
│  ⟳  Refresh               │  ← new: after an interface-side change
│  ⚙  Settings              │  ← shipped with DSH, untouched
└───────────────────────────┘
```

In the collapsed rail the same three become icon-only 36px circles, in the same
order.

The rows match the Settings row exactly: 42px tall, 12px radius, 8px gap, 14px
label, the same hover fill and the same `--dsw-*` tokens. That is not a
"looks about right": the test suite diffs this plugin's declarations against the
installed first-party `ui-settings-general` stylesheet, rule by rule.

## Install

Requirements: a DSH **web profile** (which is what the desktop
`DeepSeekHarness.exe` boots), plus [dshmarket](https://www.npmjs.com/package/dshmarket)
for the restart half — see [Scope and limits](#scope-and-limits).

### From GitHub

```bash
dsh plugin --profile web add github:<your-user>/dsh-harness-control
```

### From npm

```bash
dsh plugin --profile web add dsh-harness-control
```

`dsh plugin` forwards its arguments to pnpm inside the profile directory and then
appends the package to `dsh.profile.bundles` for you — no profile file has to be
edited by hand.

### Desktop app without a `dsh` command on PATH

Use the runtime and CLI that ship with the app:

```powershell
$base = "D:\aiwork\DeepSeekHarness"          # your install directory
& "$base\node-runtime\node.exe" "$base\app\node_modules\@deepseek-ai\dsh\lib\bin.js" `
    plugin --profile web add github:<your-user>/dsh-harness-control
```

Restart Harness once afterwards — after that the in-app Restart button works.

### Manual mount

Add the dependency to `<DSH_HOME>/profiles/web/package.json`, append the package
name to `dsh.profile.bundles`, and run `pnpm install` in that directory.

### Coming from a hand-patched install

If you previously got the same two rows by editing the first-party
`ui-settings-general/lib/client.js` directly, **undo that patch before
installing this plugin** — otherwise both sets appear (2 rows patched into the
settings seat + 2 rows from this plugin's slot registration = 4 rows). Undoing
it is usually a matter of restoring the backup file (e.g. `client.js.bak-*`) and
reloading the page; no restart needed.

## Usage

### Refresh

One click: drop every Cache Storage bucket, then reload the page.

Client bundles are served content-hashed and `immutable`, so a plain
`location.reload()` can still be answered from cache with the old bytes.

### Restart (asks to confirm)

A restart ends everything the host was doing — including an in-flight turn — so
it takes two clicks:

1. **Click Restart** — the row only arms itself; nothing is sent;
2. **Click Confirm** — that is what restarts.

While armed:

| Cancel | How |
| --- | --- |
| **✕** button | present in the wide column |
| **Escape** | the listener is mounted with the armed state |
| **6 seconds** idle | disarms itself, so a stray click cannot stay primed |

The 56px rail cannot fit two buttons, so there the armed state is the same
circle in the error colour; Escape and the timeout cancel it.

### When it fails

The row never pretends to have worked — the failure lands in the row's label and
tooltip:

| Situation | What you see |
| --- | --- |
| No dshmarket (no restart endpoint) | 重启失败 / "Restart failed", tooltip says no endpoint was found |
| The host refuses self-restart (systemd/launchd supervisor, or a debugger attached) | "Restart failed", tooltip explains the refusal |
| A plugin operation holds the lock (HTTP 409) | retried for ~12s before reporting |
| No new boot id within 90s | "Restart failed — restart it manually" |

## Scope and limits

- **Restart depends on dshmarket.** This plugin does not implement a restart of
  its own: it calls the dsh Market's own one-click restart, which already owns
  the platform-correct relaunch, the loopback same-origin guard, the
  supervisor/debugger refusals and the operation lock. The point is not to
  become a second way to kill the host. Without dshmarket, Refresh still works
  and Restart says exactly what is missing.
- **Web profiles only.** The plugin registers into the `sidebar.footer.action`
  slot; a non-web profile never loads the browser half.
- **One known side effect of the desktop (Electron) shell:** a dshmarket restart
  hands the server to a detached process the Electron main process no longer
  owns. After the window closes it keeps the fixed port (and its locks on the
  files under `node_modules`), so the *next* launch dies with `EADDRINUSE` and
  quietly talks to the stale process. That is inherent to the market's restart
  mechanism rather than something this plugin introduces; affected deployments
  can release the port in their own shell's shutdown path.

## Design notes

1. **A slot registration, not a patch.** The rows register into
   `sidebar.footer.action`, the list slot ui-sidebar declares for the foot (it
   renders before `settingsArea`, so the rows land above Settings). The
   first-party `ui-settings-general` is never touched, so this installs and
   uninstalls cleanly and survives DSH upgrades.
2. **The geometry is restated, not imported.** The slot hands a registrant only
   the column state (`wide`), and the official row's CSS-module class names are
   private and hashed. The plugin therefore restates that geometry under its own
   `hc-*` names, and the tests pin those declarations.
3. **Restart goes through the Market's endpoint** — see above: one less
   independent way to kill the host.
4. **The confirmation is inline, not a modal.** It appears where the click
   happened, renders in the rail too, and never competes for the page's z-order
   with other plugins.
5. **The host half is empty.** Nothing here needs host capability: restart is
   delegated, reload is something the browser does itself. An empty host half is
   what makes the package installable on any web profile — no routes, no disk.

## Development

```
dsh-harness-control/
├── lib/index.js        host half: an empty mount point
├── lib/client.js       browser half: the only file worth reading, hand-written, no build step
├── cordis.patch.yml    bundle layer: inserts the plugin row into a profile
├── test/shim.mjs       dependency-free React stand-in + page stand-in
├── test/client.test.mjs
└── package.json
```

Tests (**zero dependencies** — they run on bare Node):

```bash
node --test test/          # or: node test/client.test.mjs
```

They load the real `lib/client.js` through `window.__ModuleLoader__.load`, call
`apply(ctx)` with stubbed services, render the wide column, the rail and the
armed state, and click through the flows with a stubbed network and clock: the
first click sends nothing, the confirm does the POST, cancel disarms, refresh
drops the caches before reloading, and a refusing host ends at 重启失败. They
also assert the zh/en key sets match and that the shipped stylesheet carries the
sidebar-foot geometry.

With `DSH_HOME` set, the last test reads the installed first-party
`ui-settings-general/lib/client.js` and diffs this plugin's `.hc-trigger` /
`.hc-trigger-rail` declarations against it; without a DSH install it skips.
**Change the `css` array and this test will tell you when upstream's row moves.**

Copy lives in the `zh` / `en` dictionaries in `lib/client.js` (the key sets must
stay equal); geometry lives in the `css` array at the top of the same file.

## Uninstall

```bash
dsh plugin --profile web remove dsh-harness-control
```

Then restart Harness once. The plugin keeps no persistent state: the two rows
disappear and that is all.

## Compatibility

- Developed and tested against DSH `0.1.5-rc.2` and dshmarket `1.47.0`.
- The browser half requires only `react` and
  `@deepseek-ai/dsh-client-ui-primitives` from the web shell's static module
  table — no Node-side capability.
- The host half exports a single empty `apply`, so it makes no demands on the
  DSH version.

## License

[MIT](./LICENSE)
