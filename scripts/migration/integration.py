"""Opt-in integration: isolated existing test container only, never application DB.
Usage: python3 scripts/migration/integration.py CONTAINER /tmp/generated-schema.sql
Generate SQL with prisma migrate diff --from-empty --to-schema-datamodel ... --script.
"""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import uuid
from engine import Database, Engine, atomic_json, ident, literal, run
from cli import restore, recover, verify_installed_files


def seed_all(db):
    """Populate every table, including future models, with FK-valid sentinel records.
    Domain-specific photos/auth/events below supplement the structural fixture.
    """
    tables = db.tables()
    columns = db.scalar("""SELECT json_agg(t) FROM (SELECT table_name,column_name,data_type,udt_name,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' ORDER BY ordinal_position) t""")
    fks = db.scalar("""SELECT coalesce(json_agg(t),'[]'::json) FROM (SELECT tc.table_name,kcu.column_name,ccu.table_name AS target_table,ccu.column_name AS target_column FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name=kcu.constraint_name AND tc.constraint_schema=kcu.constraint_schema JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name=tc.constraint_name AND ccu.constraint_schema=tc.constraint_schema WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_schema='public') t""")
    visiting=set(); done=set()
    skip=set()
    def insert(table):
        if table in done: return
        if table in visiting: raise RuntimeError('Required FK cycle: '+table)
        visiting.add(table)
        if table == 'Photo':
            insert('PlantDefinition')
            db.sql('''INSERT INTO "Photo" (id,"entityType","entityId",filename,path) VALUES ('Photo-id','PLANT_DEFINITION','PlantDefinition-id','test.jpg','/uploads/test.jpg')''')
            visiting.remove(table); done.add(table); return
        values={}
        for c in [c for c in columns if c['table_name']==table]:
            col=c['column_name']
            fk=next((f for f in fks if f['table_name']==table and f['column_name']==col),None)
            if c['is_nullable']=='YES': continue
            if fk:
                insert(fk['target_table'])
                values[col]=f'(SELECT {ident(fk["target_column"])} FROM {ident(fk["target_table"])} LIMIT 1)'
            elif c['column_default'] is not None: continue
            elif c['data_type']=='USER-DEFINED':
                v=db.sql(f"SELECT enumlabel FROM pg_enum JOIN pg_type ON enumtypid=pg_type.oid WHERE typname={literal(c['udt_name'])} ORDER BY enumsortorder LIMIT 1")
                values[col]=literal(v)
            elif c['data_type'] in ('text','character varying'):
                values[col]=literal(table+'-'+col)
            elif c['data_type'].startswith('timestamp'): values[col]="'2026-01-02T03:04:05Z'"
            elif c['data_type'] in ('json','jsonb'): values[col]="'{}'"
            elif c['data_type']=='boolean': values[col]='false'
            elif c['data_type']=='ARRAY': values[col]="'{}'"
            else: values[col]='1'
        if table == 'UserTwoFactor':
            os.environ['TOTP_ENCRYPTION_KEY']='migration-integration-only-key'
            ciphertext=subprocess.check_output(['node','-e', '''const c=require('crypto');const iv=c.randomBytes(12);const x=c.createCipheriv('aes-256-gcm',c.createHash('sha256').update(process.env.TOTP_ENCRYPTION_KEY).digest(),iv);const b=Buffer.concat([x.update('JBSWY3DPEHPK3PXP'),x.final()]);process.stdout.write([iv,x.getAuthTag(),b].map(x=>x.toString('base64url')).join('.'))''']).decode()
            values['secretCiphertext']=literal(ciphertext)
        # Fill two unconstrained polymorphic values with real references.
        if table=='DomainEvent': values.update(eventType="'plant.created'",idempotencyKey="'integration-event-once'",processingStatus="'PROCESSED'")
        db.sql(f'INSERT INTO {ident(table)} ({",".join(ident(c) for c in values)}) VALUES ({",".join(values.values())})')
        visiting.remove(table); done.add(table)
    for table in tables:
        if table not in skip: insert(table)


    # Use real credential formats as well as FK-valid structural sentinels.
    salt='integration-salt'
    import hashlib
    password_hash=salt+':'+hashlib.scrypt(b'migration-test-password',salt=salt.encode(),n=16384,r=8,p=1,dklen=64).hex()
    db.sql('UPDATE "User" SET email=\'admin.integration@example.invalid\',role=\'SERVER_ADMIN\',"passwordHash"='+literal(password_hash))
    db.sql('UPDATE "UserTwoFactor" SET "enabledAt"=now()')
    db.sql('UPDATE "Session" SET "tokenHash"='+literal(hashlib.sha256(b'migration-test-session').hexdigest())+',"expiresAt"=now()+interval \'1 day\',"twoFactorVerifiedAt"=now()')
    return len(tables)


