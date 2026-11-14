#!/usr/bin/env bash
# Cria no GitHub as issues de docs/backlog/estudo-mercado/NN-*.md.
# Uso: scripts/criar-issues-estudo-mercado.sh [--dry-run] [--repo dono/repo] [--dir pasta]
# Requer gh autenticado (gh auth login). Compatível com o bash 3.2 do macOS.
set -euo pipefail

REPO="coletivo-inspira/vitrine"
DRY_RUN=0
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKLOG_DIR="$SCRIPT_DIR/../docs/backlog/estudo-mercado"
BACKLOG_PATH="docs/backlog/estudo-mercado"

usage() {
  sed -n '2,4p' "$0" | sed 's/^# \{0,1\}//'
}

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --repo) REPO="${2:?--repo precisa de dono/repo}"; shift ;;
    --dir) BACKLOG_DIR="${2:?--dir precisa de uma pasta}"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Opção desconhecida: $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

[ -d "$BACKLOG_DIR" ] || { echo "Pasta não encontrada: $BACKLOG_DIR" >&2; exit 1; }

FILES=()
for f in "$BACKLOG_DIR"/[0-9][0-9]-*.md; do
  [ -e "$f" ] && FILES+=("$f")
done
[ "${#FILES[@]}" -gt 0 ] || { echo "Nenhum arquivo NN-*.md em $BACKLOG_DIR" >&2; exit 1; }

GH_OK=0
if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  GH_OK=1
elif [ "$DRY_RUN" -eq 0 ]; then
  echo "gh não está instalado ou autenticado. Rode 'gh auth login' ou use --dry-run." >&2
  exit 1
else
  echo "Aviso: gh indisponível; o ensaio supõe que nenhum rótulo ou issue existe." >&2
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
MAP="$WORK/map.tsv"        # NN <tab> número da issue
CREATED="$WORK/created.txt" # NN de issues criadas nesta execução
: > "$MAP"; : > "$CREATED"

label_meta() {
  case "$1" in
    estudo-mercado) echo "5319e7|Derivada do estudo de mercado 2026 (docs/market-study-2026.md)" ;;
    cobranca) echo "0e8a16|Planos, assinatura e cobrança (ADR 0013)" ;;
    vitrine-publica) echo "1d76db|Vitrine pública e conversão" ;;
    aquisicao) echo "fbca04|Aquisição de novos negócios" ;;
    painel) echo "c5def5|Painel administrativo" ;;
    depois) echo "bfdadc|Planejada para depois" ;;
    *) echo "ededed|" ;;
  esac
}

field() { # field <arquivo> <chave>
  awk -v key="$2" '
    NR == 1 && $0 == "---" { inside = 1; next }
    inside && $0 == "---" { exit }
    inside && index($0, key ":") == 1 { sub("^" key ":[ ]*", ""); print; exit }
  ' "$1" | sed -e 's/^"//' -e 's/"$//' -e 's/\\"/"/g'
}

body_of() { # corpo sem o cabeçalho, com links relativos absolutos
  awk 'NR == 1 && $0 == "---" { inside = 1; next }
       inside && $0 == "---" { inside = 0; done = 1; next }
       !inside { print }' "$1" |
    sed -E \
      -e "s#\]\(\.\./\.\./\.\./#](https://github.com/$REPO/blob/main/#g" \
      -e "s#\]\(\.\./\.\./#](https://github.com/$REPO/blob/main/docs/#g" \
      -e "s#\]\(([0-9]{2}-[^)]+\.md)\)#](https://github.com/$REPO/blob/main/$BACKLOG_PATH/\1)#g"
}

resolve_tokens() { # resolve_tokens <entrada> <saída>
  local expr=() nn num
  while IFS="$(printf '\t')" read -r nn num; do
    expr+=(-e "s/\{\{issue:$nn\}\}/#$num/g")
  done < "$MAP"
  expr+=(-e 's/\{\{issue:([0-9]{2})\}\}/(item \1 do backlog)/g')
  sed -E "${expr[@]}" "$1" > "$2"
}

