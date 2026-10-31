#!/usr/bin/env bash
# Aufruf: bash werkzeuge/pruefer-check.sh SHA success|failure TITEL KURZTEXT [review/claude|review/codex]
# --test prüft nur die Repo-Grenze, legt keinen Check an. Benötigt PRUEFER_APP_ID und PRUEFER_APP_KEY (PEM).
set +x +v
set -Eeuo pipefail
shopt -s inherit_errexit
unset GH_DEBUG GH_TOKEN GITHUB_TOKEN GH_ENTERPRISE_TOKEN GITHUB_ENTERPRISE_TOKEN
export -n PRUEFER_APP_KEY PRUEFER_APP_ID
trap 'printf "Prüfer-Check fehlgeschlagen. Zugangsdaten und API-Antworten werden nicht ausgegeben.\n" >&2' ERR

openssl_cmd=openssl
# Das native Windows-OpenSSL versteht /dev/fd nicht; MSYS-OpenSSL hält den Schlüssel im Speicher.
case ${OSTYPE:-} in msys*|cygwin*) openssl_cmd=/usr/bin/openssl ;; esac
base64url() { "$openssl_cmd" base64 -A | tr '+/' '-_' | tr -d '='; }
build_jwt() {
    local now header payload signature body key_type normalized i
    local LC_ALL=C
    export -n header payload signature body key_type normalized
    if [[ $PRUEFER_APP_KEY =~ ^-----BEGIN\ ([A-Z0-9\ ]+)-----([[:space:]A-Za-z0-9+/=]*)-----END\ ([A-Z0-9\ ]+)-----[[:space:]]*$ ]]; then
        key_type=${BASH_REMATCH[1]} body=${BASH_REMATCH[2]}
        [[ $key_type == "${BASH_REMATCH[3]}" ]] || return 1
    else
        return 1
    fi
    body=${body//[[:space:]]/}
    [[ -n $body ]] || return 1
    printf -v normalized '%s\n' "-----BEGIN $key_type-----"
    for ((i=0; i<${#body}; i+=64)); do
        normalized+=${body:i:64}$'\n'
    done
    normalized+="-----END $key_type-----"$'\n'
    now=$(date +%s)
    header=$(printf '%s' '{"alg":"RS256","typ":"JWT"}' | base64url)
    payload=$(printf '{"iat":%s,"exp":%s,"iss":"%s"}' "$((now-60))" "$((now+540))" "$PRUEFER_APP_ID" | base64url)
    signature=$(printf '%s' "$header.$payload" | "$openssl_cmd" dgst -sha256 \
        -sign <(printf '%s' "$normalized") 2>/dev/null | base64url) || return 1
    jwt=$header.$payload.$signature
}
field() {
    # shortcut: liest nur feste Felder bekannter GitHub-Antworten, bei Formatänderung scheitert es geschlossen
    local text keys value
    export -n text keys value
    text=$(cat); text=${text//$'\n'/}; text=${text//$'\r'/}
    [[ $text =~ ^[[:space:]]*\{.*\}[[:space:]]*$ ]] || return 1
    keys=$(printf '%s' "$text" | grep -oE "\"$1\"[[:space:]]*:")
    [[ -n $keys && $keys != *$'\n'* ]] || return 1
    value=$(printf '%s' "$text" | grep -oE "\"$1\"[[:space:]]*:[[:space:]]*$2[[:space:]]*[,}]" |
        sed -E 's/^[^:]+:[[:space:]]*//; s/[[:space:]]*[,}]$//; s/^"//; s/"$//')
    [[ -n $value && $value != *$'\n'* ]] || return 1
    printf '%s' "$value"
}
quote_json() {
    local value=$1 char code i
    printf '"'
    for ((i=0; i<${#value}; i++)); do
        char=${value:i:1}
        case $char in
            \"|\\) printf '\\%s' "$char" ;;
            *) printf -v code '%d' "'$char"
               if ((code<32)); then printf '\\u%04x' "$code"; else printf '%s' "$char"; fi ;;
        esac
    done
    printf '"'
}
api() {
    local args=()
    if [[ $# == 3 ]]; then args=(--data-binary "$3"); fi
    printf 'Authorization: Bearer %s\n' "$credential" |
        curl --disable --fail --silent --max-time 30 --proto '=https' -H @- \
        -H 'Accept: application/vnd.github+json' -H 'Content-Type: application/json' \
        -H 'X-GitHub-Api-Version: 2022-11-28' -X "$1" "${args[@]}" "https://api.github.com/$2" 2>/dev/null
}
main() {
    local mode=${1:-} sha conclusion title summary name jwt credential installation scope body
    export -n jwt credential
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
    # Die eindeutige Token-URL liefert die ID; die Antwort enthält zusätzlich z. B. account.id.
    installation=$(api GET repos/Cuarroc/ProjectB/installation |
        field access_tokens_url '"https://api[.]github[.]com/app/installations/[0-9]+/access_tokens"')
    installation=${installation#https://api.github.com/app/installations/}; installation=${installation%/access_tokens}
    [[ $installation =~ ^[0-9]+$ ]] || return 1
    credential=$(api POST "app/installations/$installation/access_tokens" | field token '"ghs_[A-Za-z0-9_.-]+"')
    [[ -n $credential && $credential != null && $credential != *$'\n'* ]] || return 1
    # Absichtlich unbeschränkten Installationstoken prüfen: eine zu breite Installation ist ein Fehler.
    scope=$(api GET 'installation/repositories?per_page=100')
    [[ $(printf '%s' "$scope" | field total_count '[0-9]+') == 1 ]] || return 1
    [[ $(printf '%s' "$scope" | field full_name '"Cuarroc/ProjectB"') == Cuarroc/ProjectB ]] || return 1
    if [[ $mode == --test ]]; then
        printf 'Repo-Grenze bestätigt: Cuarroc/ProjectB\n'
        return
    fi
    body=$(printf '{"name":"%s","head_sha":"%s","status":"completed","conclusion":"%s","output":{"title":%s,"summary":%s}}' \
        "$name" "$sha" "$conclusion" "$(quote_json "$title")" "$(quote_json "$summary")")
    api POST repos/Cuarroc/ProjectB/check-runs "$body" >/dev/null
    printf 'Check-Run angelegt: %s\n' "$name"
}
if [[ ${BASH_SOURCE[0]} == "$0" ]]; then main "$@"; fi
