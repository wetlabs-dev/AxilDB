"""Portable, offline instance migration. Python stdlib; PostgreSQL tools do SQL work.

Archive bytes and row fingerprints are streamed. No extractall, shell interpolation,
or secret environment values are written to manifests or diagnostic output.
"""
from __future__ import annotations
import contextlib
import datetime as dt
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import sqlite3
import subprocess
import tarfile
import tempfile
import uuid

FORMAT = 'axildb-instance-migration'
VERSION = 1
CHUNK = 1024 * 1024
MAX_METADATA = 8 * CHUNK
RESERVE = 256 * CHUNK
ROUTINE_FILES = {'axildb.dump', 'uploads.tar.gz', 'labels.tar.gz', 'manifest.txt', 'manifest.json'}
REQUIREMENTS = {
    'DATABASE_URL': 'Configure destination database; PostgreSQL role needs CREATEDB and ownership for staged restore.',
    'TOTP_ENCRYPTION_KEY': 'Transfer original effective key separately (legacy AUTH_SECRET fallback). Required to decrypt existing 2FA.',
    'NEXT_PUBLIC_APP_URL': 'Configure destination origin and review DNS/cookies/exhibit links.',
    'TZ / AXILDB_DEFAULT_TIMEZONE': 'Match source scheduling timezone; configure explicitly.',
    'SMTP_* / EMAIL_DELIVERY_MODE': 'Configure and test separately before releasing outbound hold.',
    'OPENAI_API_KEY / AXILDB_* / OPENAI_*': 'Review AI enablement, model, budget and worker environment settings.',
    'VAPID_PRIVATE_KEY / NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_SUBJECT': 'Transfer keys separately or renew browser subscriptions; review origin.',
    'AXILDB_BACKUP_ROOT': 'Destination-owned storage path; mount consistently for every service.',
    'TLS / reverse proxy / OS / SSH / DNS': 'Provision independently. Machine identity is excluded.',
}


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def atomic_json(file: Path, data):
    file.parent.mkdir(parents=True, exist_ok=True)
    tmp = file.with_name(file.name + '.tmp-' + uuid.uuid4().hex)
    with tmp.open('x', encoding='utf8') as f:
        os.chmod(tmp, 0o600)
        json.dump(data, f, indent=2)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, file)
    sync_directory(file.parent)


def sync_directory(directory):
    fd = os.open(directory, os.O_RDONLY)
    try: os.fsync(fd)
    finally: os.close(fd)


def digest(file: Path):
    h = hashlib.sha256()
    with file.open('rb') as f:
        for chunk in iter(lambda: f.read(CHUNK), b''):
            h.update(chunk)
    return h.hexdigest()


def safe_path(name):
    if not isinstance(name, str) or not name or len(name) > 4096 or '\\' in name or '\x00' in name:
        raise ValueError('Invalid archive path')
    p = PurePosixPath(name)
    if p.is_absolute() or any(x in ('', '.', '..') for x in name.split('/')) or ':' in name:
        raise ValueError('Unsafe archive path')
    if any(ord(c) < 32 for c in name):
        raise ValueError('Control character in archive path')
    return name


def allowed_payload(name):
    safe_path(name)
    parts = name.split('/')
    if name == 'database/axildb.dump':
        return True
    if len(parts) >= 3 and parts[:2] in (['storage', 'uploads'], ['storage', 'labels']):
        return True
    if len(parts) == 3 and parts[0] == 'backups' and re.fullmatch(r'axildb-[A-Za-z0-9_-]+', parts[1]) and parts[2] in ROUTINE_FILES:
        return True
    return len(parts) == 2 and parts[0] == 'history' and bool(re.fullmatch(r'[A-Za-z0-9_-]+\.json', parts[1]))


def walk(root: Path):
    if root.is_symlink():
        raise ValueError('Storage roots must not be symlinks')
    if not root.exists():
        return
    with os.scandir(root) as entries:
        for e in entries:
            p = Path(e.path)
            if e.is_symlink():
                raise ValueError('Symlinks are not supported in persistent storage')
            if e.is_dir(follow_symlinks=False):
                yield from walk(p)
            elif e.is_file(follow_symlinks=False):
                yield p
            else:
                raise ValueError('Special files are not supported in persistent storage')


