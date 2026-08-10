#!/usr/bin/env pwsh
# Repairs the slash-opacity regression from add-dark-variants.ps1.
#
# The initial script matched `bg-white` even when followed by `/70`, then
# appended ` dark:bg-slate-900`, producing `bg-white dark:bg-slate-900/70`.
# That silently stripped the /70 from the light class. Same for slate-*.
#
# This pass rewrites `X dark:Y/N` back into `X/N dark:Y/N` so both modes get
# the intended opacity.

$targets = @(
    'bg-white',
    'bg-slate-50', 'bg-slate-100', 'bg-slate-200'
)
$replacements = @{
    'bg-white'     = 'bg-slate-900'
    'bg-slate-50'  = 'bg-slate-800'
    'bg-slate-100' = 'bg-slate-800'
    'bg-slate-200' = 'bg-slate-700'
}

$files = Get-ChildItem -Path "D:\Projects\WebApp\laboratory-app\laboratory\src" -Recurse -Include *.vue,*.css

$totalFixed = 0
foreach ($file in $files) {
    $content = [System.IO.File]::ReadAllText($file.FullName)
    $original = $content
    $fileFixed = 0

    foreach ($light in $targets) {
        $dark = $replacements[$light]
        $lightEsc = [regex]::Escape($light)
        $darkEsc = [regex]::Escape($dark)
        # Match:  <light> dark:<dark>/<digits>
        # Rewrite to:  <light>/<digits> dark:<dark>/<digits>
        $pattern = "$lightEsc\s+dark:$darkEsc/(\d+)"
        $updated = [regex]::Replace($content, $pattern, {
            param($m)
            $op = $m.Groups[1].Value
            "$light/$op dark:$dark/$op"
        })
        $count = ([regex]::Matches($content, $pattern)).Count
        $fileFixed += $count
        $content = $updated
    }

    if ($content -ne $original) {
        [System.IO.File]::WriteAllText($file.FullName, $content, [System.Text.UTF8Encoding]::new($false))
        Write-Host "fixed $fileFixed in $($file.FullName)"
        $totalFixed += $fileFixed
    }
}
Write-Host "total repairs: $totalFixed"
