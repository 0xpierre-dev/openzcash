#!/usr/bin/env bash
# Guarda de escopo do redesign (docs/redesign/README.md, §2 e §6).
#
# O redesign cobre o shell, a home e todas as telas. Este script FALHA se a
# branch alterar algo do conjunto PRESERVADO (Monthly, a sala 3D e seus assets) e AVISA se alterar um módulo de dados/contrato que precisa
# continuar aditivo (repositórios contábeis, importadores, política de
# publicação, rotas de API).
#
# Uso:
#   scripts/redesign-scope-check.sh [base-ref]          # padrão: origin/main
#   REDESIGN_ALLOW="src/app/page.tsx" scripts/redesign-scope-check.sh
#     rebaixa arquivos preservados (separados por vírgula) para aviso: use só
#     para uma exceção aprovada explicitamente.
#
# Considera commits desde a base, mudanças staged, não staged e arquivos novos.
set -euo pipefail

BASE="${1:-origin/main}"
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

if ! git rev-parse --verify --quiet "$BASE^{commit}" >/dev/null; then
  echo "erro: ref base '$BASE' não existe" >&2
  exit 2
fi

# Preservado byte a byte. Entradas terminadas em "/" cobrem o diretório inteiro.
PRESERVED=(
  # estados globais de carregamento e erro
  src/app/loading.tsx
  src/app/error.tsx
  # Monthly: rotas, leitor, geradores e publicações
  # (the reader components in src/components/monthly follow the theme since
  # 20/09: only the routes, the data and the published files stay frozen)
  src/app/monthly/
  src/app/monthly-preview/
  src/lib/monthly/
  public/monthly/
  # a sala 3D: só a entrada (office/page.tsx, office-entrance.tsx) é do redesign
  src/app/zcg/office/scene.tsx
  src/app/zcg/office/office-canvas.tsx
  src/app/zcg/office/proposal-dialog.tsx
  public/office-assets/
)

# Contratos e dados: mudança permitida só se for aditiva (nova função, nova
# coluna com default). "arquivo ou prefixo|o que depende dele".
SHARED=(
  "src/app/api/|contratos públicos (/api/zcg, feeds, office)"
  "src/lib/zcg/disbursements-repo.ts|ledger: grants, recipients, totals, schedule"
  "src/lib/zcg/grants-repo.ts|grants, grant detail, schedule"
  "src/lib/zcg/totals-repo.ts|totals, analytics"
  "src/lib/zcg/proposals-repo.ts|proposals, office, feeds (política D-1)"
  "src/lib/zcg/publication-policy.ts|publicação D-1 de vereditos"
  "src/lib/zcg/publications-repo.ts|publicação D-1 de vereditos"
  "src/lib/zcg/import-|importadores da planilha oficial"
  "src/lib/zcg/refresh.ts|scheduler de coleta"
  "src/lib/db/schema.ts|todas as tabelas"
  "drizzle/|migrações"
)

changed="$(
  {
    git diff --name-only "$BASE...HEAD"
    git diff --name-only
    git diff --name-only --cached
    git ls-files --others --exclude-standard
  } | sort -u
)"

if [[ -z "$changed" ]]; then
  echo "ok: nenhuma mudança em relação a $BASE"
  exit 0
fi

IFS=',' read -r -a allow <<<"${REDESIGN_ALLOW:-}"
is_allowed() {
  local f="$1" a
  for a in "${allow[@]:-}"; do
    [[ -n "$a" && "$a" == "$f" ]] && return 0
  done
  return 1
}

matches() {
  # exato, ou prefixo quando a entrada termina em "/" ou "-"
  local f="$1" entry="$2"
  [[ "$f" == "$entry" ]] && return 0
  [[ "$entry" == */ || "$entry" == *- ]] && [[ "$f" == "$entry"* ]] && return 0
  return 1
}

fail=0
warn=0
while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  for p in "${PRESERVED[@]}"; do
    if matches "$f" "$p"; then
      if is_allowed "$f"; then
        echo "aviso: arquivo preservado alterado com exceção aprovada: $f"
        warn=$((warn + 1))
      else
        echo "FALHA: arquivo preservado alterado: $f"
        fail=$((fail + 1))
      fi
    fi
  done
  for entry in "${SHARED[@]}"; do
    shared="${entry%%|*}"
    deps="${entry#*|}"
    if matches "$f" "$shared"; then
      echo "aviso: contrato ou dado compartilhado alterado: $f"
      echo "       só mudança aditiva; conferir: $deps"
      warn=$((warn + 1))
    fi
  done
done <<<"$changed"

total="$(printf '%s\n' "$changed" | grep -c . || true)"
if (( fail > 0 )); then
  echo "resultado: $fail arquivo(s) preservado(s) alterado(s) em $total mudado(s) — fora do escopo do redesign"
  exit 1
fi
echo "ok: $total arquivo(s) mudado(s), nenhum preservado; $warn aviso(s)"
