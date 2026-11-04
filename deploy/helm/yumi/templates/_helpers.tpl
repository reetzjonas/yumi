{{- define "yumi.fullname" -}}
{{- if contains .Chart.Name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name .Chart.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{- define "yumi.labels" -}}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version }}
app.kubernetes.io/part-of: yumi
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{- define "yumi.selectorLabels" -}}
app.kubernetes.io/name: yumi
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "yumi.postgresql.fullname" -}}
{{- printf "%s-postgresql" (include "yumi.fullname" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "yumi.postgresql.selectorLabels" -}}
app.kubernetes.io/name: yumi-postgresql
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "yumi.backup.fullname" -}}
{{- printf "%s-backup" (include "yumi.fullname" . | trunc 45 | trimSuffix "-") -}}
{{- end -}}

{{- define "yumi.backup.selectorLabels" -}}
app.kubernetes.io/name: yumi-backup
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "yumi.image" -}}
{{- printf "%s:%s" .Values.image.repository (default .Chart.AppVersion .Values.image.tag) -}}
{{- end -}}

{{/* Secret with DATABASE_URL and BETTER_AUTH_SECRET */}}
{{- define "yumi.secretName" -}}
{{- default (include "yumi.fullname" .) .Values.secrets.existingSecret -}}
{{- end -}}

{{/* Secret with POSTGRES_PASSWORD */}}
{{- define "yumi.postgresql.secretName" -}}
{{- default (include "yumi.fullname" .) .Values.postgresql.auth.existingSecret -}}
{{- end -}}

{{- define "yumi.validate" -}}
{{- if not .Values.baseUrl -}}
{{- fail "baseUrl is required, e.g. --set baseUrl=https://yumi.example.com" -}}
{{- end -}}
{{- if and (not .Values.secrets.existingSecret) (not .Values.postgresql.enabled) (not .Values.database.url) -}}
{{- fail "set database.url, enable postgresql, or provide secrets.existingSecret" -}}
{{- end -}}
{{- if and .Values.secrets.existingSecret .Values.postgresql.enabled (not .Values.postgresql.auth.existingSecret) -}}
{{- fail "with secrets.existingSecret and the bundled postgresql, also set postgresql.auth.existingSecret" -}}
{{- end -}}
{{- if .Values.backup.enabled -}}
{{- if not .Values.backup.s3.existingSecret -}}
{{- fail "backup.s3.existingSecret is required when backup.enabled=true" -}}
{{- end -}}
{{- if not (regexMatch "^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$" .Values.backup.s3.bucket) -}}
{{- fail "backup.s3.bucket must be a valid S3 bucket name (3-63 characters)" -}}
{{- end -}}
{{- if not (regexMatch "^[A-Za-z0-9_-]+(/[A-Za-z0-9_-]+)*$" .Values.backup.s3.prefix) -}}
{{- fail "backup.s3.prefix must be a nonempty path of letters, digits, underscores or hyphens without trailing slash" -}}
{{- end -}}
{{- if and .Values.backup.s3.endpoint (not (hasPrefix "https://" .Values.backup.s3.endpoint)) -}}
{{- fail "backup.s3.endpoint must use HTTPS" -}}
{{- end -}}
{{- if not .Values.backup.schedule -}}
{{- fail "backup.schedule is required" -}}
{{- end -}}
{{- if not .Values.backup.timeZone -}}
{{- fail "backup.timeZone is required" -}}
{{- end -}}
{{- if or (lt (int .Values.backup.startingDeadlineSeconds) 1) (lt (int .Values.backup.activeDeadlineSeconds) 1) -}}
{{- fail "backup deadlines must be positive" -}}
{{- end -}}
{{- if and .Values.backup.database.existingSecret (not .Values.backup.database.secretKey) -}}
{{- fail "backup.database.secretKey is required with backup.database.existingSecret" -}}
{{- end -}}
{{- end -}}
{{- end -}}