def space(root: Path, required: int):
    root.mkdir(parents=True, exist_ok=True)
    free = shutil.disk_usage(root).free
    if free < required + RESERVE:
        raise ValueError(f'Insufficient space: need approximately {required + RESERVE} bytes; available {free} bytes')


def run(args, *, env=None, stdin=None, stdout=None):
    # Keep command arguments/credentials and arbitrary SQL diagnostics out of logs.
    with tempfile.TemporaryFile() as errors:
        result = subprocess.run(args, env=env, stdin=stdin, stdout=stdout or subprocess.DEVNULL, stderr=errors)
        if result.returncode:
            raise RuntimeError(f'{Path(args[0]).name} operation failed (exit {result.returncode}); check service health, permissions and PostgreSQL compatibility')


class Database:
    def __init__(self, name='axildb', user='plants', container=None):
        self.name, self.user, self.container = name, user, container
        self.prefix = ['docker', 'exec', '-i', container] if container else ['docker', 'compose', 'exec', '-T', 'db']

    def command(self, program, args=(), database=None):
        return self.prefix + [program, '-U', self.user, '-d', database or self.name, *args]

    def sql(self, query, database=None):
        with tempfile.TemporaryFile() as inp, tempfile.TemporaryFile() as out:
            inp.write(query.encode()); inp.seek(0)
            run(self.command('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], database), stdin=inp, stdout=out)
            out.seek(0)
            result = out.read(MAX_METADATA + 1)
            if len(result) > MAX_METADATA:
                raise ValueError('Database metadata exceeds supported limit')
            return result.decode().strip()

    def scalar(self, query, database=None):
        return json.loads(self.sql(query, database))

    def quiet(self):
        n = int(self.sql("SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND backend_type='client backend'"))
        if n:
            raise ValueError('Database still has client connections. Stop ALL application, worker and external writers before continuing.')

    def quiet_names(self, names):
        selected = ','.join(literal(name) for name in names if name)
        n = int(self.sql(f"SELECT count(*) FROM pg_stat_activity WHERE datname IN ({selected}) AND pid<>pg_backend_pid() AND backend_type='client backend'", 'postgres'))
        if n: raise ValueError('Database clients are still connected; stop writers before recovery')

    def version(self):
        return int(self.sql('SHOW server_version_num'))

    def size(self):
        return int(self.sql('SELECT pg_database_size(current_database())'))

    def disk_space(self, required):
        # Check the database volume, separately from the host archive/staging volume.
        directory = self.sql('SHOW data_directory')
        with tempfile.TemporaryFile() as out:
            run(self.prefix + ['df', '-Pk', directory], stdout=out)
            out.seek(0)
            lines = out.read(65536).decode().splitlines()
            free = int(lines[-1].split()[3]) * 1024
        if free < required + RESERVE:
            raise ValueError(f'Insufficient PostgreSQL volume space: need {required + RESERVE}, available {free}')

    def tables(self, database=None):
        return self.scalar("SELECT coalesce(json_agg(tablename ORDER BY tablename),'[]'::json) FROM pg_tables WHERE schemaname='public'", database)

    def snapshot(self, database=None):
        result = {}
        for table in self.tables(database):
            # PostgreSQL externally sorts when necessary. Stream canonical rows rather
            # than building a JSON array in either Python or the database.
            q = ident(table)
            query = f"SET timezone='UTC'; SET extra_float_digits=3; COPY (SELECT row_to_json(t)::text FROM public.{q} t ORDER BY row_to_json(t)::text COLLATE \"C\") TO STDOUT;"
            with tempfile.TemporaryFile() as inp, tempfile.TemporaryFile() as err:
                inp.write(query.encode()); inp.seek(0)
                proc = subprocess.Popen(self.command('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], database), stdin=inp, stdout=subprocess.PIPE, stderr=err)
                h = hashlib.sha256(); count = 0
                try:
                    while chunk := proc.stdout.read(CHUNK):
                        h.update(chunk); count += chunk.count(b'\n')
                    if proc.wait():
                        raise RuntimeError('Database fingerprint failed')
                finally:
                    proc.stdout.close()
                    if proc.poll() is None:
                        proc.kill(); proc.wait()
                result[table] = {'count': count, 'sha256': h.hexdigest()}
        return result

    def sequences(self, database=None):
        names = self.scalar("SELECT coalesce(json_agg(sequencename ORDER BY sequencename),'[]'::json) FROM pg_sequences WHERE schemaname='public'", database)
        return {name: self.scalar(f'SELECT row_to_json(t) FROM (SELECT last_value,is_called FROM public.{ident(name)}) t', database) for name in names}

    def migrations(self, database=None):
        if '_prisma_migrations' not in self.tables(database):
            return []
        return self.scalar('SELECT coalesce(json_agg(t ORDER BY migration_name),\'[]\'::json) FROM (SELECT migration_name,checksum,finished_at IS NOT NULL AND rolled_back_at IS NULL AS applied, rolled_back_at IS NOT NULL AS "rolledBack" FROM "_prisma_migrations") t', database)

    def dump(self, target):
        with target.open('xb') as f:
            run(self.command('pg_dump', ['-Fc', '--no-owner', '--no-acl']), stdout=f)

    def restore(self, source, database):
        with source.open('rb') as f:
            run(self.command('pg_restore', ['--exit-on-error', '--single-transaction', '--no-owner', '--no-acl'], database), stdin=f)

    def validate_dump(self, source):
        with source.open('rb') as f:
            # pg_restore --list has no database argument.
            run(self.prefix + ['pg_restore', '--list'], stdin=f)

    def check_totp(self, root, database=None):
        if 'UserTwoFactor' not in self.tables(database): return
        if not int(self.sql('SELECT count(*) FROM \"UserTwoFactor\"', database)): return
        with tempfile.TemporaryFile() as inp, tempfile.TemporaryFile() as out:
            inp.write(b'SELECT row_to_json(t) FROM (SELECT \"secretCiphertext\", \"recoveryCodesCiphertext\" FROM \"UserTwoFactor\") t;'); inp.seek(0)
            run(self.command('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], database), stdin=inp, stdout=out)
            out.seek(0)
            run(['node', str(root / 'scripts/migration/verify-totp.cjs')], stdin=out)

    def check_photos(self, uploads, database=None):
        if 'Photo' not in self.tables(database):
            return 0
        table_set = set(self.tables(database))
        # Photo.entityId is polymorphic, so PostgreSQL cannot supply an FK.
        mapping = {'_'.join(re.findall(r'[A-Z][a-z0-9]*', t)).upper(): t for t in table_set}
        kinds = self.scalar("""SELECT coalesce(json_agg(DISTINCT "entityType"), '[]'::json) FROM "Photo" """, database)
        for kind in kinds:
            target = mapping.get(kind)
            if not target: raise ValueError('Unknown photo entity type: ' + str(kind))
            missing = int(self.sql(f'SELECT count(*) FROM \"Photo\" p LEFT JOIN {ident(target)} t ON t.id=p.\"entityId\" WHERE p.\"entityType\"={literal(kind)} AND t.id IS NULL', database))
            if missing: raise ValueError('Broken photo entity references: ' + kind)
        with tempfile.TemporaryFile() as inp, tempfile.TemporaryFile() as out:
            inp.write(b'SELECT to_json(path) FROM "Photo";'); inp.seek(0)
            run(self.command('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], database), stdin=inp, stdout=out)
            out.seek(0); count = 0
            for line in out:
                p = json.loads(line)
                if not isinstance(p, str) or not p.lstrip('/').startswith('uploads/'):
                    raise ValueError('Photo reference is outside supported uploads storage')
                relative = safe_path(p.lstrip('/')[8:])
                file = uploads / relative
                if not file.is_file() or file.is_symlink():
                    raise ValueError('Missing or unsafe photo reference: ' + relative)
                count += 1
            return count


def ident(name):
    return '"' + name.replace('"', '""') + '"'


def literal(value):
    return "'" + value.replace("'", "''") + "'"


def validate_manifest(m):
    if not isinstance(m, dict) or m.get('format') != FORMAT or type(m.get('formatVersion')) is not int or m['formatVersion'] != VERSION:
        raise ValueError('Unsupported migration format/version')
    for key in ('createdAt', 'appVersion', 'schemaSha256', 'inventorySha256'):
        if not isinstance(m.get(key), str) or not m[key]:
            raise ValueError('Missing manifest field: ' + key)
    try:
        if dt.datetime.fromisoformat(m['createdAt']).tzinfo is None: raise ValueError()
    except ValueError:
        raise ValueError('Manifest creation time must include a timezone') from None
    for key in ('schemaSha256', 'inventorySha256'):
        if not re.fullmatch('[a-f0-9]{64}', m[key]):
            raise ValueError('Invalid manifest checksum')
    if m.get('gitCommit') is not None and (not isinstance(m['gitCommit'], str) or not re.fullmatch('[a-fA-F0-9]{7,64}', m['gitCommit'])):
        raise ValueError('Invalid source revision')
    for key in ('totalBytes', 'fileCount', 'databaseBytes'):
        if type(m.get(key)) is not int or m[key] < 0:
            raise ValueError('Invalid manifest size/count')
    database = m.get('database')
    if not isinstance(database, dict) or database.get('format') != 'pg_dump_custom' or database.get('engine') != 'postgresql' or type(database.get('version')) is not int or database['version'] < 100000:
        raise ValueError('Unsupported database format/version')
    if not isinstance(m.get('tables'), dict) or not isinstance(m.get('migrations'), list):
        raise ValueError('Missing database inventory')
    for name, item in m['tables'].items():
        if not isinstance(name, str) or not isinstance(item, dict) or type(item.get('count')) is not int or item['count'] < 0 or not isinstance(item.get('sha256'), str) or not re.fullmatch('[a-f0-9]{64}', item['sha256']):
            raise ValueError('Invalid table fingerprint')
    if not isinstance(m.get('sequences'), dict) or not isinstance(m.get('destinationRequirements'), dict):
        raise ValueError('Missing sequence state or destination requirements')
    for item in m['sequences'].values():
        if not isinstance(item, dict) or type(item.get('last_value')) is not int or type(item.get('is_called')) is not bool:
            raise ValueError('Invalid sequence state')
    for item in m['migrations']:
        if not isinstance(item, dict) or not isinstance(item.get('migration_name'), str) or not isinstance(item.get('checksum'), str) or not re.fullmatch('[a-f0-9]{64}', item['checksum']) or type(item.get('applied')) is not bool:
            raise ValueError('Invalid Prisma migration state')
        if 'rolledBack' in item and type(item['rolledBack']) is not bool:
            raise ValueError('Invalid rolled-back migration state')
    storage = m.get('storage')
    if not isinstance(storage, dict) or set(storage) != {'uploads', 'labels', 'backups', 'history'}:
        raise ValueError('Missing persistent storage summary')
    for item in storage.values():
        if not isinstance(item, dict) or any(type(item.get(k)) is not int or item[k] < 0 for k in ('files', 'bytes')):
            raise ValueError('Invalid storage summary')
    if m['fileCount'] != 1 + sum(item['files'] for item in storage.values()):
        raise ValueError('Storage summary does not match file count')
    return m


def revision(root):
    for key in ('GIT_COMMIT', 'SOURCE_COMMIT', 'VERCEL_GIT_COMMIT_SHA', 'RENDER_GIT_COMMIT'):
        v = os.environ.get(key, '').strip()
        if re.fullmatch('[a-fA-F0-9]{7,64}', v):
            return v
    try:
        v = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, stderr=subprocess.DEVNULL, timeout=3).decode().strip()
        if re.fullmatch('[a-fA-F0-9]{40,64}', v): return v
    except (OSError, subprocess.SubprocessError):
        pass
    p = root / 'REVISION'
    if p.exists() and re.fullmatch('[a-fA-F0-9]{7,64}', p.read_text().strip()):
        return p.read_text().strip()
    return None


class Engine:
    def __init__(self, root, db, backup_root=None, stage=lambda s: None):
        self.root = Path(root).resolve()
        self.backups = Path(backup_root or self.root / 'backups').absolute()
        self.control = self.backups / '.migration'
        self.control.mkdir(parents=True, exist_ok=True)
        os.chmod(self.control, 0o700)
        self.db, self.stage = db, stage
        self.uploads, self.labels = self.root / 'public/uploads', self.root / 'public/labels'
        for key in ('AXILDB_UPLOAD_DIR', 'AXILDB_UPLOADS_ROOT'):
            if os.environ.get(key) and Path(os.environ[key]).resolve() != self.uploads:
                raise ValueError(f'{key} differs from application upload location; reconcile storage before migration')
        roots = [self.backups.resolve(), self.uploads.resolve(), self.labels.resolve()]
        if any(a == b or a in b.parents or b in a.parents for i,a in enumerate(roots) for b in roots[i+1:]):
            raise ValueError('Persistent storage roots must not overlap')
        for p in [self.backups, self.uploads, self.labels]:
            if p.is_symlink() or p.parent.is_symlink(): raise ValueError('Storage root and parent must not be symlinks')

    def files(self):
        for category, root in [('uploads', self.uploads), ('labels', self.labels)]:
            for p in walk(root):
                yield p, f'storage/{category}/{p.relative_to(root).as_posix()}'
        with os.scandir(self.backups) as entries:
            for entry in entries:
                if entry.name == '.migration': continue
                if not re.fullmatch(r'axildb-[A-Za-z0-9_-]+', entry.name) or not entry.is_dir(follow_symlinks=False):
                    raise ValueError('Unrecognized backup-root entry; move unrelated files outside backup root: ' + entry.name)
                folder = Path(entry.path)
                for p in walk(folder):
                    if p.parent != folder or p.name not in ROUTINE_FILES:
                        raise ValueError('Unexpected routine backup component (possible recursive archive): ' + p.name)
                    yield p, f'backups/{entry.name}/{p.name}'
        for history in (self.control / 'jobs', self.control / 'imported-history'):
            for p in walk(history):
                if p.parent == history and re.fullmatch(r'[A-Za-z0-9_-]+\.json', p.name):
                    if p.stat().st_size > MAX_METADATA: raise ValueError('Migration history report is oversized')
                    record = json.loads(p.read_text())
                    if record.get('status') not in ('REQUESTED', 'RUNNING'):
                        local = self.control / 'jobs' / p.name
                        if history.name == 'imported-history' and local.exists():
                            if digest(local) != digest(p): raise ValueError('Conflicting migration history IDs; retain both under distinct IDs before export')
                            continue
                        yield p, 'history/' + p.name

    def preflight(self):
        sizes = {k: {'files': 0, 'bytes': 0} for k in ('uploads', 'labels', 'backups', 'history')}
        for p, name in self.files():
            cat = name.split('/')[1] if name.startswith('storage/') else name.split('/')[0]
            sizes[cat]['files'] += 1; sizes[cat]['bytes'] += p.stat().st_size
        database_bytes = self.db.size()
        return {'createdAt': now(), 'databaseBytes': database_bytes, 'storage': sizes,
                'estimatedBytes': database_bytes + sum(x['bytes'] for x in sizes.values()),
                'recordCounts': {t: int(self.db.sql(f'SELECT count(*) FROM public.{ident(t)}')) for t in self.db.tables()},
                'destinationRequirements': REQUIREMENTS}

    def compatibility(self, m):
        if digest(self.root / 'prisma/schema.prisma') != m['schemaSha256']:
            raise ValueError('Schema differs. Deploy the source revision first, restore, then upgrade using Prisma migrations.')
        commit = revision(self.root)
        source_commit = m.get('gitCommit')
        if source_commit and commit and not (commit.startswith(source_commit) or source_commit.startswith(commit)):
            raise ValueError('Application revision differs. Deploy the source revision before restoring.')
        version = json.loads((self.root / 'package.json').read_text())['version']
        if version != m['appVersion']:
            raise ValueError('Application version differs. Deploy the source application version first.')
        source_major, target_major = m['database']['version'] // 10000, self.db.version() // 10000
        if target_major < source_major:
            raise ValueError('Destination PostgreSQL is older than source; upgrade destination first.')
        for item in m['migrations']:
            name = safe_path(item.get('migration_name', ''))
            if item.get('rolledBack') is True:
                continue  # Historical rolled-back attempts are data, not applied schema.
            if '/' in name or item.get('applied') is not True:
                raise ValueError('Source contains an incomplete migration; repair source migration history first.')
            p = self.root / 'prisma/migrations' / name / 'migration.sql'
            if not p.is_file() or digest(p) != item.get('checksum'):
                raise ValueError('Prisma migration history differs; deploy matching source revision.')

    def create(self, target: Path):
        self.db.quiet()
        other_schemas = int(self.db.sql("SELECT count(*) FROM pg_tables WHERE schemaname NOT IN ('public','information_schema') AND schemaname NOT LIKE 'pg_%'"))
        if other_schemas: raise ValueError('Additional database schemas require a persistence audit before export; v1 verifies the application public schema')
        self.stage('Preparing')
        summary = self.preflight()
        space(self.control, summary['estimatedBytes'] * 3)
        if target.exists(): raise ValueError('Archive already exists')
        with tempfile.TemporaryDirectory(prefix='create-', dir=self.control) as tmp:
            work = Path(tmp)
            dump = work / 'axildb.dump'
            self.stage('Exporting database')
            self.db.dump(dump)
            self.db.validate_dump(dump)
            tables = self.db.snapshot()
            self.db.check_photos(self.uploads)
            inventory = work / 'file-inventory.jsonl'
            count = total = 0
            self.stage('Collecting media and backup history; calculating checksums')
            with inventory.open('w') as out:
                for p, name in [(dump, 'database/axildb.dump')]:
                    item = {'path': name, 'size': p.stat().st_size, 'sha256': digest(p)}
                    out.write(json.dumps(item) + '\n'); count += 1; total += item['size']
                for p, name in self.files():
                    if not allowed_payload(name): raise ValueError('Unsupported payload path')
                    if name.startswith('backups/') and p.name in ('uploads.tar.gz', 'labels.tar.gz'):
                        validate_routine_media(p, p.name.split('.')[0])
                    item = {'path': name, 'size': p.stat().st_size, 'sha256': digest(p)}
                    out.write(json.dumps(item) + '\n'); count += 1; total += item['size']
            m = {'format': FORMAT, 'formatVersion': VERSION, 'createdAt': now(),
                 'appVersion': json.loads((self.root / 'package.json').read_text())['version'],
                 'gitCommit': revision(self.root), 'schemaSha256': digest(self.root / 'prisma/schema.prisma'),
                 'database': {'engine': 'postgresql', 'format': 'pg_dump_custom', 'version': self.db.version()},
                 'sequences': self.db.sequences(), 'databaseBytes': summary['databaseBytes'], 'migrations': self.db.migrations(), 'tables': tables,
                 'storage': summary['storage'], 'totalBytes': total, 'fileCount': count,
                 'inventorySha256': digest(inventory), 'destinationRequirements': REQUIREMENTS,
                 'consistency': 'offline-all-writers-stopped', 'warnings': ['Bundle contains private application data. Transfer only through trusted encrypted channels.']}
            if not m['gitCommit']: m['warnings'].append('Source revision unavailable. Configure GIT_COMMIT/SOURCE_COMMIT or ship a REVISION file; schema and version checks remain mandatory.')
            validate_manifest(m)
            atomic_json(work / 'manifest.json', m)
            self.stage('Compressing archive')
            partial = target.with_suffix(target.suffix + '.partial')
            try:
                with tarfile.open(partial, 'w:gz', format=tarfile.PAX_FORMAT) as tar:
                    for p, name in [(work / 'manifest.json', 'manifest.json'), (inventory, 'metadata/file-inventory.jsonl'), (dump, 'database/axildb.dump')]:
                        add_file(tar, p, name)
                    for p, name in self.files(): add_file(tar, p, name)
                self.stage('Verifying archive')
                with self.validated(partial) as (_, staged):
                    self.db.validate_dump(staged / 'database/axildb.dump')
                # Recheck database after copying to detect uncooperative writers.
                self.db.quiet()
                if self.db.snapshot() != tables: raise ValueError('Database changed during snapshot; archive rejected')
                os.chmod(partial, 0o600)
                with partial.open('rb') as f: os.fsync(f.fileno())
                os.replace(partial, target)
                sync_directory(target.parent)
            finally:
                partial.unlink(missing_ok=True)
        return m

    @contextlib.contextmanager
    def validated(self, archive):
        with tempfile.TemporaryDirectory(prefix='inspect-', dir=self.control) as tmp:
            work = Path(tmp)
            m = unpack_verified(Path(archive), work)
            yield m, work

    def verify_restored(self, m, work, database=None):
        self.stage('Verifying all tables, relationships and media')
        actual = self.db.snapshot(database)
        if actual != m['tables']:
            mismatch = sorted(set(actual) ^ set(m['tables']) | {k for k in actual.keys() & m['tables'].keys() if actual[k] != m['tables'][k]})
            raise ValueError('Database equivalence failed: ' + ', '.join(mismatch))
        if self.db.sequences(database) != m.get('sequences', {}):
            raise ValueError('Sequence state differs')
        # pg_restore created and validated all FK constraints; reject NOT VALID ones.
        invalid = int(self.db.sql("SELECT count(*) FROM pg_constraint WHERE contype IN ('f','c') AND NOT convalidated AND connamespace='public'::regnamespace", database))
        if invalid: raise ValueError('Database contains unvalidated relational constraints')
        photos = self.db.check_photos(work / 'storage/uploads', database)
        return {'verifiedAt': now(), 'tables': actual, 'photoReferences': photos, 'result': 'verified'}


def add_file(tar, file, name):
    if file.is_symlink(): raise ValueError('Symlink encountered while archiving')
    info = tar.gettarinfo(str(file), arcname=name)
    if not info.isfile(): raise ValueError('Only regular files may be archived')
    info.uid = info.gid = 0; info.uname = info.gname = ''; info.mode = 0o600
    with file.open('rb') as f: tar.addfile(info, f)
    tar.members.clear()  # tarfile otherwise retains a TarInfo per entry


class SafeTarInfo(tarfile.TarInfo):
    def _proc_pax(self, tarfile_obj):
        if self.size > MAX_METADATA: raise ValueError('Oversized PAX metadata')
        return super()._proc_pax(tarfile_obj)

    def _proc_gnulong(self, tarfile_obj):
        if self.size > 8192: raise ValueError('Oversized GNU archive name')
        return super()._proc_gnulong(tarfile_obj)

    def _proc_gnusparse_00(self, *args):
        raise ValueError('Sparse archive members are unsupported')

    _proc_gnusparse_01 = _proc_gnusparse_00
    _proc_gnusparse_10 = _proc_gnusparse_00

    def _proc_sparse(self, tarfile_obj):
        raise ValueError('Sparse archive members are unsupported')


def unpack_verified(archive: Path, work: Path):
    """Streaming strict extractor. Disk-backed inventory bounds memory and detects duplicates."""
    ledger = sqlite3.connect(work / 'ledger.sqlite')
    source = None
    try:
        source = archive.open('rb')
        ledger.execute('CREATE TABLE files(path TEXT PRIMARY KEY, size INTEGER, sha TEXT, seen INTEGER DEFAULT 0)')
        with tarfile.open(fileobj=source, mode='r|gz', tarinfo=SafeTarInfo) as tar:
            first = tar.next()
            if not first or first.name != 'manifest.json' or not first.isfile() or first.size > MAX_METADATA:
                raise ValueError('Missing, oversized or invalid manifest')
            m = validate_manifest(json.load(tar.extractfile(first)))
            space(work, m['totalBytes'] + min(m['fileCount'] * 600, 1024 * CHUNK))
            entry = tar.next()
            if not entry or entry.name != 'metadata/file-inventory.jsonl' or not entry.isfile() or entry.size > max(1, m['fileCount']) * 4600:
                raise ValueError('Missing or oversized inventory')
            space(work, m['totalBytes'] + entry.size * 3)
            inventory = work / 'inventory.jsonl'
            h = hashlib.sha256()
            with inventory.open('xb') as f, tar.extractfile(entry) as src:
                while chunk := src.read(CHUNK): h.update(chunk); f.write(chunk)
            if h.hexdigest() != m['inventorySha256']: raise ValueError('Inventory checksum mismatch')
            total = count = 0
            categories = {k: {'files': 0, 'bytes': 0} for k in ('uploads', 'labels', 'backups', 'history')}
            with inventory.open('rb') as f:
                while line := f.readline(8193):
                    if len(line) > 8192: raise ValueError('Oversized inventory entry')
                    item = json.loads(line)
                    name, size, sha = item.get('path'), item.get('size'), item.get('sha256')
                    if not allowed_payload(name) or type(size) is not int or size < 0 or not isinstance(sha, str) or not re.fullmatch('[a-f0-9]{64}', sha):
                        raise ValueError('Invalid inventory entry')
                    ledger.execute('INSERT INTO files(path,size,sha) VALUES(?,?,?)', (name,size,sha))
                    count += 1; total += size
                    if name != 'database/axildb.dump':
                        category = name.split('/')[1] if name.startswith('storage/') else name.split('/')[0]
                        categories[category]['files'] += 1; categories[category]['bytes'] += size
            if categories != m['storage']: raise ValueError('Inventory does not match storage summary')
            if count != m['fileCount'] or total != m['totalBytes'] or not ledger.execute("SELECT 1 FROM files WHERE path='database/axildb.dump' AND size>0").fetchone():
                raise ValueError('Incomplete inventory or missing database dump')
            ledger.commit()
            while member := tar.next():
                if not member.isfile() or member.sparse is not None or not allowed_payload(member.name):
                    raise ValueError('Unsafe or unexpected archive member')
                row = ledger.execute('SELECT size,sha,seen FROM files WHERE path=?', (member.name,)).fetchone()
                if not row or row[2] or member.size != row[0]: raise ValueError('Duplicate, unexpected or incorrectly sized component')
                dest = work / member.name
                dest.parent.mkdir(parents=True, exist_ok=True)
                h = hashlib.sha256()
                with dest.open('xb') as f, tar.extractfile(member) as src:
                    while chunk := src.read(CHUNK): h.update(chunk); f.write(chunk)
                os.chmod(dest, 0o600)
                os.utime(dest, (member.mtime, member.mtime))
                if h.hexdigest() != row[1]: raise ValueError('Component checksum mismatch: ' + member.name)
                ledger.execute('UPDATE files SET seen=1 WHERE path=?', (member.name,))
                tar.members.clear()
            if ledger.execute('SELECT count(*) FROM files WHERE seen=0').fetchone()[0]:
                raise ValueError('Archive is missing required components')
            # Ensure gzip trailer/CRC is consumed even when tar end markers precede it.
        import gzip
        source.seek(0)
        with gzip.GzipFile(fileobj=source, mode='rb') as f:
            total_read = 0
            while chunk := f.read(CHUNK):
                total_read += len(chunk)
                if total_read > m['totalBytes'] + m['fileCount'] * 8192 + MAX_METADATA * 2:
                    raise ValueError('Archive exceeds decompression limit')
        return m
    finally:
        if source is not None: source.close()
        ledger.close()


def validate_routine_media(file, category):
    """Legacy archives can contain only their documented media root, never backups."""
    prefix = 'public/' + category
    total = 0
    with tarfile.open(file, 'r|gz', tarinfo=SafeTarInfo) as tar:
        while member := tar.next():
            name = member.name.rstrip('/')
            safe_path(name)
            if name != prefix and not name.startswith(prefix + '/'):
                raise ValueError('Routine archive contains paths outside its media root')
            if not (member.isfile() or member.isdir()) or member.sparse is not None:
                raise ValueError('Routine archive contains unsafe links or special files')
            if member.isfile() and name.lower().endswith(('.tar', '.tar.gz', '.tgz', '.dump')):
                raise ValueError('Nested backup/archive in routine media; remove recursive history from migration input')
            total += member.size
            if total > file.stat().st_size * 200 + RESERVE:
                raise ValueError('Routine archive expansion exceeds safety limit')
            tar.members.clear()
