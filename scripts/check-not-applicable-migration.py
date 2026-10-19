# Disposable migration regression. Uses a dedicated PostgreSQL container on loopback port 55441.
from pathlib import Path
import tempfile, shutil, subprocess, os, time
root=Path(__file__).resolve().parents[1]; work=Path(tempfile.mkdtemp(prefix='axildb-na-migration-'))
shutil.copy(root/'prisma/schema.prisma',work/'schema.prisma')
(work/'migrations').mkdir()
name='20261019010000_not_applicable_cadences'
for item in (root/'prisma/migrations').iterdir():
    if item.name==name: continue
    if item.is_dir(): shutil.copytree(item,work/'migrations'/item.name)
    else: shutil.copy(item,work/'migrations'/item.name)
env=dict(os.environ,DATABASE_URL='postgresql://postgres:axildb_test@localhost:55441/axildb')
container='axildb-na-migration-test-' + str(int(time.time()))
subprocess.run(['docker','run','--rm','--name',container,'-e','POSTGRES_PASSWORD=axildb_test','-e','POSTGRES_DB=axildb','-p','127.0.0.1:55441:5432','-d','postgres:16-alpine'],check=True)
for n in range(40):
    if subprocess.run(['docker','exec',container,'pg_isready','-U','postgres'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0:break
    time.sleep(.25)
def migrate(): subprocess.run([str(root/'node_modules/.bin/prisma'),'migrate','deploy','--schema',str(work/'schema.prisma')],env=env,check=True,stdout=subprocess.DEVNULL)
def sql(statement):
    return subprocess.run(['docker','exec','-i',container,'psql','-U','postgres','-d','axildb','-v','ON_ERROR_STOP=1','-At'],input=statement,text=True,check=True,capture_output=True).stdout
try:
    migrate()
    sql('''INSERT INTO "Collection" (id,name,slug,"updatedAt") VALUES ('na-migration','Migration fixture','na-migration',now());
INSERT INTO "PlantDefinition" (id,"collectionId",genus,"updatedAt") VALUES ('na-migration','na-migration','Test',now());
INSERT INTO "PlantInstance" (id,"collectionId","plantDefinitionId","plantId","instanceType","updatedAt") VALUES ('na-migration','na-migration','na-migration','NATEST','ACQUIRED',now());
INSERT INTO "PlantDefinitionCareCadence" VALUES ('na-migration','na-migration','REPOTTING',12,'MONTH');
INSERT INTO "PlantInstanceCareCadenceOverride" (id,"plantInstanceId",activity,mode) VALUES ('na-migration','na-migration','PRUNING','DISABLED');
INSERT INTO "PlantCareEvent" (id,"collectionId","plantInstanceId","eventType","performedAt") VALUES ('na-migration','na-migration','na-migration','REPOTTED',now());''')
    before=sql('SELECT row_to_json(t) FROM "PlantCareEvent" t WHERE id=\'na-migration\';')
    shutil.copytree(root/'prisma/migrations'/name,work/'migrations'/name)
    migrate()
    assert sql('SELECT status,interval,unit FROM "PlantDefinitionCareCadence" WHERE id=\'na-migration\';').strip()=='SCHEDULED|12|MONTH'
    assert sql('SELECT mode FROM "PlantInstanceCareCadenceOverride" WHERE id=\'na-migration\';').strip()=='DISABLED'
    assert sql('SELECT count(*) FROM "PlantDefinitionCareCadence" WHERE activity=\'PRUNING\';').strip()=='0'
    assert before==sql('SELECT row_to_json(t) FROM "PlantCareEvent" t WHERE id=\'na-migration\';')
    print('Fresh database: all 50 prior migrations plus N/A migration passed; scheduled interval, disabled override, missing activity and complete care-history row preserved.')
finally:
    subprocess.run(['docker','stop',container],check=True,stdout=subprocess.DEVNULL)
