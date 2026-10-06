import hashlib
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest
from engine import FORMAT, VERSION, Engine, REQUIREMENTS, allowed_payload, digest, safe_path, unpack_verified, validate_manifest


class ArchiveTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.root = Path(self.tmp.name)
    def tearDown(self): self.tmp.cleanup()
    def archive(self, change=None, members=None, inventory=None):
        data = b'PGDMP-test'
        item = {'path': 'database/axildb.dump', 'size': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
        items = inventory or [item]
        raw = ''.join(json.dumps(i)+'\n' for i in items).encode()
        m = {'format': FORMAT, 'formatVersion': VERSION, 'createdAt': '2026-10-05T19:00:00+00:00', 'appVersion': '0.2.0', 'schemaSha256': 'a'*64, 'inventorySha256': hashlib.sha256(raw).hexdigest(), 'totalBytes': sum(i['size'] for i in items), 'fileCount': len(items), 'databaseBytes': 100, 'database': {'engine':'postgresql','format':'pg_dump_custom','version':160000},'tables':{},'migrations':[], 'sequences':{}, 'destinationRequirements':{}, 'storage':{k:{'files':0,'bytes':0} for k in ('uploads','labels','backups','history')}}
        if change: change(m)
        file=self.root/'test.tar.gz'
        with tarfile.open(file,'w:gz') as t:
            for name, contents in [('manifest.json',json.dumps(m).encode()),('metadata/file-inventory.jsonl',raw),*(members if members is not None else [('database/axildb.dump',data)])]:
                if isinstance(contents, tarfile.TarInfo): t.addfile(contents); continue
                ti=tarfile.TarInfo(name); ti.size=len(contents); t.addfile(ti,io.BytesIO(contents))
        return file
    def extract(self, file):
        work=Path(tempfile.mkdtemp(dir=self.root)); self.stage=work
        return unpack_verified(file,work)
    def test_round_trip(self):
        m=self.extract(self.archive()); self.assertEqual(m['fileCount'],1)
        self.assertEqual((self.stage/'database/axildb.dump').read_bytes(),b'PGDMP-test')
    def test_future_version(self):
        with self.assertRaises(ValueError): self.extract(self.archive(lambda m:m.update(formatVersion=2)))
    def test_missing_dump(self):
        with self.assertRaises(ValueError): self.extract(self.archive(members=[]))
    def test_corrupt_component(self):
        with self.assertRaises(ValueError): self.extract(self.archive(members=[('database/axildb.dump',b'corrupted')]))
    def test_inventory_checksum(self):
        with self.assertRaises(ValueError): self.extract(self.archive(lambda m:m.update(inventorySha256='0'*64)))
    def test_duplicate_member(self):
        with self.assertRaises(ValueError): self.extract(self.archive(members=[('database/axildb.dump',b'PGDMP-test')]*2))
    def test_traversal(self):
        for name in ['../x','/tmp/x','storage/uploads/../../x','storage\\uploads\\x','storage/uploads/./x','storage//uploads/x','C:/x','storage/uploads/x\n']:
            with self.subTest(name=name), self.assertRaises(ValueError): safe_path(name)
    def test_symlink(self):
        ti=tarfile.TarInfo('storage/uploads/escape'); ti.type=tarfile.SYMTYPE; ti.linkname='/tmp'
        with self.assertRaises(ValueError): self.extract(self.archive(members=[('ignored',ti)]))
    def test_hardlink(self):
        ti=tarfile.TarInfo('database/axildb.dump'); ti.type=tarfile.LNKTYPE; ti.linkname='/etc/passwd'
        with self.assertRaises(ValueError): self.extract(self.archive(members=[('ignored',ti)]))
    def test_oversize(self):
        with self.assertRaises(ValueError): self.extract(self.archive(lambda m:m.update(totalBytes=10**18)))
    def test_truncated(self):
        p=self.archive(); p.write_bytes(p.read_bytes()[:80])
        with self.assertRaises((EOFError,tarfile.TarError)): self.extract(p)
    def test_invalid_manifest_types(self):
        for key,value in [('totalBytes',True),('fileCount',-1),('tables',None),('database',None),('storage',{}),('sequences',None),('destinationRequirements',None),('createdAt','2026-10-05')]:
            with self.subTest(key=key),self.assertRaises(ValueError): self.extract(self.archive(lambda m:m.update({key:value})))
    def test_recursion_exclusion(self):
        for p in ['backups/axildb-test/migration.tar.gz','backups/.migration/axildb.dump','backups/axildb-test/nested/axildb.dump','storage/other/file','history/../../bad']:
            try: self.assertFalse(allowed_payload(p))
            except ValueError: pass
        self.assertTrue(allowed_payload('backups/axildb-test/uploads.tar.gz'))
    def test_no_secret_values(self):
        self.assertIn('TOTP_ENCRYPTION_KEY',REQUIREMENTS)
        self.assertNotIn('postgresql://',json.dumps(REQUIREMENTS))
    def test_symlink_storage(self):
        (self.root/'public').mkdir(); (self.root/'public/uploads').symlink_to('/tmp')
        with self.assertRaises(ValueError): Engine(self.root,None)
    def test_digest_streaming(self):
        p=self.root/'large'; p.write_bytes(b'abc'*1024*1024)
        self.assertEqual(digest(p),hashlib.sha256(p.read_bytes()).hexdigest())
    def test_unrecognized_backup_rejected(self):
        e=Engine(self.root,None); (e.backups/'migration.tar.gz').write_text('not routine')
        with self.assertRaises(ValueError): list(e.files())
    def test_job_history_excludes_active(self):
        e=Engine(self.root,None); jobs=e.control/'jobs'; jobs.mkdir()
        (jobs/'a.json').write_text(json.dumps({'status':'RUNNING'}))
        (jobs/'b.json').write_text(json.dumps({'status':'SUCCEEDED'}))
        self.assertEqual([n for _,n in e.files()],['history/b.json'])

if __name__=='__main__': unittest.main()

class RestoreSafetyTests(unittest.TestCase):
    def test_restore_rejects_corruption_before_database_access(self):
        from cli import restore
        from unittest.mock import Mock
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp); db=Mock(); e=Engine(root,db)
            archive=root/'bad.tar.gz'; archive.write_bytes(b'bad archive')
            with self.assertRaises(tarfile.TarError): restore(e,archive,{'id':'test'},lambda:None)
            db.quiet.assert_not_called(); db.dump.assert_not_called(); db.restore.assert_not_called()
    def test_compatibility_rejects_schema_before_database_access(self):
        from unittest.mock import Mock
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);(root/'prisma').mkdir();(root/'prisma/schema.prisma').write_text('schema')
            db=Mock();e=Engine(root,db)
            with self.assertRaisesRegex(ValueError,'Schema differs'):e.compatibility({'schemaSha256':'a'*64})
            db.restore.assert_not_called()
    def test_recovery_reverses_partial_file_switch(self):
        from cli import recover
        from unittest.mock import Mock
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);e=Engine(root,Mock())
            e.uploads.mkdir(parents=True);(e.uploads/'old').write_text('old')
            old=e.uploads.with_name('.migration-old-test-uploads')
            e.uploads.rename(old)
            new=e.uploads.with_name('.migration-new-test');new.mkdir();(new/'new').write_text('new')
            job={'id':'test','fileMoves':[{'from':str(e.uploads),'to':str(old)},{'from':str(new),'to':str(e.uploads)}], 'stagedDirectories':[str(new)]}
            # Second move is journaled, but process died before the rename.
            recover(e,job,lambda:None)
            self.assertEqual((e.uploads/'old').read_text(),'old');self.assertFalse(new.exists())
    def test_nested_routine_archive_rejected(self):
        from engine import validate_routine_media
        with tempfile.TemporaryDirectory() as temp:
            p=Path(temp)/'uploads.tar.gz'
            with tarfile.open(p,'w:gz') as t:
                ti=tarfile.TarInfo('public/uploads/axildb-migration.tar.gz');ti.size=3;t.addfile(ti,io.BytesIO(b'bad'))
            with self.assertRaises(ValueError):validate_routine_media(p,'uploads')
    def test_cli_requires_confirmation(self):
        import subprocess
        # Confirmation is checked after initializing the control root, but before
        # contacting PostgreSQL or stopping any service.
        with tempfile.TemporaryDirectory() as temp:
            env=dict(__import__('os').environ,AXILDB_BACKUP_ROOT=temp)
            result=subprocess.run(['python3',str(Path(__file__).parent/'cli.py'),'restore','/missing'],env=env,capture_output=True,text=True)
            self.assertNotEqual(result.returncode,0);self.assertIn('--confirm-destructive-restore',result.stderr)