def main():
    p=argparse.ArgumentParser();p.add_argument('container');p.add_argument('schema');a=p.parse_args()
    if not a.container.startswith('axildb-migration-test-'): raise ValueError('Use a dedicated axildb-migration-test-* container')
    suffix=uuid.uuid4().hex[:8]
    admin=Database('postgres','plants',a.container)
    admin.sql('CREATE DATABASE '+ident('source_'+suffix))
    db=Database('source_'+suffix,'plants',a.container)
    with open(a.schema,'rb') as f: run(db.command('psql',['-X','-v','ON_ERROR_STOP=1']),stdin=f)
    count=seed_all(db)
    db.sql('CREATE TABLE "_prisma_migrations" (id varchar(36) PRIMARY KEY,checksum varchar(64) NOT NULL,finished_at timestamptz,migration_name varchar(255) NOT NULL,logs text,rolled_back_at timestamptz,started_at timestamptz NOT NULL DEFAULT now(),applied_steps_count integer NOT NULL DEFAULT 0)')
    from engine import digest
    for migration in (Path.cwd()/'prisma/migrations').glob('*/migration.sql'):
        db.sql('INSERT INTO "_prisma_migrations" (id,checksum,finished_at,migration_name,applied_steps_count) VALUES ('+','.join([literal(str(uuid.uuid4())),literal(digest(migration)),'now()',literal(migration.parent.name),'1'])+')')
    repo=Path.cwd()
    with tempfile.TemporaryDirectory(prefix='migration-integration-') as temp:
        roots=[]
        for label in ('source','destination'):
            root=Path(temp)/label;root.mkdir();shutil.copytree(repo/'prisma',root/'prisma');shutil.copy(repo/'package.json',root/'package.json')
            (root/'public/uploads').mkdir(parents=True);(root/'public/labels').mkdir()
            (root/'scripts/migration').mkdir(parents=True);shutil.copy(repo/'scripts/migration/verify-totp.cjs',root/'scripts/migration/verify-totp.cjs')
            roots.append(root)
        (roots[0]/'public/uploads/test.jpg').write_bytes(b'photo bytes\x00\xff')
        (roots[0]/'public/labels/label.pdf').write_bytes(b'%PDF-test')
        source=Engine(roots[0],db,stage=lambda s:print('[SOURCE]',s,flush=True))
        routine=source.backups/'axildb-retained';routine.mkdir()
        db.dump(routine/'axildb.dump')
        import tarfile
        for category in ('uploads','labels'):
            with tarfile.open(routine/(category+'.tar.gz'),'w:gz') as tar: tar.add(roots[0]/'public'/category,arcname='public/'+category)
        (routine/'manifest.txt').write_text('database_format=pg_dump_custom\n')
        bundle=source.control/'test.tar.gz';manifest=source.create(bundle)
        destination_container=os.environ.get('AXILDB_TEST_DEST_CONTAINER',a.container)
        if not destination_container.startswith('axildb-migration-test-'):raise ValueError('Unsafe destination test container')
        destination_db=Database('destination_'+suffix,'plants',destination_container)
        destination_db.sql('CREATE DATABASE '+ident('destination_'+suffix)+' TEMPLATE template0','postgres')
        target=Engine(roots[1],destination_db,stage=lambda s:print('[RESTORE]',s,flush=True))
        # Existing destination data/files exercise safety backup and rollback.
        target.db.sql('CREATE TABLE "OldDestination" (id integer PRIMARY KEY); INSERT INTO "OldDestination" VALUES (7)')
        (roots[1]/'public/uploads/old.txt').write_text('preserve for rollback')
        job={'id':uuid.uuid4().hex,'status':'RUNNING','command':'restore'}
        save=lambda:atomic_json(target.control/'job.json',job)
        restore(target,bundle,job,save)
        assert target.db.snapshot()==manifest['tables']
        assert target.db.sequences()==manifest['sequences']
        credential=target.db.sql('SELECT \"passwordHash\" FROM \"User\" LIMIT 1')
        salt, expected=credential.split(':')
        import hashlib
        assert hashlib.scrypt(b'migration-test-password',salt=salt.encode(),n=16384,r=8,p=1,dklen=64).hex()==expected
        assert not (roots[1]/'public/uploads/old.txt').exists()
        assert (roots[1]/'public/uploads/test.jpg').read_bytes()==b'photo bytes\x00\xff'
        assert (target.backups/'axildb-retained/axildb.dump').exists()
        with target.validated(bundle) as (m,w): verify_installed_files(target,w);target.verify_restored(m,w)
        recover(target,job,save)
        assert target.db.sql('SELECT id FROM "OldDestination"')=='7'
        assert (roots[1]/'public/uploads/old.txt').read_text()=='preserve for rollback'
        assert not (roots[1]/'public/uploads/test.jpg').exists()
        recover(target,job,save)  # Recovery itself must be idempotent.
        assert (roots[1]/'public/uploads/old.txt').read_text()=='preserve for rollback'
        print(json.dumps({'result':'passed','restoredTestDatabase':job['stagingDatabase'],'sourceVersion':db.version(),'destinationVersion':target.db.version(),'schemaTables':count,'populatedTables':sum(v['count']>0 for v in manifest['tables'].values()),'checks':['all-table fingerprints','IDs and field values','validated foreign keys','photo relationships','file hashes','retained routine archives','destination safety archive','rollback database and files']},indent=2))

if __name__=='__main__':main()
