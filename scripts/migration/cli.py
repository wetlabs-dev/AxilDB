#!/usr/bin/env python3
"""Host-side migration worker: keeps Docker control out of the web container."""
import argparse
import contextlib
import fcntl
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import tempfile
import time
import uuid
from engine import Database, Engine, atomic_json, digest, ident, literal, now, run, space, sync_directory


def compose(*args):
    return subprocess.check_output(['docker', 'compose', *args], stderr=subprocess.DEVNULL, timeout=120).decode().strip()


def stop_services(job, save, external):
    if external:
        job['previousServices'] = []
        save()
        return
    services = compose('ps', '--services', '--status', 'running').splitlines()
    services = [s for s in services if s not in ('db', 'caddy')]
    job['previousServices'] = sorted(set(job.get('previousServices', [])) | set(services))
    save()  # Persist before stopping: restart/crash recovery needs this list.
    if services: run(['docker', 'compose', 'stop', '-t', '60', *services])


def restart_services(job):
    if job.get('previousServices'):
        run(['docker', 'compose', 'start', *job['previousServices']])


def audit(engine, action, job):
    # Preserve operational audit outside database too, including empty/failed restores.
    try:
        if 'AuditLog' in engine.db.tables():
            summary = f"Migration {action}; job {job['id']}"
            engine.db.sql('INSERT INTO "AuditLog" (id,action,"entityType","entityId",summary,"userEmail") VALUES (' + ','.join(literal(v) for v in [uuid.uuid4().hex, action, 'INSTANCE_MIGRATION', job['id'], summary, job.get('requestedBy', 'server operator')]) + ')')
    except Exception:
        job['auditWarning'] = 'Database audit unavailable; operation recorded in durable job report.'


def restore(engine, archive, job, save):
    db = engine.db
    engine.stage('Inspecting archive and checking compatibility')
    with engine.validated(archive) as (m, staged):
        engine.compatibility(m)
        db.validate_dump(staged / 'database/axildb.dump')
        db.quiet()
        db.disk_space(m['databaseBytes'] * 2)
        for root in (engine.uploads, engine.labels, engine.backups):
            space(root.parent, m['totalBytes'] * 2)
        job['manifest'] = m
        save()
        # Do not modify the destination before complete archive validation.
        safety = engine.control / ('safety-' + job['id'] + '.tar.gz')
        engine.stage('Creating destination safety backup')
        engine.create(safety)
        job['safetyArchive'] = str(safety)
        new_db = 'axildb_stage_' + uuid.uuid4().hex[:16]
        old_db = 'axildb_rollback_' + uuid.uuid4().hex[:16]
        job.update(stagingDatabase=new_db, rollbackDatabase=old_db, database=db.name, databasePhase='creating', fileMoves=[])
        save()
        db.sql(f'CREATE DATABASE {ident(new_db)} TEMPLATE template0', 'postgres')
        engine.stage('Restoring into staging database')
        db.restore(staged / 'database/axildb.dump', new_db)
        db.check_totp(engine.root, new_db)
        job['verification'] = engine.verify_restored(m, staged, new_db)
        save()
        engine.stage('Staging destination files')
        replacements = []
        for category, root in [('uploads', engine.uploads), ('labels', engine.labels)]:
            root.parent.mkdir(parents=True, exist_ok=True)
            temp = Path(tempfile.mkdtemp(prefix='.migration-new-', dir=root.parent))
            job.setdefault('stagedDirectories', []).append(str(temp)); save()
            source = staged / 'storage' / category
            if source.exists(): shutil.copytree(source, temp, dirs_exist_ok=True)
            # Serve media using deployment defaults, never source ownership/modes.
            for p in temp.rglob('*'):
                os.chmod(p, 0o755 if p.is_dir() else 0o644)
            os.chmod(temp, 0o755)
            replacements.append((temp, root))
        old_files = engine.control / ('rollback-' + job['id'])
        old_files.mkdir()
        job['rollbackFiles'] = str(old_files)
        save()
        # Journal each rename BEFORE it happens; recovery infers interrupted steps
        # from source/destination existence and refuses ambiguous states.
        def move(a, b):
            job['fileMoves'].append({'from': str(a), 'to': str(b)})
            save()
            os.rename(a, b)
            sync_directory(a.parent); sync_directory(b.parent)
        engine.stage('Switching database and files')
        db.quiet()
        job['databasePhase'] = 'rename-old'; save()
        db.sql(f'ALTER DATABASE {ident(db.name)} RENAME TO {ident(old_db)}', 'postgres')
        job['databasePhase'] = 'rename-new'; save()
        db.sql(f'ALTER DATABASE {ident(new_db)} RENAME TO {ident(db.name)}', 'postgres')
        job['databasePhase'] = 'switched'; save()
        for temp, root in replacements:
            if root.exists(): move(root, root.with_name('.migration-old-' + job['id'] + '-' + root.name))
            move(temp, root)
        # Keep the control directory and destination journal in place. Routine folders
        # are replaced, never merged, so extra destination backups cannot masquerade as source.
        for p in list(engine.backups.iterdir()):
            if p.name != '.migration': move(p, old_files / p.name)
        incoming = staged / 'backups'
        if incoming.exists():
            for p in incoming.iterdir():
                temp = old_files / ('incoming-' + p.name)
                shutil.copytree(p, temp)
                move(temp, engine.backups / p.name)
        history = staged / 'history'
        if history.exists():
            target = engine.control / 'imported-history'
            target.mkdir(exist_ok=True)
            for p in history.iterdir():
                dest = target / p.name
                if dest.exists() and digest(dest) != digest(p):
                    raise ValueError('Imported history identifier conflict')
                shutil.copy2(p, dest)
        engine.stage('Verifying installed destination')
        verify_installed_files(engine, staged)
        job['verification'] = engine.verify_restored(m, staged)
        job['databasePhase'] = 'verified'; save()
        job['completedAt'] = now()
        job['destinationRequirements'] = m['destinationRequirements']
        return m