class RoutineCompatibilityTests(unittest.TestCase):
    def test_legacy_format_and_streamed_media(self):
        import os
        import sys
        from unittest.mock import patch
        import routine
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);(root/'public/uploads').mkdir(parents=True);(root/'public/uploads/photo.jpg').write_bytes(b'photo')
            old=Path.cwd()
            try:
                os.chdir(root)
                with patch.object(sys,'argv',['routine.py','backups']),patch.dict(os.environ,{'AXILDB_BACKUP_DIR':'backups/axildb-test'},clear=True),patch.object(routine.Database,'dump',lambda self,target:target.write_bytes(b'PGDMP')):
                    routine.main()
                folder=root/'backups/axildb-test'
                self.assertEqual({p.name for p in folder.iterdir()},{'axildb.dump','uploads.tar.gz','labels.tar.gz','manifest.txt'})
                with tarfile.open(folder/'uploads.tar.gz') as tar:
                    self.assertEqual(tar.extractfile('public/uploads/photo.jpg').read(),b'photo')
                self.assertIn('database_format=pg_dump_custom',(folder/'manifest.txt').read_text())
            finally:os.chdir(old)
    def test_routine_never_overwrites_existing_backup(self):
        import os,sys
        from unittest.mock import patch
        import routine
        with tempfile.TemporaryDirectory() as temp:
            target=Path(temp)/'existing';target.mkdir();(target/'keep').write_text('important')
            with patch.object(sys,'argv',['routine.py',temp]),patch.dict(os.environ,{'AXILDB_BACKUP_DIR':str(target)}):
                with self.assertRaises(FileExistsError):routine.main()
            self.assertEqual((target/'keep').read_text(),'important')
    def test_routine_failure_cleans_only_new_folder(self):
        import os,sys
        from unittest.mock import patch
        import routine
        with tempfile.TemporaryDirectory() as temp:
            target=Path(temp)/'new'
            with patch.object(sys,'argv',['routine.py',temp]),patch.dict(os.environ,{'AXILDB_BACKUP_DIR':str(target)},clear=True),patch.object(routine.Database,'dump',side_effect=RuntimeError('failure')):
                with self.assertRaises(RuntimeError):routine.main()
            self.assertFalse(target.exists())

