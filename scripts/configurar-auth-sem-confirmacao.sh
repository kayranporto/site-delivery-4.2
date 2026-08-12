#!/usr/bin/env bash
set -euo pipefail

: "${SUPABASE_ACCESS_TOKEN:?Defina SUPABASE_ACCESS_TOKEN com um token pessoal do Supabase}"
PROJECT_REF="${PROJECT_REF:-wzxsjxdbxonrmlmzufpv}"

patch_auth() {
  curl --fail-with-body --silent --show-error \
    -X PATCH "https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth" \
    -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$1"
}

# Configuração compatível com o plano Free.
# HIBP é aplicado separadamente porque a proteção contra senhas vazadas
# requer plano Pro ou superior no Supabase hospedado.
patch_auth '{
  "mailer_autoconfirm": true,
  "password_min_length": 8,
  "mailer_secure_email_change_enabled": true
}'

if [[ "${ENABLE_HIBP:-false}" == "true" ]]; then
  patch_auth '{
    "password_hibp_enabled": true
  }'
  printf '\nAuth atualizado: cadastro sem confirmação, senha mínima 8, troca de e-mail segura e HIBP ativado.\n'
else
  printf '\nAuth atualizado: cadastro sem confirmação, senha mínima 8 e troca de e-mail segura. HIBP não foi solicitado; use ENABLE_HIBP=true somente em plano compatível.\n'
fi
