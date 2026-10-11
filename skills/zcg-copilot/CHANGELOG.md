# Changelog

## 1.1.0 - 2026-10-09

### Changed
- Queue cap (100 proposals) now reports rows with an explicit incomplete-coverage
  warning instead of failing the whole report; requested-amount totals are still
  refused at the cap.
- Helpers retry a transient network failure once, matching the documented agent
  behavior.
- SKILL.md: pgpz source marked optional and often slow; efficiency guidance for
  server-side filters and CSV; frontmatter gains license, compatibility, and
  version metadata (1.1.0).
- Installer pin updated to skills@1.7.2.

### Fixed
- The published API index at /api/zcg now lists /api/zcg/office.
