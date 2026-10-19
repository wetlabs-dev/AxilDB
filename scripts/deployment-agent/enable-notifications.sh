#!/bin/sh
# One-time, explicit host bootstrap. Never starts an application deployment.
set -eu
[ "$(id -u)" -eq 0 ] || { echo 'Run as root on the deployment host.' >&2; exit 1; }
SOURCE_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
[ -r "$SOURCE_DIR/core.py" ] && [ -r "$SOURCE_DIR/agent.py" ] || { echo 'Agent sources are missing.' >&2; exit 1; }
python3 -m py_compile "$SOURCE_DIR/core.py" "$SOURCE_DIR/agent.py"
python3 - <<'PY'
import json, sqlite3
from pathlib import Path
c=json.loads(Path('/etc/axildb-deploy/config.json').read_text())
if 'events' not in c['worker_services']:
 raise SystemExit('Review configuration: the existing events service must be a configured worker.')
p=Path(c['state_dir'])/'jobs.sqlite3'
if p.exists():
 with sqlite3.connect(p) as db:
  if db.execute("SELECT 1 FROM jobs WHERE status IN ('RUNNING','QUEUED','RECOVERY_REQUIRED') LIMIT 1").fetchone():
   raise SystemExit('Finish or resolve the active deployment before enabling notifications.')
connection=Path('/etc/axildb/deployment-connection.json')
if str(connection) not in c['compose_files']: raise SystemExit('The reviewed connection overlay must be in compose_files.')
value=json.loads(connection.read_text())
app=value['services'][c['app_service']]
env=app.get('environment',{})
if not all(env.get(k) for k in ('AXILDB_DEPLOY_AGENT_SOCKET','AXILDB_DEPLOY_AGENT_KEY_FILE')):
 raise SystemExit('Application agent connection is not configured.')
worker=value['services'].setdefault('events',{})
worker.setdefault('environment',{}).update({k:env[k] for k in ('AXILDB_DEPLOY_AGENT_SOCKET','AXILDB_DEPLOY_AGENT_KEY_FILE')})
volumes=worker.setdefault('volumes',[])
for volume in app.get('volumes',[]):
 if isinstance(volume,dict) and volume.get('target') in ('/run/axildb-deploy','/run/axildb-deploy-key/agent.key'):
  if not volume.get('read_only'): raise SystemExit('Agent connection mounts must be read-only.')
  existing=next((v for v in volumes if isinstance(v,dict) and v.get('target')==volume['target']),None)
  if existing and existing!=volume: raise SystemExit('Conflicting worker mount; review manually.')
  if not existing: volumes.append(volume)
if not all(any(isinstance(v,dict) and v.get('target')==t for v in volumes) for t in ('/run/axildb-deploy','/run/axildb-deploy-key/agent.key')):
 raise SystemExit('Application connection mounts are incomplete; review manually.')
backup=connection.with_suffix('.json.before-upgrade-notifications')
if not backup.exists(): backup.write_bytes(connection.read_bytes());backup.chmod(0o600)
# Preserve overlay ownership and permissions.
connection.write_text(json.dumps(value,indent=2)+'\n')
print('Reviewed worker connection enabled; original overlay preserved.')
PY
trap 'systemctl start axildb-deploy.service' EXIT
systemctl stop axildb-deploy.service
install -o root -g root -m 0644 "$SOURCE_DIR/core.py" "$SOURCE_DIR/agent.py" /opt/axildb-deploy/
systemctl start axildb-deploy.service
trap - EXIT
sudo -u axildb-deploy python3 /opt/axildb-deploy/agent.py --config /etc/axildb-deploy/config.json --probe
echo 'Agent notification handoff installed. Deploy the application through the web interface; its events worker will receive the connection overlay.'
