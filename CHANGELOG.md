# Changelog

## 1.0.0 — 2026-09-15

First release.

- 重启 / 刷新 rows on the sidebar foot, directly above Settings, registered into
  `sidebar.footer.action` so the settings plugin stays untouched.
- Restart is two-step: the first click arms the row, the second one restarts.
  Escape, the explicit cancel button (wide column) and a 6s timeout disarm it.
- Restart drives the dsh Market's own one-click restart and reloads the page
  once a new boot id answers; a host that refuses self-restart, or has no
  Market at all, says so in the row instead of failing silently.
- Refresh drops every Cache Storage bucket before reloading, so a patched
  client bundle is actually re-fetched.
- Row geometry restated on the same design tokens as the settings trigger,
  with a test that diffs it against the installed first-party stylesheet.
- Zero runtime dependencies; the test suite runs on bare Node.
