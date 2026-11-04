#!/usr/bin/env python3
"""Regression checks for the opt-in backup chart and its exact shell scripts."""

import os
from pathlib import Path
import subprocess
import tempfile
import unittest

import yaml


ROOT = Path(__file__).resolve().parents[2]
CHART = ROOT / "deploy/helm/yumi"
BASE = ["--set", "baseUrl=https://yumi.example.com"]
ENABLED = [
    "--set", "backup.enabled=true",
    "--set", "backup.s3.bucket=yumi-backup-tests",
    "--set", "backup.s3.existingSecret=backup-credentials",
]


def helm(*args, enabled=True, release="yumi"):
    return subprocess.run(
        ["helm", "template", release, str(CHART), *BASE,
         *(ENABLED if enabled else []), *args],
        capture_output=True, text=True, check=False, timeout=30,
    )


class ChartTests(unittest.TestCase):
    def render(self, *args, **kwargs):
        result = helm(*args, **kwargs)
        self.assertEqual(result.returncode, 0, result.stderr)
        return list(yaml.safe_load_all(result.stdout))

    def resource(self, resources, kind, name=None):
        return next(r for r in resources if r["kind"] == kind and
                    (name is None or r["metadata"]["name"] == name))

    def pod(self, resources):
        return self.resource(resources, "CronJob")["spec"]["jobTemplate"]["spec"]["template"]["spec"]

    def test_default_has_no_backup_resources(self):
        resources = self.render(enabled=False)
        self.assertFalse(any(r["kind"] == "CronJob" for r in resources))
        self.assertFalse(any(r["kind"] == "ConfigMap" for r in resources))

    def test_helm_lint_default_and_enabled(self):
        for options in ([], ENABLED):
            result = subprocess.run(
                ["helm", "lint", str(CHART), *BASE, *options],
                capture_output=True, text=True, timeout=30, check=False,
            )
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_bundled_credentials_and_security(self):
        resources = self.render()
        cron = self.resource(resources, "CronJob")["spec"]
        self.assertEqual(cron["schedule"], "0 3 * * *")
        self.assertEqual(cron["timeZone"], "Etc/UTC")
        self.assertEqual(cron["concurrencyPolicy"], "Forbid")
        self.assertEqual(cron["jobTemplate"]["spec"]["backoffLimit"], 0)
        pod = self.pod(resources)
        self.assertFalse(pod["automountServiceAccountToken"])
        self.assertEqual(pod["restartPolicy"], "Never")
        self.assertTrue(pod["securityContext"]["runAsNonRoot"])
        self.assertEqual(pod["securityContext"]["runAsUser"], 1000)
        self.assertEqual(pod["securityContext"]["seccompProfile"]["type"], "RuntimeDefault")
        dump = pod["initContainers"][0]
        upload = pod["containers"][0]
        env = {item["name"]: item for item in dump["env"]}
        self.assertEqual(env["PGHOST"]["value"], "yumi-postgresql")
        self.assertEqual(env["PGPASSWORD"]["valueFrom"]["secretKeyRef"],
                         {"name": "yumi", "key": "POSTGRES_PASSWORD"})
        self.assertNotIn("envFrom", dump)
        self.assertNotIn("DATABASE_URL", env)
        self.assertEqual(upload["envFrom"][0]["secretRef"]["name"], "backup-credentials")
        self.assertFalse(any(e["name"] in ("PGPASSWORD", "DATABASE_URL") for e in upload["env"]))
        for container in (dump, upload):
            self.assertTrue(container["securityContext"]["readOnlyRootFilesystem"])
            self.assertFalse(container["securityContext"]["allowPrivilegeEscalation"])
            self.assertEqual(container["securityContext"]["capabilities"]["drop"], ["ALL"])
        self.assertTrue(next(m for m in upload["volumeMounts"] if m["name"] == "backup")["readOnly"])
        config = self.resource(resources, "ConfigMap")["data"]
        for script in ("backup.sh", "upload.sh"):
            self.assertEqual(config[script], (CHART / "files" / script).read_text())

    def test_external_database_app_secret(self):
        resources = self.render("--set", "postgresql.enabled=false",
                                "--set", "secrets.existingSecret=app-credentials")
        env = {e["name"]: e for e in self.pod(resources)["initContainers"][0]["env"]}
        self.assertEqual(env["DATABASE_URL"]["valueFrom"]["secretKeyRef"],
                         {"name": "app-credentials", "key": "DATABASE_URL"})
        self.assertNotIn("PGPASSWORD", env)
        self.assertFalse(any(r["kind"] == "StatefulSet" for r in resources))

    def test_external_database_generated_secret(self):
        resources = self.render("--set", "postgresql.enabled=false",
                                "--set", "database.url=postgresql://example/yumi")
        env = {e["name"]: e for e in self.pod(resources)["initContainers"][0]["env"]}
        self.assertEqual(env["DATABASE_URL"]["valueFrom"]["secretKeyRef"]["name"], "yumi")

    def test_separate_backup_secret_and_custom_settings(self):
        resources = self.render(
            "--set", "backup.database.existingSecret=readonly-db",
            "--set", "backup.database.secretKey=connection",
            "--set", "backup.s3.endpoint=https://s3.example.com",
            "--set", "backup.s3.prefix=cluster-a/yumi",
            "--set", "backup.suspend=true",
            "--set", "backup.schedule=0 4 * * *",
        )
        env = {e["name"]: e for e in self.pod(resources)["initContainers"][0]["env"]}
        self.assertEqual(env["DATABASE_URL"]["valueFrom"]["secretKeyRef"],
                         {"name": "readonly-db", "key": "connection"})
        self.assertTrue(self.resource(resources, "CronJob")["spec"]["suspend"])
        self.assertEqual(self.resource(resources, "CronJob")["spec"]["schedule"], "0 4 * * *")

    def test_bundled_existing_password(self):
        resources = self.render("--set", "secrets.existingSecret=app-credentials",
                                "--set", "postgresql.auth.existingSecret=pg-credentials")
        env = {e["name"]: e for e in self.pod(resources)["initContainers"][0]["env"]}
        self.assertEqual(env["PGPASSWORD"]["valueFrom"]["secretKeyRef"]["name"], "pg-credentials")

    def test_network_policy(self):
        resources = self.render("--set", "networkPolicy.enabled=true")
        pg_policy = self.resource(resources, "NetworkPolicy", "yumi-postgresql")
        peers = pg_policy["spec"]["ingress"][0]["from"]
        self.assertTrue(any(p["podSelector"]["matchLabels"]["app.kubernetes.io/name"]
                            == "yumi-backup" for p in peers))
        policy = self.resource(resources, "NetworkPolicy", "yumi-backup")
        self.assertEqual(policy["spec"]["ingress"], [])
        self.assertEqual(policy["spec"]["egress"][1]["to"][0]["podSelector"]["matchLabels"]
                         ["app.kubernetes.io/name"], "yumi-postgresql")
        self.assertEqual(policy["spec"]["egress"][2]["ports"], [{"protocol": "TCP", "port": 443}])

    def test_custom_egress_and_tls_material(self):
        with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml") as values:
            yaml.safe_dump({
                "networkPolicy": {"enabled": True},
                "backup": {
                    "database": {"existingSecret": "dedicated"},
                    "networkPolicy": {"extraEgress": [
                        {"to": [{"ipBlock": {"cidr": "10.20.0.1/32"}}],
                         "ports": [{"protocol": "TCP", "port": 443}]}]},
                    "extraEnv": [{"name": "AWS_CA_BUNDLE", "value": "/tls/ca.crt"}],
                    "extraVolumes": [{"name": "tls", "secret": {"secretName": "ca"}}],
                    "extraVolumeMounts": [{"name": "tls", "mountPath": "/tls", "readOnly": True}],
                },
            }, values)
            values.flush()
            resources = self.render("-f", values.name)
        pod = self.pod(resources)
        self.assertEqual(pod["volumes"][-1]["secret"]["secretName"], "ca")
        for container in (pod["initContainers"][0], pod["containers"][0]):
            self.assertEqual(container["volumeMounts"][-1]["mountPath"], "/tls")
        policy = self.resource(resources, "NetworkPolicy", "yumi-backup")
        self.assertEqual(policy["spec"]["egress"][-1]["to"][0]["ipBlock"]["cidr"], "10.20.0.1/32")
        self.assertNotIn("to", policy["spec"]["egress"][1])

    def test_long_release_name_fits_cronjob_limit(self):
        resources = self.render(release="a" * 53)
        self.assertLessEqual(len(self.resource(resources, "CronJob")["metadata"]["name"]), 52)

    def test_invalid_configuration_fails(self):
        for setting, message in [
            ("backup.s3.existingSecret=", "backup.s3.existingSecret is required"),
            ("backup.s3.bucket=", "backup.s3.bucket must be"),
            ("backup.s3.prefix=", "backup.s3.prefix must be"),
            ("backup.s3.prefix=unsafe/../prefix", "backup.s3.prefix must be"),
            ("backup.s3.endpoint=http://s3.example.com", "backup.s3.endpoint must use HTTPS"),
            ("backup.schedule=", "backup.schedule is required"),
            ("backup.timeZone=", "backup.timeZone is required"),
            ("backup.activeDeadlineSeconds=0", "backup deadlines must be positive"),
            ("backup.startingDeadlineSeconds=0", "backup deadlines must be positive"),
        ]:
            with self.subTest(setting=setting):
                result = helm("--set", setting)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn(message, result.stderr)
        result = helm("--set", "backup.database.existingSecret=backup-db",
                      "--set", "backup.database.secretKey=")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("backup.database.secretKey is required", result.stderr)


