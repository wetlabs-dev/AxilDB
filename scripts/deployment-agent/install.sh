#!/bin/sh
set -eu
if [ "$(id -u)" -ne 0 ]; then echo 'Run as root on the Ubuntu deployment host.' >&2; exit 1; fi
if [ "$#" -ne 1 ]; then echo 'Usage: install.sh /absolute/path/to/reviewed/config.json' >&2; exit 1; fi
for program in python3 git docker curl systemctl useradd install; do command -v "$program" >/dev/null; done
docker compose version >/dev/null
if systemctl is-active --quiet axildb-deploy.service; then echo 'Stop the agent only after confirming no deployment is active; then rerun installation.' >&2; exit 1; fi
SOURCE_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
python3 "$SOURCE_DIR/agent.py" --config "$1" --validate
getent group axildb-deploy >/dev/null || groupadd --system axildb-deploy
id axildb-deploy >/dev/null 2>&1 || useradd --system --gid axildb-deploy --home-dir /var/lib/axildb-deploy --shell /usr/sbin/nologin axildb-deploy
usermod -a -G docker axildb-deploy
install -d -m 0755 /opt/axildb-deploy
install -d -m 0750 -o root -g axildb-deploy /etc/axildb-deploy
install -m 0644 "$SOURCE_DIR/core.py" "$SOURCE_DIR/agent.py" /opt/axildb-deploy/
# Deliberately does not overwrite an existing operator configuration or authentication key.
if [ -f /etc/axildb-deploy/config.json ]; then
  cmp -s "$1" /etc/axildb-deploy/config.json || { echo 'Existing configuration differs. Review and replace it manually first.' >&2; exit 1; }
else install -m 0640 -o root -g axildb-deploy "$1" /etc/axildb-deploy/config.json; fi
python3 - <<'PY'
import json,os,secrets,grp
from pathlib import Path
c=json.loads(Path('/etc/axildb-deploy/config.json').read_text())
if c['socket']!='/run/axildb-deploy/agent.sock' or c['state_dir']!='/var/lib/axildb-deploy' or c['secret_file']!='/etc/axildb-deploy/agent.key':
 raise SystemExit('Installer requires the documented runtime/state/key paths; customize the unit manually for other paths.')
key=Path(c['secret_file'])
if not key.exists():
 fd=os.open(key,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o640)
 with os.fdopen(fd,'w') as f: f.write(secrets.token_hex(32)+'\n')
os.chown(key,0,grp.getgrnam('axildb-deploy').gr_gid);os.chmod(key,0o640)
paths=[c['repository'],c['backup_dir'],c['state_dir'],'/run/axildb-deploy']
# systemd path syntax is deliberately constrained by bootstrap; do not interpolate arbitrary unit directives.
if any(any(x in p for x in ('\n','\r','%','"','\\',' ')) for p in paths): raise SystemExit('Use host paths without whitespace or systemd escape characters.')
drop=Path('/etc/systemd/system/axildb-deploy.service.d');drop.mkdir(exist_ok=True)
(drop/'paths.conf').write_text('[Service]\nReadWritePaths='+' '.join(paths)+'\n')
# Connection overlay is installed separately from source; it cannot grant a Docker socket.
connection=Path('/etc/axildb/deployment-connection.json')
connection.parent.mkdir(exist_ok=True)
value={'services':{c['app_service']:{'environment':{'AXILDB_DEPLOY_AGENT_SOCKET':'/run/axildb-deploy/agent.sock','AXILDB_DEPLOY_AGENT_KEY_FILE':'/run/axildb-deploy-key/agent.key'},'volumes':[{'type':'bind','source':'/run/axildb-deploy','target':'/run/axildb-deploy','read_only':True},{'type':'bind','source':str(key),'target':'/run/axildb-deploy-key/agent.key','read_only':True}]}}}
# Only the existing event worker receives the same narrow authenticated interface.
value['services']['events']=value['services'][c['app_service']]
if connection.exists():
 if json.loads(connection.read_text())!=value: raise SystemExit('Existing connection overlay differs; review it manually.')
else:
 connection.write_text(json.dumps(value,indent=2));connection.chmod(0o640);os.chown(connection,0,grp.getgrnam('axildb-deploy').gr_gid)
if str(connection) not in c['compose_files']: raise SystemExit('Add /etc/axildb/deployment-connection.json to the reviewed compose_files configuration, then rerun.')
PY
install -m 0644 "$SOURCE_DIR/axildb-deploy.service" /etc/systemd/system/axildb-deploy.service
systemd-analyze verify /etc/systemd/system/axildb-deploy.service
systemctl daemon-reload
systemctl enable --now axildb-deploy.service
/usr/bin/python3 /opt/axildb-deploy/agent.py --config /etc/axildb-deploy/config.json --probe
echo 'Agent installed. Grant its identity access to the configured Git checkout, credential helper/deploy key, known_hosts and environment file separately.'
echo 'Validate host preflight and perform the first revision-stamped application deployment manually with the connection overlay. No application deployment was performed by this installer.'
