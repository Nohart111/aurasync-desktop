[CmdletBinding()]
param(
    [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'

function Update-SourceFile {
    param(
        [Parameter(Mandatory = $true)][string]$RelativePath,
        [Parameter(Mandatory = $true)][string]$OldPattern,
        [Parameter(Mandatory = $true)][string]$NewText,
        [Parameter(Mandatory = $true)][string]$FixedPattern,
        [Parameter(Mandatory = $true)][string]$Description
    )

    $path = Join-Path (Get-Location).Path $RelativePath
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "File not found: $RelativePath. Run this script from your project root."
    }

    $content = [System.IO.File]::ReadAllText($path)

    if ([regex]::IsMatch($content, $FixedPattern)) {
        Write-Host "Already fixed: $RelativePath ($Description)" -ForegroundColor DarkGray
        return
    }

    $matches = [regex]::Matches($content, $OldPattern)
    if ($matches.Count -ne 1) {
        throw "Expected exactly one match for '$Description' in '$RelativePath', but found $($matches.Count). No change was made to this file. Check the source and update the script pattern if the code differs."
    }

    $regex = [regex]::new($OldPattern)
    $updated = $regex.Replace($content, [System.Text.RegularExpressions.MatchEvaluator]{
        param($m)
        $indent = $m.Groups['indent'].Value
        return $NewText.Replace('__INDENT__', $indent)
    }, 1)

    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $backupPath = "$path.bak-$stamp"
    Copy-Item -LiteralPath $path -Destination $backupPath
    [System.IO.File]::WriteAllText($path, $updated, [System.Text.UTF8Encoding]::new($false))

    Write-Host "Patched: $RelativePath ($Description)" -ForegroundColor Green
    Write-Host "  Backup: $backupPath" -ForegroundColor DarkGray
}

Write-Host "AuraSync build-fix helper" -ForegroundColor Cyan
Write-Host "Project root: $((Get-Location).Path)"

if (-not (Test-Path -LiteralPath (Join-Path (Get-Location).Path 'package.json'))) {
    throw "package.json was not found. Open PowerShell in the project root (the folder containing package.json) and run this script again."
}

# 1) Ensure TypeScript knows the playlist IDs are strings.
Update-SourceFile `
    -RelativePath 'src/core/algorithms/PlaylistSearchEngine.ts' `
    -OldPattern '(?m)^(?<indent>[ \t]*)matchedIds\s*=\s*new Set\(\s*\[\.\.\.matchedIds\]\.filter\(\(id\)\s*=>\s*currentTokenIds\.has\(id\)\)\s*\);' `
    -NewText "__INDENT__matchedIds = new Set<string>(`r`n__INDENT__  [...matchedIds].filter((id: string) => currentTokenIds.has(id))`r`n__INDENT__);" `
    -FixedPattern 'matchedIds\s*=\s*new Set<string>\(\s*\[\.\.\.matchedIds\]\.filter\(\(id:\s*string\)\s*=>\s*currentTokenIds\.has\(id\)\)\s*\);' `
    -Description 'playlist ID Set typing'

# 2) Use an ArrayBuffer-backed Uint8Array for frequency data.
Update-SourceFile `
    -RelativePath 'src/core/audio/AudioEngine.ts' `
    -OldPattern 'private\s+frequencyData:\s*Uint8Array\s*=\s*new Uint8Array\(64\);' `
    -NewText 'private frequencyData: Uint8Array<ArrayBuffer> = new Uint8Array(64);' `
    -FixedPattern 'private\s+frequencyData:\s*Uint8Array<ArrayBuffer>\s*=\s*new Uint8Array\(64\);' `
    -Description 'AudioEngine typed-array buffer'

# 3) Use Tailwind's supported class-based dark-mode configuration.
Update-SourceFile `
    -RelativePath 'tailwind.config.ts' `
    -OldPattern 'darkMode\s*:\s*\[\s*["'']class["'']\s*\]\s*,' `
    -NewText 'darkMode: "class",' `
    -FixedPattern 'darkMode\s*:\s*["'']class["'']\s*,' `
    -Description 'Tailwind darkMode setting'

Write-Host "`nSource patches completed. Running TypeScript check..." -ForegroundColor Cyan
& npx tsc --noEmit
$tscExit = $LASTEXITCODE
if ($tscExit -ne 0) {
    Write-Host "`nTypeScript check failed (exit code $tscExit). Fix the reported errors before building." -ForegroundColor Red
    exit $tscExit
}

Write-Host "TypeScript check passed." -ForegroundColor Green

if ($SkipBuild) {
    Write-Host "Build skipped because -SkipBuild was specified." -ForegroundColor Yellow
    exit 0
}

Write-Host "`nRunning production build..." -ForegroundColor Cyan
& npm run build
$buildExit = $LASTEXITCODE
if ($buildExit -ne 0) {
    Write-Host "`nProduction build failed (exit code $buildExit). See the output above for remaining errors." -ForegroundColor Red
    exit $buildExit
}

Write-Host "`nSuccess: TypeScript check and production build passed." -ForegroundColor Green
exit 0