class UploadScriptTests(unittest.TestCase):
    def run_upload(self, failure=""):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            (path / "database.dump").write_bytes(b"test archive")
            (path / "database.dump.sha256").write_text("test checksum\n")
            aws = path / "aws"
            aws.write_text(
                "#!/bin/sh\n"
                'printf "%s\\n" "$*" >> "$CALL_LOG"\n'
                'case "$*" in\n'
                '  *database.dump.sha256*) [ "$FAIL_UPLOAD" != checksum ] || exit 43 ;;\n'
                '  *database.dump*) [ "$FAIL_UPLOAD" != dump ] || exit 42 ;;\n'
                'esac\n'
            )
            aws.chmod(0o700)
            log = path / "calls.log"
            env = {
                **os.environ, "PATH": f"{path}:{os.environ['PATH']}",
                "BACKUP_DIR": str(path), "BACKUP_ID": "test-pod",
                "S3_BUCKET": "tests", "S3_PREFIX": "yumi/test",
                "S3_ENDPOINT": "https://s3.example.com",
                "AWS_ACCESS_KEY_ID": "test-access", "AWS_SECRET_ACCESS_KEY": "test-secret",
                "CALL_LOG": str(log), "FAIL_UPLOAD": failure,
            }
            result = subprocess.run(["sh", str(CHART / "files/upload.sh")],
                                    env=env, capture_output=True, text=True, timeout=10, check=False)
            return result, log.read_text().splitlines()

    def test_success_uploads_completion_marker_last(self):
        result, calls = self.run_upload()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(len(calls), 3)
        self.assertIn("configure set default.s3.addressing_style path", calls[0])
        self.assertIn("--endpoint-url https://s3.example.com s3 cp", calls[1])
        self.assertTrue(calls[2].endswith("/database.dump.sha256 --only-show-errors"))
        self.assertIn("Backup complete:", result.stdout)

    def test_failed_dump_upload_has_no_completion_marker(self):
        result, calls = self.run_upload("dump")
        self.assertEqual(result.returncode, 42)
        self.assertEqual(len(calls), 2)
        self.assertNotIn("Backup complete:", result.stdout)

    def test_failed_checksum_upload_is_failed_job(self):
        result, calls = self.run_upload("checksum")
        self.assertEqual(result.returncode, 43)
        self.assertEqual(len(calls), 3)
        self.assertNotIn("Backup complete:", result.stdout)


if __name__ == "__main__":
    unittest.main(verbosity=2)
