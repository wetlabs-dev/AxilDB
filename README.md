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

Open http://localhost locally or https://app.axildb.com in production.

## Docker with HTTPS

`docker-compose.yml` includes Caddy as the public web server. Caddy listens on ports 80 and 443, proxies to the app container, and automatically requests/renews Let's Encrypt certificates for `axildb.com`, `www.axildb.com`, and `app.axildb.com`.

Before running it in production, point DNS for `axildb.com`, `www.axildb.com`, and `app.axildb.com` at the server and make sure inbound ports 80 and 443 are open.

In production:

- `https://axildb.com` serves the public splash page.
- `https://app.axildb.com` serves the actual AxilDB app.
- App-generated QR and label links should use `NEXT_PUBLIC_APP_URL=https://app.axildb.com`.

The seed script creates the first admin user:

```text
Email: admin@axildb.com
Password: password
```

## Roles and audit log

- Unauthenticated visitors can browse the app in read-only mode.
- Loggers can add new records such as plants, blooms, propagations, notes, photos, and sport stability records.
- Admins can add, edit, delete, archive/restore, manage users, manage governing bodies, and view the audit log.
- Authenticated mutations are written to the admin-only audit log.

## v2 additions

- Postgres-backed schema for durable deployment.
- Public splash page at `axildb.com`, with the app hosted at `app.axildb.com`.
- Taxonomy confidence, acquisition/provisional labels, authority fields, and metadata-rich aliases for plant definitions.
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

## License and Branding

AxilDB source code is licensed under the GNU Affero General Public License v3.0. See `LICENSE`.

The AxilDB name, marks, logos, screenshots, and visual identity are not licensed for reuse as branding for derivative projects unless permission is granted separately. Forks should use their own project names and branding.

## Support

The splash page includes a Ko-fi donation link. If your Ko-fi handle changes, update `NEXT_PUBLIC_DONATE_URL` in `.env` or `docker-compose.yml`.
