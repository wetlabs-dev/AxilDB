"""Exercise real CLI orchestration without touching application containers.
Usage: python3 scripts/migration/cli_integration.py axildb-migration-test-CONTAINER
"""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import uuid
from engine import Database, ident


def main():
    container=sys.argv[1]
    if not container.startswith('axildb-migration-test-'):raise ValueError('Disposable test container required')
    db=Database('postgres','plants',container);suffix=uuid.uuid4().hex[:8]
    source_db='cli_source_'+suffix;target_db='cli_target_'+suffix
    db.sql('CREATE DATABASE '+ident(source_db));db.sql('CREATE DATABASE '+ident(target_db))
    db.sql('CREATE TABLE persistent(id text PRIMARY KEY,value text); INSERT INTO persistent VALUES (\'stable-id\',\'value\\nwith unicode 🌿\')',source_db)
    cli=Path(__file__).resolve().parent/'cli.py'
    with tempfile.TemporaryDirectory() as temp:
        source=Path(temp)/'source';target=Path(temp)/'target'
        for root in (source,target):
            (root/'prisma').mkdir(parents=True);(root/'prisma/schema.prisma').write_text('test schema\n');(root/'package.json').write_text('{"version":"0.2.0"}')
        def invoke(root,database,*args,success=True):
            env=dict(os.environ);env.pop('AXILDB_BACKUP_ROOT',None)
            result=subprocess.run(['python3',str(cli),*args,'--container',container,'--database',database,'--services-stopped'],cwd=root,env=env,text=True,capture_output=True)
            if success and result.returncode:raise AssertionError(result.stderr+'\n'+result.stdout)
            if not success:assert result.returncode!=0
            return result
        invoke(source,source_db,'create')
        control=source/'backups/.migration'
        job=json.loads(next((control/'jobs').glob('*.json')).read_text());archive=control/job['archive']
        assert job['status']=='SUCCEEDED';invoke(target,target_db,'inspect',str(archive))
        invoke(target,target_db,'restore',str(archive),success=False)
        invoke(target,target_db,'restore',str(archive),'--confirm-destructive-restore')
        target_control=target/'backups/.migration'
        restored=json.loads(next((target_control/'jobs').glob('*.json')).read_text())
        assert restored['status']=='SUCCEEDED';assert (target_control/'outbound-hold.json').exists()
        invoke(target,target_db,'verify-restored',str(archive))
        invoke(target,target_db,'release',restored['id'],success=False)
        invoke(target,target_db,'release',restored['id'],'--confirm-destination-configuration')
        assert not (target_control/'outbound-hold.json').exists()
        invoke(target,target_db,'recover',restored['id'],'--confirm-destructive-restore')
        assert Database(target_db,'plants',container).tables()==[]
        invoke(target,target_db,'recover',restored['id'],'--confirm-destructive-restore')
        print('CLI integration passed: create, inspect, confirmation gates, empty-database restore, verify, held release, repeated recovery.')

if __name__=='__main__':main()