def verify_installed_files(engine, work):
    expected = 0
    with (work / 'inventory.jsonl').open() as f:
        for line in f:
            item = json.loads(line); name = item['path']
            if name.startswith('storage/'):
                category, rel = name.split('/', 2)[1:]
                p = (engine.uploads if category == 'uploads' else engine.labels) / rel
            elif name.startswith('backups/'):
                p = engine.backups / name[len('backups/'):]
            else: continue
            expected += 1
            if not p.is_file() or p.is_symlink() or p.stat().st_size != item['size'] or digest(p) != item['sha256']:
                raise ValueError('Installed file verification failed: ' + name)
    actual = sum(1 for _, name in engine.files() if not name.startswith('history/'))
    if actual != expected: raise ValueError('Unexpected installed files')


def recover(engine, job, save):
    # Services must remain stopped throughout recovery.
    engine.db.quiet_names([engine.db.name, job.get('rollbackDatabase'), job.get('stagingDatabase')])
    for move in reversed(job.get('fileMoves', [])):
        if move.get('reversed'): continue
        a, b = Path(move['from']), Path(move['to'])
        if b.exists() and not a.exists():
            os.rename(b, a)
            sync_directory(a.parent); sync_directory(b.parent)
        elif b.exists() and a.exists(): raise ValueError('Ambiguous filesystem recovery; keep services stopped and inspect journal')
        move['reversed'] = True; save()
    if job.get('rollbackDatabase'):
        db = engine.db
        names = db.scalar('SELECT json_agg(datname) FROM pg_database', 'postgres')
        old, stage = job['rollbackDatabase'], job['stagingDatabase']
        if old in names:
            if db.name in names:
                if stage in names: raise ValueError('Ambiguous database recovery; inspect journal')
                db.sql(f'ALTER DATABASE {ident(db.name)} RENAME TO {ident(stage)}', 'postgres')
            db.sql(f'ALTER DATABASE {ident(old)} RENAME TO {ident(db.name)}', 'postgres')
    for raw in job.get('stagedDirectories', []):
        directory = Path(raw)
        if directory.name.startswith('.migration-new-') and directory.parent in (engine.uploads.parent, engine.labels.parent) and directory.exists():
            shutil.rmtree(directory)
    for prefix in ('axildb-migration-', 'safety-'):
        partial = engine.control / (prefix + job['id'] + '.tar.gz.partial')
        partial.unlink(missing_ok=True)
    for root in (engine.control, engine.control / 'jobs'):
        for temp in root.glob('*.json.tmp-*'):
            if temp.is_file(): temp.unlink()
    for pattern in ('create-*', 'inspect-*'):
        for directory in engine.control.glob(pattern):
            if directory.is_dir() and not directory.is_symlink(): shutil.rmtree(directory)
    job['recoveredAt'] = now(); job['status'] = 'RECOVERED'; save()


