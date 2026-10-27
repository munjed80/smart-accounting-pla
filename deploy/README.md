# Standalone ZZPersHub VPS deployment

The existing Coolify deployment is untouched by this PR. This is an independent
Docker Compose stack, environment generator, release publisher and transfer path.
A new environment **preserves the existing SECRET_KEY during migration**: this
key signs JWTs AND encrypts stored integration credentials. Losing it requires
reconnecting affected integrations; generating a replacement cannot decrypt them.

Requirements: a dedicated x86_64 Linux VPS (Ubuntu 24.04 LTS is the documented
baseline), Python 3.12+, Docker Engine, Compose **2.30+**, restic, working DNS for
both domains, and inbound TCP 80/443 (UDP 443 optional). Only Caddy publishes ports.
Docker access is root-equivalent. Runtime files stay outside git, readable only
by root. Run operations with `sudo`; do not paste secret files into issues/chat.

## 1. Release preparation

CI runs application/browser tests plus real image builds and a disposable
migration/API/worker/backup/restore smoke test. After successful **main push CI**,
`Release images` checks out that exact main commit, publishes amd64 images to
GHCR, and attaches a `zzpershub-COMMIT_SHA` artifact to its workflow run. The
artifact contains runtime files and `release.json` with immutable image digests
and its expected Alembic revision. No production SSH or auto-deploy is configured.

Set repository variable `PUBLIC_API_URL` if the API origin differs from
`https://api.zzpershub.nl`. Vite embeds this value at build time; changing runtime
env alone cannot change the browser API endpoint. Deployment rejects a mismatch.
Download/extract the release artifact into `/opt/zzpershub/releases/COMMIT_SHA/`.
Keep older release directories unchanged for recovery. For private GHCR packages,
log in on the VPS using a read-packages token via `docker login ghcr.io
--username YOUR_LOGIN --password-stdin`; never add a token to repository files.

The Python runtime moved to 3.12/bookworm and frontend build to Node 22. Existing
Coolify Dockerfile startup remains available; only this Compose overrides it to
separate migration from normal process restarts. Seeds are not rerun on every
release. Initial business-plan/reference seeding is a separate reviewed task.

## 2. Inventory and recover the environment without the Coolify UI

Use SSH to list container names and published ports:

```sh
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}'
```

Identify **this application's** backend, worker, PostgreSQL and Redis containers
and its upload directory. Check the database major version with `SHOW
server_version`. The generator supports target PostgreSQL 15, 16 or 17. Choose
the source major for the first transfer; do not point a new-major image at old
PostgreSQL data files. PostgreSQL 18 layouts need a separate reviewed adjustment.

From the extracted release directory:

```sh
sudo python3 ops.py export-runtime --container CURRENT_BACKEND_CONTAINER \
  --output /root/runtime-export.json
sudo python3 ops.py init --config /etc/zzpershub \
  --data /srv/zzpershub/data --postgres-major 15 \
  --import-json /root/runtime-export.json
```

This writes `server.env`, `backend.env`, `worker.env`, `backup.env` (0600). It
creates a new database password/connection while preserving the old application
key and recognized application/integration settings. Literal `$`, quotes and
backslashes survive in raw backend/worker env files. Upload mount paths are
preserved too. Review missing integration settings privately. `--fresh-install`
exists for **empty test installations only**; never substitute it for an export
when migrating existing users, invoices or encrypted credentials. The generator
refuses overwriting existing configuration. No real secret file is committed.

If the old backend cannot be inspected, recover the key from an existing secure
backup or reconnect integrations after a separately planned key rotation.

## 3. Offsite backup setup

Install restic from a supported distribution package. Edit `/etc/zzpershub/backup.env`
with an OFF-SERVER repository URI (e.g. `s3:https://ENDPOINT/BUCKET/zzpershub`) and
its credentials. A new encryption password is generated locally; preserve it in
a password manager. Use raw `KEY=value`, one value per line, without shell
expansion or wrapping quotes. Initialize the repository once with the same
credentials using restic's documented environment/password-file method. The
operations tool never sources env files as shell code. Production deployment
requires a successful encrypted offsite backup before changing schema.

Restic credentials protect backups containing database records, files and old
runtime secrets. Configure object versioning/retention on the offsite provider.
The scripts do not automatically prune snapshots or local copies. Monitor disk
usage and define retention after a restore has been verified. Backup failure
returns a failing exit status; arrange alerts from systemd/your monitoring service.

## 4. Offline source transfer

Do a rehearsal on separate data first. At the actual cutover, stop **all old
application writers**, including the worker and any cron jobs touching this DB,
before the final export. Keep source containers/volumes intact. Do not run both
installations with writes enabled. Before taking ports 80/443, verify whether the
Coolify proxy serves other applications: move those routes or use a dedicated
VPS. This tool refuses occupied public ports and never removes Coolify for you.

Example commands on the source VPS, after setting actual container names:

