[CmdletBinding()]
param(
    [string]$ProjectRoot = 'C:\Users\T14 G2\aurasync-desktop',
    [string]$CommitMessage = 'Fix TypeScript build errors for Vercel deployment'
)

$ErrorActionPreference = 'Stop'
$filesToCommit = @(
    'src/core/algorithms/PlaylistSearchEngine.ts',
    'src/core/audio/AudioEngine.ts',
    'tailwind.config.ts'
)

function Invoke-Git {
    param([Parameter(Mandatory = $true)][string[]]$GitArgs)
    & git @GitArgs
    if ($LASTEXITCODE -ne 0) {
        throw "Git command failed: git $($GitArgs -join ' ') (exit code $LASTEXITCODE)."
    }
}

try {
    if (-not (Test-Path -LiteralPath $ProjectRoot -PathType Container)) {
        throw "Project folder not found: $ProjectRoot`nPass the correct folder with: .\Commit-AuraSync-Vercel.ps1 -ProjectRoot 'C:\path\to\aurasync-desktop'"
    }

    Push-Location -LiteralPath $ProjectRoot
    try {
        if (-not (Test-Path -LiteralPath 'package.json' -PathType Leaf)) {
            throw "package.json was not found in $ProjectRoot. Make sure this is the project root."
        }

        & git rev-parse --is-inside-work-tree *> $null
        if ($LASTEXITCODE -ne 0) {
            throw 'This folder is not inside a Git repository.'
        }

        $branch = (& git branch --show-current).Trim()
        if (-not $branch) {
            throw 'Git is in detached-HEAD state. Check out a branch before committing.'
        }

        $remoteUrl = (& git remote get-url origin 2>$null)
        if ($LASTEXITCODE -ne 0 -or -not $remoteUrl) {
            throw "No Git remote named 'origin' is configured. Add your GitHub/Git remote first with: git remote add origin <repository-url>"
        }

        Write-Host ''
        Write-Host 'AuraSync Git commit + Vercel push' -ForegroundColor Cyan
        Write-Host "Project: $ProjectRoot"
        Write-Host "Branch:  $branch"
        Write-Host "Origin:  $remoteUrl"
        Write-Host ''
        Write-Host 'Current working-tree status:' -ForegroundColor Cyan
        Invoke-Git -GitArgs @('status', '--short')

        # Do not accidentally include files the user already staged manually.
        & git diff --cached --quiet
        if ($LASTEXITCODE -eq 1) {
            throw 'There are already staged changes. Commit or unstage them first, then rerun this helper so it does not mix unrelated changes into the commit.'
        }
        elseif ($LASTEXITCODE -ne 0) {
            throw 'Could not inspect the Git staging area.'
        }

        foreach ($file in $filesToCommit) {
            if (-not (Test-Path -LiteralPath $file -PathType Leaf)) {
                throw "Expected source file not found: $file"
            }
        }

        # Only stage the three build-fix files; backup files and unrelated work stay untouched.
        Invoke-Git -GitArgs (@('add', '--') + $filesToCommit)

        & git diff --cached --quiet
        if ($LASTEXITCODE -eq 1) {
            Write-Host ''
            Write-Host 'Staged changes to commit:' -ForegroundColor Cyan
            Invoke-Git -GitArgs @('diff', '--cached', '--stat')
            Write-Host ''
            $answer = Read-Host "Create commit on '$branch' and push to origin? (y/N)"
            if ($answer -notmatch '^(y|yes)$') {
                Write-Host 'Cancelled. The three build-fix files remain staged; no commit or push was made.' -ForegroundColor Yellow
                exit 0
            }

            Invoke-Git -GitArgs @('commit', '-m', $CommitMessage)
        }
        elseif ($LASTEXITCODE -eq 0) {
            Write-Host 'No new changes in the three build-fix files to commit.' -ForegroundColor Yellow
            $answer = Read-Host "Push current branch '$branch' to origin anyway? (y/N)"
            if ($answer -notmatch '^(y|yes)$') {
                Write-Host 'Cancelled. Nothing was committed or pushed.' -ForegroundColor Yellow
                exit 0
            }
        }
        else {
            throw 'Could not inspect staged build-fix changes.'
        }

        Invoke-Git -GitArgs @('push', '-u', 'origin', $branch)

        Write-Host ''
        Write-Host 'Push completed successfully.' -ForegroundColor Green
        Write-Host 'If this repository is connected to Vercel, the push should trigger a deployment.' -ForegroundColor Green
        Write-Host 'A non-production branch usually creates a Preview Deployment; the configured production branch creates a Production Deployment.' -ForegroundColor Yellow
        Write-Host 'Check the deployment status in your Vercel project dashboard.'
        Write-Host ''
        Write-Host 'Backup files were not staged by this script.'
    }
    finally {
        Pop-Location
    }
}
catch {
    Write-Host ''
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
