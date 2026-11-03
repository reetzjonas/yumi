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
{{- end -}}