def main():
    p = argparse.ArgumentParser(description='AxilDB full-instance migration (run from deployment checkout on host)')
    p.add_argument('command', choices=['preflight','create','inspect','verify','restore','verify-restored','worker','recover','release'])
    p.add_argument('file', nargs='?')
    p.add_argument('--database', default=os.environ.get('AXILDB_PGDATABASE', 'axildb'))
    p.add_argument('--user', default=os.environ.get('AXILDB_PGUSER', 'plants'))
    p.add_argument('--container', help='Existing PostgreSQL container instead of Compose db service')
    p.add_argument('--services-stopped', action='store_true', help='Attest external orchestration has stopped ALL writers (required with --container)')
    p.add_argument('--confirm-destructive-restore', action='store_true')
    p.add_argument('--confirm-destination-configuration', action='store_true')
    p.add_argument('--keep-stopped', action='store_true', help='Final source cutover: do not restart source writers')
    p.add_argument('--once', action='store_true')
    args = p.parse_args()
    os.umask(0o077)
    if args.container and not args.services_stopped:
        p.error('--container requires --services-stopped')
    engine = Engine(Path.cwd(), Database(args.database, args.user, args.container), os.environ.get('AXILDB_BACKUP_ROOT'))
    jobs = engine.control / 'jobs'; jobs.mkdir(exist_ok=True)
    # flock releases automatically on process death. Durable RUNNING jobs remain
    # visible, fail closed and require explicit recovery instead of blind retries.
    lock = (engine.control / 'operation.lock').open('a')
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    cmd = args.command
    if cmd == 'preflight':
        report = engine.preflight(); atomic_json(engine.control / 'preflight.json', report)
        print(json.dumps(report, indent=2)); return
    if cmd in ('inspect', 'verify', 'verify-restored'):
        if not args.file: p.error('Archive path is required')
        with engine.validated(Path(args.file)) as (m, work):
            if cmd == 'verify-restored':
                engine.db.quiet(); verify_installed_files(engine, work)
                print(json.dumps(engine.verify_restored(m, work), indent=2))
            else:
                if cmd == 'inspect':
                    engine.compatibility(m)
                    engine.db.validate_dump(work / 'database/axildb.dump')
                print(json.dumps({'integrity': 'verified', 'compatibility': 'checked' if cmd == 'inspect' else 'not checked (use inspect with destination database running)', 'manifest': m}, indent=2))
        return
    if cmd in ('recover','release'):
        if not args.file or not __import__('re').fullmatch('[a-f0-9]{32}', args.file): p.error('Job ID required')
        jobfile = jobs / (args.file + '.json'); job = json.loads(jobfile.read_text())
        connection = job.get('connection', {})
        if connection and connection != {'database': engine.db.name, 'user': engine.db.user, 'container': engine.db.container}:
            raise ValueError('Use the same --database, --user and --container settings recorded for this operation')
        hold = engine.control / 'outbound-hold.json'
        if hold.exists() and json.loads(hold.read_text()).get('jobId') != job['id']:
            raise ValueError('A different restore owns the outbound hold; recover/release that job first')
        def save(): atomic_json(jobfile, job)
        if cmd == 'recover':
            if not args.confirm_destructive_restore: p.error('Recovery requires --confirm-destructive-restore')
            stop_services(job, save, args.services_stopped)
            if job.get('command') == 'restore':
                atomic_json(hold, {'jobId': job['id'], 'createdAt': now()})
            recover(engine, job, save)
        else:
            if not args.confirm_destination_configuration: p.error('Release requires --confirm-destination-configuration after mail/AI/timezone review')
            if job['status'] not in ('SUCCEEDED','RECOVERED','FAILED_RECOVERED'): raise ValueError('Only verified or recovered operations can be released')
            (engine.control / 'outbound-hold.json').unlink(missing_ok=True)
            restart_services(job)
            job['releasedAt'] = now(); save()
        return
    if cmd == 'restore' and not args.file: p.error('Archive path is required')
    if cmd == 'restore' and not args.confirm_destructive_restore:
        p.error('Restore requires --confirm-destructive-restore; inspect/verify the archive first')
    # Never proceed after interrupted restore/cutover without explicit recovery.
    for f in jobs.glob('*.json'):
        record = json.loads(f.read_text())
        if record.get('keepStopped') and record.get('status') == 'SUCCEEDED' and not record.get('releasedAt'):
            raise ValueError('Source cutover is held by ' + record['id'] + '; explicitly release it before another operation')
        if record.get('status') == 'RUNNING':
            raise ValueError('Interrupted operation ' + record['id'] + ': use recover before starting another job')
    if cmd in ('create','restore','worker') and (engine.control / 'outbound-hold.json').exists():
        raise ValueError('Destination outbound hold is active; review and release/recover the recorded restore first')
    if cmd == 'worker':
        fcntl.flock(lock, fcntl.LOCK_UN)
        while True:
            try: fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                if args.once: raise
                time.sleep(10); continue
            if (engine.control / 'outbound-hold.json').exists(): break
            if any(json.loads(f.read_text()).get('status') == 'RUNNING' for f in jobs.glob('*.json')):
                raise ValueError('Interrupted operation found; explicit recovery is required')
            requests = sorted(jobs.glob('*.json'), key=lambda x: x.stat().st_mtime)
            found = next((json.loads(f.read_text()) for f in requests if json.loads(f.read_text()).get('status') == 'REQUESTED'), None)
            if found:
                execute(engine, found, args)
                if found.get('keepStopped'): break
            if args.once: break
            fcntl.flock(lock, fcntl.LOCK_UN)
            time.sleep(10)

    else:
        job = {'id': uuid.uuid4().hex, 'command': cmd, 'requestedAt': now(), 'requestedBy': 'server operator', 'status': 'REQUESTED', 'keepStopped': args.keep_stopped}
        if args.file: job['input'] = str(Path(args.file).resolve())
        execute(engine, job, args)


