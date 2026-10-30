param(
    [Parameter(Mandatory)] [ValidateSet('count', 'compare')] [string] $Mode,
    [string] $Log,
    [string] $Output,
    [string] $Platform,
    [string] $Current,
    [string] $Baseline
)

$ErrorActionPreference = 'Stop'
if ($Mode -eq 'count') {
    $matches = [regex]::Matches((Get-Content -LiteralPath $Log -Raw), '(?m)^(?:\S+Z )?test result: .*?\b(\d+) passed; \d+ failed; (\d+) ignored;')
    if ($matches.Count -eq 0) { throw 'Keine cargo-Testresultate gefunden' }
    $passed = 0
    $ignored = 0
    foreach ($match in $matches) {
        $passed += [int] $match.Groups[1].Value
        $ignored += [int] $match.Groups[2].Value
    }
    @{ passed = $passed; ignored = $ignored } | ConvertTo-Json -Compress | Set-Content -LiteralPath $Output -Encoding utf8
    "### $Platform`: $passed bestanden, $ignored ignoriert" | Add-Content -LiteralPath $env:GITHUB_STEP_SUMMARY
    exit 0
}

function Read-Count([string] $Directory, [string] $Platform) {
    $value = Get-Content -LiteralPath (Join-Path $Directory "$Platform/testzahl.json") -Raw | ConvertFrom-Json
    foreach ($name in @('passed', 'ignored')) {
        if (($value.$name -isnot [long] -and $value.$name -isnot [int]) -or $value.$name -lt 0) {
            throw "Ungültige Testzahl: $Directory/$Platform/$name"
        }
    }
    return $value
}

$ubuntu = Read-Count $Current 'ubuntu'
$windows = Read-Count $Current 'windows'
$line = "testzahl ubuntu=$($ubuntu.passed) windows=$($windows.passed)"
$summary = @('### Testzahlen', $line, "Ignoriert: Ubuntu $($ubuntu.ignored), Windows $($windows.ignored)")
$decreased = $false
if (Test-Path -LiteralPath $Baseline) {
    foreach ($platform in @('ubuntu', 'windows')) {
        $now = Read-Count $Current $platform
        $before = Read-Count $Baseline $platform
        $summary += "$platform`: $($now.passed) bestanden (main: $($before.passed)); ignoriert: $($now.ignored) (main: $($before.ignored))"
        if ($now.passed -lt $before.passed) { $decreased = $true }
    }
} elseif ($env:EVENT_NAME -eq 'pull_request') {
    throw 'Kein Vergleichswert für main verfügbar'
}
$summary | Tee-Object -FilePath $env:GITHUB_STEP_SUMMARY -Append
if ($decreased -and $env:PR_BODY -notmatch '(?m)^Tests weniger:[ \t]*\S[^\r\n]*\r?$') {
    Write-Error 'Testzahl gesunken: Im PR fehlt eine Zeile Tests weniger: <Grund>.'
}
