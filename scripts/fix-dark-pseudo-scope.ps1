#!/usr/bin/env pwsh
# Repairs the pseudo-class scope regression from add-dark-variants.ps1.
#
# The initial script naively matched `hover:bg-slate-100` and appended
# `dark:bg-slate-800`, producing:
#   hover:bg-slate-100 dark:bg-slate-800
# but the `dark:` variant does NOT inherit the `hover:` scope, so the element
# gets a permanent slate-800 background in dark mode instead of only on hover.
#
# This pass rewrites any `<pseudo>:X dark:Y` into `<pseudo>:X dark:<pseudo>:Y`
# when Y is a slate palette class we generated. Covers hover, focus, active,
# group-hover, focus-visible, focus-within, disabled.

$pseudos = @('hover','focus','active','group-hover','focus-visible','focus-within','disabled')
# Utility prefixes we generated dark variants for. Kept narrow to avoid
# touching hand-authored classes.
$utilities = @('bg-slate','text-slate','ring-slate','border-slate','divide-slate','placeholder:text-slate','hover:bg-slate','hover:text-slate')

$files = Get-ChildItem -Path "D:\Projects\WebApp\laboratory-app\laboratory\src" -Recurse -Include *.vue,*.css

$totalFixed = 0
foreach ($file in $files) {
    $content = [System.IO.File]::ReadAllText($file.FullName)
    $original = $content

    foreach ($p in $pseudos) {
        # Match: `<pseudo>:<util>-<num>[modifier]  dark:<util>-<num>[modifier]`
        # where the two utility base names (bg-slate, text-slate, ...) match.
        # Rewrite the dark side to `dark:<pseudo>:<util>-<num>[modifier]`.
        $pattern = "(?<lead>${p}:(?<util>(?:bg|text|ring|border|divide)-slate)-(?<lightN>\d+)(?<lightMod>(?:/\d+)?))\s+dark:(?<darkUtil>(?:bg|text|ring|border|divide)-slate)-(?<darkN>\d+)(?<darkMod>(?:/\d+)?)"
        $updated = [regex]::Replace($content, $pattern, {
            param($m)
            # Only rewrite if the two utility families match (e.g. bg-slate ↔ bg-slate).
            if ($m.Groups['util'].Value -ne $m.Groups['darkUtil'].Value) {
                return $m.Value
            }
            $lead = $m.Groups['lead'].Value
            $darkUtil = $m.Groups['darkUtil'].Value
            $darkN = $m.Groups['darkN'].Value
            $darkMod = $m.Groups['darkMod'].Value
            "$lead dark:${p}:${darkUtil}-${darkN}${darkMod}"
        })
        $totalFixed += ([regex]::Matches($content, $pattern) |
            Where-Object { $_.Groups['util'].Value -eq $_.Groups['darkUtil'].Value }).Count
        $content = $updated
    }

    if ($content -ne $original) {
        [System.IO.File]::WriteAllText($file.FullName, $content, [System.Text.UTF8Encoding]::new($false))
        Write-Host "fixed  $($file.FullName)"
    }
}
Write-Host "total repairs: $totalFixed"