class SchemaCompatibilityTests(unittest.TestCase):
    def engine(self, root, version):
        from unittest.mock import Mock
        (root/'prisma').mkdir();(root/'prisma/schema.prisma').write_text('fixture schema')
        (root/'package.json').write_text('{"version":"0.2.0"}')
        db=Mock();db.version.return_value=version
        return Engine(root,db)
    def test_older_postgres_rejected(self):
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);e=self.engine(root,160000)
            m={'schemaSha256':digest(root/'prisma/schema.prisma'),'appVersion':'0.2.0','database':{'version':170000},'migrations':[]}
            with patch('engine.revision',return_value=None),self.assertRaisesRegex(ValueError,'older than source'):e.compatibility(m)
    def test_rolled_back_migration_history_is_preserved_not_applied(self):
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);e=self.engine(root,170000)
            m={'schemaSha256':digest(root/'prisma/schema.prisma'),'appVersion':'0.2.0','database':{'version':160000},'migrations':[{'migration_name':'old_failed_attempt','checksum':'a'*64,'applied':False,'rolledBack':True}]}
            with patch('engine.revision',return_value=None):e.compatibility(m)
    def test_unresolved_migration_refused(self):
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);e=self.engine(root,170000)
            m={'schemaSha256':digest(root/'prisma/schema.prisma'),'appVersion':'0.2.0','database':{'version':160000},'migrations':[{'migration_name':'unfinished','checksum':'a'*64,'applied':False,'rolledBack':False}]}
            with patch('engine.revision',return_value=None),self.assertRaisesRegex(ValueError,'incomplete migration'):e.compatibility(m)
