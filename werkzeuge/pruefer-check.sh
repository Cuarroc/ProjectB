#!/usr/bin/env bash
# Aufruf: bash werkzeuge/pruefer-check.sh SHA success|failure TITEL KURZTEXT [review/claude|review/codex]
# --test prüft nur die Repo-Grenze, legt keinen Check an. Benötigt PRUEFER_APP_ID und PRUEFER_APP_KEY (PEM).
set +x +v
set -Eeuo pipefail
shopt -s inherit_errexit
unset GH_DEBUG GITHUB_TOKEN GH_ENTERPRISE_TOKEN GITHUB_ENTERPRISE_TOKEN
trap 'printf "Prüfer-Check fehlgeschlagen. Zugangsdaten und API-Antworten werden nicht ausgegeben.\n" >&2' ERR

openssl_cmd=openssl
# Das native Windows-OpenSSL versteht /dev/fd nicht; MSYS-OpenSSL hält den Schlüssel im Speicher.
case ${OSTYPE:-} in msys*|cygwin*) openssl_cmd=/usr/bin/openssl ;; esac
base64url() { "$openssl_cmd" base64 -A | tr '+/' '-_' | tr -d '='; }
build_jwt() {
    local now header payload signature
    now=$(date +%s)
    header=$(printf '%s' '{"alg":"RS256","typ":"JWT"}' | base64url)
    payload=$(printf '{"iat":%s,"exp":%s,"iss":"%s"}' "$((now-60))" "$((now+540))" "$PRUEFER_APP_ID" | base64url)
    signature=$(printf '%s' "$header.$payload" | "$openssl_cmd" dgst -sha256 \
        -sign <(printf '%s' "$PRUEFER_APP_KEY") 2>/dev/null | base64url)
    jwt=$header.$payload.$signature
}
api() {
    # Kein gemeinsamer Token, kein Debug-Logging und keine ungefilterten Fehlerantworten.
    GH_TOKEN=$credential gh api --hostname github.com -H "Authorization: Bearer $credential" \
        -H 'Accept: application/vnd.github+json' -H 'X-GitHub-Api-Version: 2022-11-28' "$@" 2>/dev/null
}
main() {
    local mode=${1:-} sha conclusion title summary name jwt credential installation scope
    if [[ $mode != --test ]]; then
        [[ $# -ge 4 && $# -le 5 ]] || return 1
        sha=$1 conclusion=$2 title=$3 summary=$4 name=${5:-review/claude}
        [[ $sha =~ ^[[:xdigit:]]{40}$ && $conclusion =~ ^(success|failure)$ && -n $title && -n $summary ]] || return 1
        [[ $name == review/claude || $name == review/codex ]] || return 1
    else
        [[ $# == 1 ]] || return 1
    fi
    [[ ${PRUEFER_APP_ID:-} =~ ^[0-9]+$ && -n ${PRUEFER_APP_KEY:-} ]] || return 1
    build_jwt
    credential=$jwt
    installation=$(api repos/Cuarroc/ProjectB/installation --jq '.id')
    [[ $installation =~ ^[0-9]+$ ]] || return 1
    credential=$(api --method POST "app/installations/$installation/access_tokens" --jq '.token')
    [[ -n $credential && $credential != null && $credential != *$'\n'* ]] || return 1
    # Absichtlich unbeschränkten Installationstoken prüfen: eine zu breite Installation ist ein Fehler.
    scope=$(api 'installation/repositories?per_page=100' \
        --jq '[.total_count, (.repositories | length), .repositories[0].full_name] | @tsv')
    [[ $scope == $'1\t1\tCuarroc/ProjectB' ]] || return 1
    if [[ $mode == --test ]]; then
        printf 'Repo-Grenze bestätigt: Cuarroc/ProjectB\n'
        return
    fi
    api --method POST repos/Cuarroc/ProjectB/check-runs -f "name=$name" -f "head_sha=$sha" \
        -f status=completed -f "conclusion=$conclusion" -f "output[title]=$title" -f "output[summary]=$summary" >/dev/null
    printf 'Check-Run angelegt: %s\n' "$name"
}
if [[ ${BASH_SOURCE[0]} == "$0" ]]; then main "$@"; fi
