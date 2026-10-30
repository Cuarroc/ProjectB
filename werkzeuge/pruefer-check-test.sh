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

# Jedes feste Antwortfeld: gültig, fehlend, doppelt und außerhalb seines Zeichensatzes.
for key in access_tokens_url token total_count full_name; do
    case $key in
        access_tokens_url) value='"https://api.github.com/app/installations/42/access_tokens"'; pattern='"https://api[.]github[.]com/app/installations/[0-9]+/access_tokens"' ;;
        token) value='"installation_token_test"'; pattern='"[A-Za-z0-9_]+"' ;;
        total_count) value=1; pattern='[0-9]+' ;;
        full_name) value='"Cuarroc/ProjectB"'; pattern='"Cuarroc/ProjectB"' ;;
    esac
    [[ $(printf '{\n "%s" : %s\n}' "$key" "$value" | field "$key" "$pattern") == "${value//\"/}" ]]
    for response in '{}' "{\"$key\":$value,\"$key\":$value}" "{\"$key\":\"bad-value\"}"; do
        if output=$(printf '%s' "$response" | field "$key" "$pattern" 2>/dev/null); then exit 1; fi
    done
done
[[ $(quote_json $'A\\"\n\t\001') == '"A\\\"\u000a\u0009\u0001"' ]]

# Externer curl-Stub: prüft argv/Umgebung und speist echte JSON-Formate ohne Netz ein.
curl_stub() {
    local captured_argv auth body='' i environment
    captured_argv=$(printf '%s\n' "$@")
    [[ $captured_argv != *eyJ* && $captured_argv != *installation_token_test* ]] || return 1
    [[ -z ${GH_TOKEN:-}${GITHUB_TOKEN:-}${PRUEFER_APP_KEY:-}${PRUEFER_APP_ID:-}${GH_DEBUG:-} ]] || return 1
    environment=$(env)
    [[ $environment != *eyJ* && $environment != *installation_token_test* ]] || return 1
    [[ $1 == --disable && " $* " == *' -H @- '* ]] || return 1
    auth=$(cat); auth=${auth#Authorization: Bearer }
    for ((i=1; i<=$#; i++)); do
        if [[ ${!i} == --data-binary ]]; then i=$((i+1)); body=${!i}; fi
    done
    case " $* " in
        *' https://api.github.com/repos/Cuarroc/ProjectB/installation '*)
            [[ $auth == eyJ* && " $* " == *' -X GET '* ]] || return 1
            if [[ ${scenario:-} == installation_error ]]; then printf '%s' "$auth" >&2; return 1; fi
            if [[ ${scenario:-} == installation_invalid ]]; then printf 'null\n'; return; fi
            printf '{"id":42,"account":{"id":7},"access_tokens_url":"https://api.github.com/app/installations/42/access_tokens"}' ;;
        *' https://api.github.com/app/installations/42/access_tokens '*)
            [[ $auth == eyJ* && " $* " == *' -X POST '* ]] || return 1
            if [[ ${scenario:-} == token_error ]]; then printf '%s' "$auth" >&2; return 1; fi
            if [[ ${scenario:-} == token_empty ]]; then printf '{"token":null}'; return; fi
            printf '{"token":"installation_token_test"}' ;;
        *' https://api.github.com/installation/repositories?per_page=100 '*)
            [[ $auth == installation_token_test ]] || return 1
            if [[ ${scenario:-} == scope_error ]]; then return 1; fi
            case ${scenario:-} in
                broad) printf '{"total_count":2,"repositories":[{"full_name":"Cuarroc/ProjectB"},{"full_name":"Cuarroc/Fremd"}]}' ;;
                paginated) printf '{"total_count":101,"repositories":[{"full_name":"Cuarroc/ProjectB"}]}' ;;
                empty) printf '{"total_count":0,"repositories":[]}' ;;
                wrong_repo) printf '{"total_count":1,"repositories":[{"full_name":"Cuarroc/Fremd"}]}' ;;
                inconsistent) printf '{"total_count":1,"repositories":[{"full_name":"Cuarroc/ProjectB"},{"full_name":"Cuarroc/ProjectB"}]}' ;;
                *) printf '{"total_count":1,"repositories":[{"id":9,"full_name":"Cuarroc/ProjectB","owner":{"id":7}}]}' ;;
            esac ;;
        *' https://api.github.com/repos/Cuarroc/ProjectB/check-runs '*)
            [[ $auth == installation_token_test && ${scenario:-} != test_only && " $* " == *' -X POST '* ]] || return 1
            [[ $body == *'"status":"completed"'* && $body == *'"title":"Titel \"Zitat\""'* ]] || return 1
            [[ $body == *"\"name\":\"${expected_name:-review/claude}\""* && $body == *"\"head_sha\":\"$sha\""* ]] || return 1
            [[ $body == *"\"conclusion\":\"${expected_conclusion:-success}\""* ]] || return 1
            if [[ ${scenario:-} == check_error ]]; then printf '%s' "$auth" >&2; return 1; fi
            printf '%s' "$auth" ;;
        *) return 1 ;;
    esac
}
mkdir -p ../kern/target
stub_dir=$(mktemp -d "$PWD/../kern/target/pruefer.XXXXXX")
trap 'rm -rf "$stub_dir"' EXIT
{ printf '#!/usr/bin/env bash\nset -Eeuo pipefail\n'; declare -f curl_stub; printf 'curl_stub "$@"\n'; } > "$stub_dir/curl"
chmod +x "$stub_dir/curl"
export PATH="$stub_dir:$PATH"
sha=0123456789012345678901234567890123456789
run() { bash -x ./pruefer-check.sh "$@" 2>&1; }
safe() { [[ $1 != *'PRIVATE KEY'* && $1 != *eyJ* && $1 != *installation_token_test* ]]; }
export GH_DEBUG=api
for probe in eyJ_offline_test installation_token_test; do
    if output=$(PRUEFER_LEAK_PROBE=$probe run --test); then
        printf 'Umgebungsprobe wurde nicht erkannt\n' >&2; exit 1
    fi
    safe "$output"
done
for conclusion in success failure; do
    for name in review/claude review/codex; do
        export expected_name=$name expected_conclusion=$conclusion sha
        output=$(run "$sha" "$conclusion" 'Titel "Zitat"' $'Text\nZeile 2' "$name")
        safe "$output"
        [[ $output == *"Check-Run angelegt: $name"* ]]
    done
done
unset expected_name expected_conclusion
output=$(scenario=test_only run --test)
safe "$output"
[[ $output == *'Repo-Grenze bestätigt'* ]]
for scenario in installation_error installation_invalid token_error token_empty scope_error broad paginated empty wrong_repo inconsistent check_error; do
    export scenario
    if output=$(run "$sha" success 'Titel "Zitat"' Text); then exit 1; fi
    safe "$output"
    if [[ $scenario != check_error ]]; then
        if output=$(run --test); then exit 1; fi
        safe "$output"
    fi
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
