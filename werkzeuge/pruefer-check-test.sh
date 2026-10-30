#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")"
source ./pruefer-check.sh
trap 'printf "Offline-Test fehlgeschlagen: Zeile %s\n" "$LINENO" >&2' ERR
# Nur ein Wegwerf-Schlüssel im Prozessspeicher; niemals echte Zugangsdaten im Test.
export PRUEFER_APP_KEY
PRUEFER_APP_KEY=$("$openssl_cmd" genrsa 2048 2>/dev/null)
export PRUEFER_APP_ID=12345
build_jwt
IFS=. read -r header payload signature <<< "$jwt"
decode() {
    local value=$1
    while (( ${#value} % 4 )); do value+='='; done
    printf '%s' "$value" | tr '_-' '/+'
}
[[ $(decode "$header" | "$openssl_cmd" base64 -d -A) == '{"alg":"RS256","typ":"JWT"}' ]]
claims=$(decode "$payload" | "$openssl_cmd" base64 -d -A)
claims_pattern='^\{"iat":([0-9]+),"exp":([0-9]+),"iss":"12345"\}$'
[[ $claims =~ $claims_pattern ]]
iat=${BASH_REMATCH[1]} exp=${BASH_REMATCH[2]} now=$(date +%s)
(( now-iat >= 60 && now-iat <= 70 && exp-iat == 600 ))
printf '%s' "$header.$payload" | "$openssl_cmd" dgst -sha256 \
    -verify <(printf '%s' "$PRUEFER_APP_KEY" | "$openssl_cmd" pkey -pubout 2>/dev/null) \
    -signature <(decode "$signature" | "$openssl_cmd" base64 -d -A) >/dev/null
if printf '%s' "$header.${payload}x" | "$openssl_cmd" dgst -sha256 \
    -verify <(printf '%s' "$PRUEFER_APP_KEY" | "$openssl_cmd" pkey -pubout 2>/dev/null) \
    -signature <(decode "$signature" | "$openssl_cmd" base64 -d -A) >/dev/null 2>&1; then exit 1; fi

# gh wird ersetzt, um HTTP-Fehler und Antworten offline einzuspeisen; kein Netz in CI.
gh() {
    [[ -z ${GH_DEBUG:-} && $1 == api && $2 == --hostname && $3 == github.com ]] || return 1
    [[ $5 == "Authorization: Bearer $GH_TOKEN" ]] || return 1
    case " $* " in
        *' repos/Cuarroc/ProjectB/installation '*)
            [[ $GH_TOKEN == eyJ* ]] || return 1
            if [[ ${scenario:-} == installation_error ]]; then printf '%s' "$GH_TOKEN" >&2; return 1; fi
            printf '42\n' ;;
        *' app/installations/42/access_tokens '*)
            if [[ ${scenario:-} == token_error ]]; then printf '%s' "$GH_TOKEN" >&2; return 1; fi
            printf 'installation-token-test\n' ;;
        *' installation/repositories?per_page=100 '*)
            [[ $GH_TOKEN == installation-token-test ]] || return 1
            [[ " $* " == *'.total_count == 1 and (.repositories | length) == 1 and .repositories[0].full_name == "Cuarroc/ProjectB"'* ]] || return 1
            if [[ ${scenario:-} == scope_error ]]; then return 1; fi
            if [[ ${scenario:-} == broad ]]; then printf 'false\n'; else printf 'true\n'; fi ;;
        *' repos/Cuarroc/ProjectB/check-runs '*)
            [[ $GH_TOKEN == installation-token-test && ${scenario:-} != test_only ]] || return 1
            [[ " $* " == *'status=completed'* && " $* " == *'output[title]=Titel "Zitat"'* ]] || return 1
            if [[ ${scenario:-} == check_error ]]; then printf '%s' "$GH_TOKEN" >&2; return 1; fi
            printf '%s' "$GH_TOKEN" ;;
        *) return 1 ;;
    esac
}
export -f gh
sha=0123456789012345678901234567890123456789
run() { bash -x ./pruefer-check.sh "$@" 2>&1; }
safe() { [[ $1 != *'PRIVATE KEY'* && $1 != *eyJ* && $1 != *installation-token-test* ]]; }
export GH_DEBUG=api
for conclusion in success failure; do
    for name in review/claude review/codex; do
        output=$(run "$sha" "$conclusion" 'Titel "Zitat"' $'Text\nZeile 2' "$name")
        safe "$output"
        [[ $output == *"Check-Run angelegt: $name"* ]]
    done
done
output=$(scenario=test_only run --test)
safe "$output"
[[ $output == *'Repo-Grenze bestätigt'* ]]
for scenario in installation_error token_error scope_error broad check_error; do
    export scenario
    if output=$(run "$sha" success 'Titel "Zitat"' Text); then exit 1; fi
    safe "$output"
done
unset scenario
for args in missing invalid_sha invalid_conclusion invalid_name empty_title; do
    case $args in
        missing) set -- ;;
        invalid_sha) set -- nope success Titel Text ;;
        invalid_conclusion) set -- "$sha" neutral Titel Text ;;
        invalid_name) set -- "$sha" success Titel Text other ;;
        empty_title) set -- "$sha" success '' Text ;;
    esac
    if output=$(run "$@"); then exit 1; fi
    safe "$output"
done
for invalid in missing_key invalid_key invalid_id; do
    (
        case $invalid in
            missing_key) unset PRUEFER_APP_KEY ;;
            invalid_key) PRUEFER_APP_KEY=kaputt ;;
            invalid_id) PRUEFER_APP_ID=kaputt ;;
        esac
        if output=$(run --test); then exit 1; fi
        safe "$output"
    )
done
printf 'Prüfer-Check: Offline-Tests erfolgreich\n'
