# Backup deletion

Server Management deletes a selected backup folder whether or not it has a linked Backup Run. This includes `manual-*`, `deploy-*`, and legacy `axildb-*` folders. A linked active run prevents deletion; completed run history is retained with status `DELETED`. Restore request history is retained.

The selected folder is inspected directly rather than rescanning every sibling. Removal is verified before success is returned. Folder paths remain confined to the configured backup root, excluding `.migration` and directory symlinks.

The confirmation button enables only when the folder name matches. While deleting, repeat submissions are blocked. Failures appear beside the button and preserve the entered confirmation. Permission, read-only storage, and busy-folder errors give specific diagnostics; an uncertain response asks the operator to refresh before retrying.

A production-only failure was reported for newer unlinked folders, but baseline local tests could delete them. This change improves the deletion path and exposes failures; it does not establish production filesystem ownership as the cause. If the deployed UI reports a permission error, inspect the app container backup mount and the selected folder's ownership and directory write permissions. Do not broadly change permissions across all backups.

## Verification

- `npm run check:backup-deletion` uses private disposable filesystem fixtures; checks all naming styles, linked history, active-run protection, missing folders, path confinement and symlinks. It rejects any attempt to scan the full backup listing during deletion.
- `scripts/check-backup-deletion-ui.mjs` requires an isolated PostgreSQL database on localhost port 55439 and a private `axildb-delete-ui-*` temporary root. Run a production app on port 3107 with those same settings. It checks confirmation, real server-action deletion, inline missing-folder and permission errors, and retry after correcting fixture permissions. It creates and removes only its own fixture user, history records and backup folders. Run as a non-root user for the permission check.
- Production build, type checking and targeted lint pass.

Deploy through Web deployment. No Compose, host agent, or schema changes are included.
