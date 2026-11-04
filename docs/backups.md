# Database backups and restore

Issue: [#36](https://github.com/reetzjonas/yumi/issues/36).

The Helm chart provides an opt-in `pg_dump` CronJob for bundled or external
PostgreSQL. A PostgreSQL init container writes a custom-format archive and SHA-256
checksum to ephemeral disk, then an AWS CLI container uploads both to S3-compatible
storage **outside the Kubernetes cluster**. No additional image build is required.
The job does not mount the database PVC or Kubernetes API credentials.

## Storage and retention

Provision a private bucket on another failure domain, enable server-side encryption,
and give each installation its own prefix, for example `yumi/production`. The default
schedule is daily at 03:00 UTC: the recovery point objective is up to 24 hours plus
job duration, provided the latest job succeeded. This is a logical backup, without
point-in-time recovery. PostgreSQL roles, cluster settings, application secrets,
Helm values and external services are outside its scope; keep credentials and
deployment configuration in a separate recovery location.

Configure lifecycle expiration for the backup prefix **before enabling the job**:
30 days of completed backups and abort incomplete multipart uploads after one day.
For a versioned bucket, expire noncurrent versions after 30 days as well and clean
expired delete markers using your provider's lifecycle settings. Bucket retention
works even when the cluster is offline; the job deliberately has no delete rights.
For AWS S3, this rule illustrates the prefix policy (merge it into your existing
lifecycle configuration; replacing it affects the bucket's other lifecycle rules):

```json
{
  "Rules": [
    {
      "ID": "yumi-production-backups",
      "Status": "Enabled",
      "Filter": { "Prefix": "yumi/production/" },
      "Expiration": { "Days": 30 },
      "NoncurrentVersionExpiration": { "NoncurrentDays": 30 },
      "AbortIncompleteMultipartUpload": { "DaysAfterInitiation": 1 }
    }
  ]
}
```

Use the equivalent policy in another provider. Restrict backup credentials to
`s3:PutObject` and `s3:AbortMultipartUpload` under this prefix. If the provider
requires multipart listing, grant `s3:ListMultipartUploadParts` on the prefix and
`s3:ListBucketMultipartUploads` on the bucket. Give restore operators separate
`s3:GetObject` and prefix-scoped `s3:ListBucket` access. Encryption with a managed
key may also need the provider's key permissions. Object lock is optional and
must be compatible with the chosen lifecycle retention.

## Configuration

Supply credentials in a Kubernetes Secret using your existing secret management
workflow; never put them in Helm values:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: yumi-backup-s3
type: Opaque
stringData:
  AWS_ACCESS_KEY_ID: <backup-access-key>
  AWS_SECRET_ACCESS_KEY: <backup-secret-key>
```

The same Secret may contain `AWS_SESSION_TOKEN` for temporary credentials. Arrange
rotation before expiry. A practical values file is:

```yaml
backup:
  enabled: true
  s3:
    bucket: my-off-cluster-backups
    prefix: yumi/production
    region: us-east-1
    endpoint: https://s3.example.com # Omit for AWS S3.
    existingSecret: yumi-backup-s3
  scratchSizeLimit: 10Gi
```

Requires Kubernetes 1.27+ for stable CronJob time zones. `backup.schedule` uses
`backup.timeZone` (`Etc/UTC` by default). Overlapping scheduled jobs are forbidden;
a missed job starts only within `startingDeadlineSeconds` (default one hour).
`activeDeadlineSeconds` also defaults to one hour. Failed jobs are retained (three)
and are not automatically retried; the next schedule takes a fresh snapshot.
Successful Job history (one) is separate from object retention.

Bundled PostgreSQL uses the chart's database name, user and password Secret directly.
External PostgreSQL uses `DATABASE_URL` from the app's Secret by default. A dedicated
backup role/connection can be selected with `backup.database.existingSecret` and
`backup.database.secretKey` (default `DATABASE_URL`), including for the bundled DB.
That role must read every application table, sequence and schema; set its default
privileges for future tables as well. Keep credentials in the Secret and use libpq
TLS options such as `sslmode=verify-full` in the external connection URL.

The default dump client is PostgreSQL 18. Set `backup.postgresImage.tag` to a client
compatible with your external server: `pg_dump` cannot dump a newer server major
version. Restore using the same client major as the dump and a server of that major
or a supported newer major. Pin image tags/digests according to your image policy.

Both containers run as UID/GID 1000 with a read-only root filesystem, dropped
capabilities and no privilege escalation. Allocate enough disk in
`backup.scratchSizeLimit` for a full compressed dump and adjust `backup.resources`
for larger databases. `backup.extraEnv`, `backup.extraVolumes` and
`backup.extraVolumeMounts` support read-only Secret mounts for libpq TLS files or
a private CA (`AWS_CA_BUNDLE`). Never disable TLS verification. S3 endpoints use
HTTPS, and path-style addressing is enabled by default for provider compatibility.

When `networkPolicy.enabled=true`, the chart permits the backup to reach DNS,
bundled PostgreSQL (or external TCP 5432), and public HTTPS. Add explicit rules in
`backup.networkPolicy.extraEgress` for a private S3 endpoint, another database port,
or a dedicated backup connection to another destination. Namespace-wide policies
outside this chart may also need adjustment.

## Run and monitor

After installing with these values, replace the resource names/namespace if your
release is not named `yumi`:

```sh
kubectl create job -n yumi --from=cronjob/yumi-backup yumi-backup-manual
kubectl wait -n yumi --for=condition=complete job/yumi-backup-manual --timeout=1h
kubectl logs -n yumi job/yumi-backup-manual -c dump
kubectl logs -n yumi job/yumi-backup-manual -c upload
kubectl get cronjob -n yumi yumi-backup
```

Alert on failed jobs, a running job exceeding its deadline, and the absence of a
successful backup within 26 hours. The chart does not install an alerting stack.
Monitor off-cluster objects independently: a completed backup contains both
`database.dump` and `database.dump.sha256` below
`<prefix>/<UTC timestamp>-<pod UID>/`. The checksum uploads last and marks completion.
Incomplete uploads are not recovery points. Job success means upload succeeded;
only a restore drill demonstrates recoverability. Run a drill after setup, changes
to credentials/storage/database versions, and at least monthly.

## Restore drill or recovery

1. Select a completed backup using separate restore credentials. Download its two
   objects into a private working directory. Set `BACKUP_URI` to its full folder
   URI, and use `--endpoint-url https://s3.example.com` for non-AWS storage:

   ```sh
   umask 077
   mkdir restore-work
   cd restore-work
   aws s3 cp "$BACKUP_URI/database.dump" ./database.dump
   aws s3 cp "$BACKUP_URI/database.dump.sha256" ./database.dump.sha256
   sha256sum --check database.dump.sha256
   pg_restore --list database.dump
   ```

2. Provision an **empty** database owned by the intended application role on the
   replacement PostgreSQL server. Recreate required extensions/roles using your
   deployment configuration. Do not restore over a running application's database.
   Set `DATABASE_URL` through a secure environment/Secret, pointing to this empty
   target, then run from the repository root:

   ```sh
   sh scripts/backup/restore.sh /absolute/path/restore-work/database.dump
   ```

   The helper uses `pg_restore --no-owner --no-acl --exit-on-error
   --single-transaction`. Objects belong to the target role; source role names and
   grants are not required. A SQL error rolls back the restore. It never drops or
   cleans the existing target. A nonempty target with conflicting objects fails.

3. Check representative households, recipes, ingredients and shopping items in SQL.
   Start the matching yumi image against the restored database, preserving the
   original `BETTER_AUTH_SECRET` if existing sessions must remain valid. Check login,
   household access, recipe display, meal planning and shopping-list writes in the
   UI. For a drill, keep the application isolated from production credentials/jobs.

4. During recovery, stop the old app before switching its database Secret to the
   verified replacement. Start a single replica so migrations run once, confirm
   readiness and the checks above, then resume backups (`backup.suspend=false`).
   Record the backup URI, validation results and elapsed restore time in the
   operational incident/drill record. Remove the private local dump after use.

## Local regression checks

```sh
python3 deploy/tests/backups.py
sh deploy/tests/backup-restore.sh
```

The chart tests require Helm and Python 3 with PyYAML. The restore check requires
Docker and the repository's PostgreSQL service (`bun run db:up`). It creates two
uniquely named disposable databases, exercises the exact chart dump script and
restore helper with related household/recipe/shopping data, verifies constraints,
sequence advancement and rollback on conflicts, and drops only those databases.
It never restores into the development database. Chart tests also exercise upload
success/failure with a fake AWS CLI; an actual off-cluster upload, provider retention,
cluster scheduling and the application UI drill must be checked in the target
environment. Nothing here deploys to a cluster.