# Rótulos
EXISTING_LABELS="$WORK/labels.txt"; : > "$EXISTING_LABELS"
if [ "$GH_OK" -eq 1 ]; then
  gh label list --repo "$REPO" --limit 500 --json name --jq '.[].name' > "$EXISTING_LABELS"
fi
ALL_LABELS="$(for f in "${FILES[@]}"; do field "$f" rotulos | tr ',' '\n'; done | sed 's/^ *//;s/ *$//' | grep -v '^$' | sort -u)"
for label in $ALL_LABELS; do
  if grep -Fxq "$label" "$EXISTING_LABELS"; then
    echo "Rótulo existente: $label"
    continue
  fi
  meta="$(label_meta "$label")"
  if [ "$DRY_RUN" -eq 1 ]; then
    echo "[ensaio] criaria o rótulo: $label"
  else
    gh label create "$label" --repo "$REPO" --color "${meta%%|*}" --description "${meta#*|}" >/dev/null
    echo "Rótulo criado: $label"
  fi
done

# Issues existentes (todas as situações), por título exato
EXISTING_ISSUES="$WORK/issues.tsv"; : > "$EXISTING_ISSUES"
if [ "$GH_OK" -eq 1 ]; then
  gh issue list --repo "$REPO" --state all --limit 2000 --json number,title \
    --jq '.[] | "\(.number)\t\(.title)"' > "$EXISTING_ISSUES"
fi

for f in "${FILES[@]}"; do
  nn="$(basename "$f" | cut -c1-2)"
  title="$(field "$f" titulo)"
  [ -n "$title" ] || { echo "Sem 'titulo' no cabeçalho: $f" >&2; exit 1; }
  num="$(awk -F'\t' -v t="$title" '$2 == t { print $1; exit }' "$EXISTING_ISSUES")"
  if [ -n "$num" ]; then
    printf '%s\t%s\n' "$nn" "$num" >> "$MAP"
    echo "$nn → #$num (já existia) $title"
    continue
  fi

  body_of "$f" > "$WORK/$nn.raw.md"
  resolve_tokens "$WORK/$nn.raw.md" "$WORK/$nn.md"
  label_args=()
  for label in $(field "$f" rotulos | tr ',' ' '); do
    label_args+=(--label "$label")
  done

  if [ "$DRY_RUN" -eq 1 ]; then
    echo "[ensaio] $nn → criaria: $title [$(field "$f" rotulos)]"
    continue
  fi
  url="$(gh issue create --repo "$REPO" --title "$title" --body-file "$WORK/$nn.md" ${label_args[@]+"${label_args[@]}"})"
  num="${url##*/}"
  printf '%s\t%s\n' "$nn" "$num" >> "$MAP"
  echo "$nn" >> "$CREATED"
  echo "$nn → #$num (criada) $title"
done

# Segunda passada: referências a issues criadas depois na mesma execução
if [ "$DRY_RUN" -eq 0 ]; then
  while read -r nn; do
    [ -n "$nn" ] || continue
    if grep -Eq '\{\{issue:[0-9]{2}\}\}' "$WORK/$nn.raw.md"; then
      resolve_tokens "$WORK/$nn.raw.md" "$WORK/$nn.final.md"
      if ! cmp -s "$WORK/$nn.md" "$WORK/$nn.final.md"; then
        num="$(awk -F'\t' -v k="$nn" '$1 == k { print $2; exit }' "$MAP")"
        gh issue edit "$num" --repo "$REPO" --body-file "$WORK/$nn.final.md" >/dev/null
        echo "$nn → #$num referências atualizadas"
      fi
    fi
  done < "$CREATED"
fi

echo
echo "Resumo (arquivo → issue):"
if [ -s "$MAP" ]; then
  sort "$MAP" | while IFS="$(printf '\t')" read -r nn num; do echo "  $nn → #$num"; done
else
  echo "  nenhuma issue criada (ensaio)"
fi