def execute(engine, job, args):
    if not __import__('re').fullmatch('[a-f0-9]{32}', job.get('id', '')): raise ValueError('Invalid job ID')
    if job.get('command') == 'restore' and (args.command != 'restore' or not args.confirm_destructive_restore):
        raise ValueError('Restore requires the explicit CLI destructive confirmation; it cannot run from the web queue')
    jobfile = engine.control / 'jobs' / (job['id'] + '.json')
    def save(): atomic_json(jobfile, job)
    def stage(s):
        job['stage'] = s; job['updatedAt'] = now(); save()
        print('[MIGRATION] ' + s, flush=True)
    engine.stage = stage
    job.update(status='RUNNING', startedAt=now(), connection={'database': engine.db.name, 'user': engine.db.user, 'container': engine.db.container}); save()
    try:
        command = job['command']
        if command not in ('create','restore','verify','preflight'): raise ValueError('Unsupported queued command')
        if command == 'verify':
            name = job.get('archive', '')
            if not __import__('re').fullmatch(r'axildb-migration-[a-f0-9]{32}\.tar\.gz', name): raise ValueError('Invalid archive ID')
            with engine.validated(engine.control / name) as (m, _): job['manifest'] = m
        elif command == 'preflight':
            atomic_json(engine.control / 'preflight.json', engine.preflight())
        else:
            audit(engine, 'INITIATED', job)
            stage('Stopping application and background writers')
            stop_services(job, save, args.services_stopped)
            if command == 'create':
                target = engine.control / ('axildb-migration-' + job['id'] + '.tar.gz')
                job['manifest'] = engine.create(target)
                job.update(archive=target.name, archiveBytes=target.stat().st_size, archiveSha256=digest(target))
            else:
                atomic_json(engine.control / 'outbound-hold.json', {'jobId': job['id'], 'createdAt': now()})
                job['manifest'] = restore(engine, Path(job['input']), job, save)
        job.update(status='SUCCEEDED', stage='Complete', completedAt=now()); save()
        # Database audit is deliberately after equivalence verification. Subsequent
        # reruns report this expected audit delta rather than claiming exact equality.
        if command != 'restore': audit(engine, 'COMPLETED', job)
        if command == 'create' and not job.get('keepStopped'): restart_services(job)
        print(json.dumps({'jobId': job['id'], 'status': job['status'], 'archive': job.get('archive'), 'report': str(jobfile)}, indent=2))
    except BaseException as error:
        job.update(status='FAILED', stage=job.get('stage'), failedAt=now(), error=str(error))
        if job['command'] == 'restore':
            try:
                recover(engine, job, save)
                job['status'] = 'FAILED_RECOVERED'
            except Exception as recovery_error:
                job['recoveryError'] = str(recovery_error)
        save()
        if job['command'] == 'create' and not job.get('keepStopped'):
            with contextlib.suppress(Exception): restart_services(job)
        raise


if __name__ == '__main__':
    def interrupted(signum, frame): raise KeyboardInterrupt('Migration worker interrupted')
    signal.signal(signal.SIGTERM, interrupted)
    try: main()
    except Exception as error:
        print('[MIGRATION] ' + str(error) + '. Services may be stopped; inspect the durable job report before recovery.', file=sys.stderr)
        sys.exit(1)
