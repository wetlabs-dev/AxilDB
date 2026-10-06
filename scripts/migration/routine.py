"""Legacy routine format, using the same database/streaming archive primitives."""
import datetime as dt
import os
from pathlib import Path
import shutil
import sys
import tarfile
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from engine import Database, add_file, revision, walk


class LocalDatabase(Database):
    def __init__(self, url):
        parsed = urlsplit(url)
        query = urlencode([(k,v) for k,v in parse_qsl(parsed.query) if k != 'schema'])
        # libpq connection string is inherited through environment, never argv/logs.
        os.environ['PGDATABASE'] = urlunsplit(parsed._replace(query=query))
    def command(self, program, args=(), database=None):
        return [program, *args]


def main():
    os.umask(0o077)
    stamp=dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    root=Path(sys.argv[1] if len(sys.argv)>1 else os.environ.get('AXILDB_BACKUP_ROOT','backups'))
    target=Path(os.environ.get('AXILDB_BACKUP_DIR',str(root/('axildb-'+stamp))))
    target.mkdir(parents=True,exist_ok=False)
    try:
        db=LocalDatabase(os.environ['DATABASE_URL']) if os.environ.get('DATABASE_URL') and shutil.which('pg_dump') else Database()
        db.dump(target/'axildb.dump')
        for category in ('uploads','labels'):
            directory=Path('public')/category;directory.mkdir(parents=True,exist_ok=True)
            with tarfile.open(target/(category+'.tar.gz'),'w:gz',format=tarfile.PAX_FORMAT) as tar:
                for file in walk(directory): add_file(tar,file,file.as_posix())
        commit=revision(Path.cwd()) or 'unknown'
        (target/'manifest.txt').write_text(f'created_at={stamp}\ngit_commit={commit}\ndatabase=axildb\ndatabase_format=pg_dump_custom\n')
        print('Routine backup complete: '+str(target))
    except BaseException:
        # The folder was exclusively created by this invocation; no existing archive
        # is ever overwritten or deleted. Missing manifest never looks complete.
        shutil.rmtree(target)
        raise

if __name__=='__main__':
    try: main()
    except Exception as error:
        print('Routine backup failed: '+str(error),file=sys.stderr);sys.exit(1)
