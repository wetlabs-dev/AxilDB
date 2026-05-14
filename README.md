# AxilDB — Plant Lineage Tracker

Personal horticultural accession database, propagation tracker, bloom journal, QR tag generator, bulk PDF label exporter, sport review queue, and lineage graph.

## Local setup

```bash
cp .env.example .env
npm install
npx prisma generate
npx prisma db push
npm run db:seed
npm run dev
```

Open http://localhost or https://axildb.com, depending on where it is deployed.

## Docker with HTTPS

`docker-compose.yml` includes Caddy as the public web server. Caddy listens on ports 80 and 443, proxies to the app container, and automatically requests/renews Let's Encrypt certificates for `axildb.com`.

Before running it in production, point DNS for `axildb.com` at the server and make sure inbound ports 80 and 443 are open.

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

- Postgres-backed schema for durable deployment.
- Full edit/delete screens for plant definitions, plant instances, propagation events, bloom records, notes, and governing bodies.
- Dagre-based automatic lineage graph layout through React Flow.
- Dedicated Sport Review queue.
- Stable sport/cultivar wizard that creates a new cultivar definition and reassigns the stable sport plant while preserving lineage.
- Bulk tag PDF sheet export from `/labels`.
- Search/filter page across plant definitions and plant instances.

## Reset local data

```bash
docker compose down -v
docker compose up -d --build
npx prisma db push
npm run db:seed
```

## Notes

This is intentionally a small personal app. It uses string fields instead of Prisma enums to keep future data changes simple.