```sh
SOURCE_DB=YOUR_DATABASE_CONTAINER
SOURCE_BACKEND=YOUR_BACKEND_CONTAINER
SOURCE_WORKER=YOUR_WORKER_CONTAINER
SOURCE_REDIS=YOUR_REDIS_CONTAINER
sudo install -d -m 700 /root/zzp-transfer
docker stop -t 120 "$SOURCE_BACKEND" "$SOURCE_WORKER"
docker exec "$SOURCE_DB" sh -ceu \
  'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-acl -Fc' \
  > /root/zzp-transfer/database.dump
```

Copy the **actual** upload mount path from the stopped backend (the default is
`/data/uploads`) and name the resulting directory `uploads`. Stop the old Redis
cleanly and verify its logs show successful persistence; copy its complete `/data`
directory as `redis`. `docker cp` works on stopped containers:

```sh
docker cp "$SOURCE_BACKEND":/data/uploads /root/zzp-transfer/uploads
docker stop -t 120 "$SOURCE_REDIS"
docker cp "$SOURCE_REDIS":/data /root/zzp-transfer/redis
sudo tar -C /root/zzp-transfer -czf /root/zzp-transfer/uploads.tar.gz uploads
sudo tar -C /root/zzp-transfer -czf /root/zzp-transfer/redis.tar.gz redis
sudo python3 make_import_snapshot.py \
  --database /root/zzp-transfer/database.dump \
  --uploads /root/zzp-transfer/uploads.tar.gz \
  --redis /root/zzp-transfer/redis.tar.gz \
  --output /root/zzp-import --source-writers-stopped
```

Take an encrypted offsite copy of this transfer and runtime export before
switching. The flag is an operator acknowledgement, not proof that unrelated
writers/cron jobs have stopped. Packaging checksums alone do not prove DB/file
consistency. RDB-only Redis exports are loaded first without AOF, then Redis
creates a new AOF before normal startup; existing AOF exports are preserved.

On the target, use the release's Compose file with its image refs: operations are
normally invoked through `ops.py`; for the initial restore start **only** `db`
and `redis` using the helper below. It validates the release/config and keeps
application writers stopped.

```sh
sudo python3 restore_prepare.py --config /etc/zzpershub \
  --release /opt/zzpershub/releases/COMMIT_SHA
sudo python3 ops.py restore --config /etc/zzpershub \
  --release /opt/zzpershub/releases/COMMIT_SHA --snapshot /root/zzp-import
```

Restore validates checksums and archive paths and refuses a populated target DB
or upload directory. It never drops existing production data. Configuration from
an old backup is not automatically installed over the newly generated config.
Verify user/invoice counts, paid/open balances, representative uploads, encrypted
integrations and the Alembic revision before enabling the target. Keep the old
installation stopped for final validation. TLS certificates are reissued by Caddy;
check A/AAAA DNS, firewall rules, webhook URLs and the actual domain mapping.

## 5. Deploy, backup, rollback

```sh
sudo python3 ops.py deploy --config /etc/zzpershub \
  --release /opt/zzpershub/releases/COMMIT_SHA
sudo python3 ops.py status --config /etc/zzpershub
sudo python3 ops.py backup --config /etc/zzpershub
```

Deployment pulls app images by digest, validates production config, checks public
ports, stops writers behind a maintenance page, backs up DB/uploads/Redis/config,
uploads the backup offsite, runs migrations exactly once, verifies revision and
service health, then enables routing and checks both public origins. There is a
maintenance window; this is not a zero-downtime strategy. On migration failure,
maintenance stays enabled. Inspect logs and the revision before recovery. Never
blindly retry an unknown partially-applied migration or stamp a revision to hide it.

```sh
sudo python3 ops.py rollback --config /etc/zzpershub \
  --release /opt/zzpershub/releases/PREVIOUS_COMMIT_SHA
```

Code rollback is allowed only if the database revision matches the target
release. There is no automatic database downgrade or destructive restore. A schema
change may require a forward fix or a separately approved data restore to an empty
target. Before any target writes, source fallback can restart the unchanged source
stack/proxy; once target writes exist, reconcile those writes before source fallback.

To schedule daily backups:

```sh
sudo install -d /opt/zzpershub
sudo install -m 644 run_current.py /opt/zzpershub/run_current.py
sudo install -m 644 systemd/zzpershub-backup.* /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now zzpershub-backup.timer
sudo systemctl list-timers zzpershub-backup.timer
```

The timer runs around 02:15 UTC. Scheduled backups stop writers only while taking
the consistent local snapshot, resume the app, then upload offsite. Test restoring
an offsite snapshot to an isolated empty stack regularly. Keep Coolify, its DB,
source PostgreSQL and uploads intact until this restore and production acceptance
are complete. Stop its deployment webhook/auto-deploy so later pushes cannot wake
old application writers. Removing Coolify is a final server operation after this
validation, not part of repository setup.

References: Docker Compose production/secrets docs, Caddy HTTPS documentation,
and GitHub's GHCR publishing documentation. No production VPS, credentials, DNS,
bank, email or tax endpoint is contacted by the repository tests.

Official references:
- https://docs.docker.com/compose/how-tos/production/
- https://docs.docker.com/compose/how-tos/environment-variables/set-environment-variables/
- https://caddyserver.com/docs/quick-starts/https
- https://docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images
- https://redis.io/docs/latest/management/persistence/
