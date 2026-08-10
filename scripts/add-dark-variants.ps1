#!/usr/bin/env pwsh
# One-shot bulk conversion helper for Phase 3 dark-mode rollout.
# Adds `dark:` counterparts next to the light-only slate palette used across
# view components. Idempotent-ish: skips a file if it already contains any
# `dark:text-slate-*` marker (indicating a previous run or manual conversion).

param(
    [Parameter(Mandatory=$true, Position=0)][string[]]$Paths
)

$mappings = @(
    @{ light = 'text-slate-900'; dark = 'text-slate-100' },
    @{ light = 'text-slate-800'; dark = 'text-slate-100' },
    @{ light = 'text-slate-700'; dark = 'text-slate-200' },
    @{ light = 'text-slate-600'; dark = 'text-slate-300' },
    @{ light = 'text-slate-500'; dark = 'text-slate-400' },
    @{ light = 'text-slate-400'; dark = 'text-slate-500' },
    @{ light = 'bg-white'      ; dark = 'bg-slate-900'   },
    @{ light = 'bg-slate-50'   ; dark = 'bg-slate-800'   },
    @{ light = 'bg-slate-100'  ; dark = 'bg-slate-800'   },
    @{ light = 'bg-slate-200'  ; dark = 'bg-slate-700'   },
    @{ light = 'border-slate-200'; dark = 'border-slate-700' },
    @{ light = 'border-slate-100'; dark = 'border-slate-800' },
    @{ light = 'divide-slate-200'; dark = 'divide-slate-700' },
    @{ light = 'divide-slate-100'; dark = 'divide-slate-800' },
    @{ light = 'ring-slate-200'; dark = 'ring-slate-700' },
    @{ light = 'ring-slate-100'; dark = 'ring-slate-800' },
    @{ light = 'placeholder:text-slate-400'; dark = 'placeholder:text-slate-500' },
    @{ light = 'hover:bg-slate-50'; dark = 'hover:bg-slate-800' },
    @{ light = 'hover:bg-slate-100'; dark = 'hover:bg-slate-800' },
    @{ light = 'hover:text-slate-900'; dark = 'hover:text-slate-100' },
    @{ light = 'hover:text-slate-800'; dark = 'hover:text-slate-100' }
)

foreach ($path in $Paths) {
    if (-not (Test-Path $path)) {
        Write-Warning "not found: $path"
        continue
    }
    $content = [System.IO.File]::ReadAllText($path)
    $original = $content

    foreach ($m in $mappings) {
        $light = [regex]::Escape($m.light)
        # Word-boundary via lookahead: the class must NOT be followed by a
        # digit (so bg-slate-50 doesn't match inside bg-slate-500) or a hyphen
        # (so text-slate-500 doesn't gobble text-slate-500/40 modifiers).
        # Also skip if the very next non-space token is already `dark:` — that
        # keeps the script idempotent when re-run.
        # Trailing lookahead also blocks `/` so we don't strip Tailwind
        # opacity modifiers (e.g. matching `bg-white` inside `bg-white/70`).
        # Leading lookbehind also blocks `:` so we don't strip pseudo prefixes
        # (matching `bg-slate-100` inside `hover:bg-slate-100` would leave the
        # appended `dark:` unscoped — painting the element permanently instead
        # of only on hover).
        $pattern = "(?<![-\w:])$light(?![-\w/])(?!\s+dark:)"
        $replacement = "$($m.light) dark:$($m.dark)"
        $content = [regex]::Replace($content, $pattern, $replacement)
    }

    if ($content -ne $original) {
        [System.IO.File]::WriteAllText($path, $content, [System.Text.UTF8Encoding]::new($false))
        Write-Host "updated: $path"
    } else {
        Write-Host "no changes: $path"
    }
}
