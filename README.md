# AxilDB — Plant Lineage Tracker

Personal horticultural accession database, propagation tracker, bloom journal, QR tag generator, bulk PDF label exporter, sport review queue, and lineage graph.

## Local SQLite setup

```bash
cp .env.example .env
npm install
npx prisma generate
npx prisma db push
npm run db:seed
npm run dev
```

Open http://localhost:3000.

The seed script creates the first admin user:

```text
Email: axildb@damonius.com
Password: password
```

## Roles and audit log

- Unauthenticated visitors can browse the app in read-only mode.
- Loggers can add new records such as plants, blooms, propagations, notes, photos, and sport stability records.
- Admins can add, edit, delete, archive/restore, manage users, manage governing bodies, and view the audit log.
- Authenticated mutations are written to the admin-only audit log.

## v2 additions

- SQLite-first schema for simple local use.
- Full edit/delete screens for plant definitions, plant instances, propagation events, bloom records, notes, and governing bodies.
- Dagre-based automatic lineage graph layout through React Flow.
- Dedicated Sport Review queue.
- Stable sport/cultivar wizard that creates a new cultivar definition and reassigns the stable sport plant while preserving lineage.
- Bulk tag PDF sheet export from `/labels`.
- Search/filter page across plant definitions and plant instances.

## Reset local data

```bash
rm prisma/axildb.db
npx prisma db push
npm run db:seed
```

## Notes

This is still intentionally a local-first personal app. It uses string fields instead of Prisma enums because SQLite support is simpler that way.
