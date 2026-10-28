# Backup deletion

See [Backup storage reclamation and diagnostics](BACKUP_STORAGE.md) for the current lifecycle, safety rules, production diagnostics and tests.

Deletion now records a durable request and runs through the existing backups worker. The UI distinguishes requested, running, failed and physically removed states. It measures the backup filesystem after removal rather than claiming nominal archive sizes are reclaimed space. Completed history is retained. Failed or interrupted operations can be previewed and retried through confirmed garbage collection.

Manual and legacy routine backups can be selected after validation; deployment checkpoints, migration data, active work and unknown artifacts remain protected for recovery review. No Docker pruning or VirtualBox compaction is performed.
