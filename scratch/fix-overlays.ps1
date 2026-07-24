$files = Get-ChildItem -Path "c:\Users\Q-CONSULTING\Documents\saas\PlaygroundSpot\src" -Recurse -Include "*.jsx"
foreach ($f in $files) {
    $content = Get-Content $f.FullName -Raw
    $newContent = $content -replace 'fixed inset-0 top-0 left-0 w-screen h-\[100dvh\] min-h-screen', 'fixed inset-0'
    if ($content -ne $newContent) {
        Set-Content -Path $f.FullName -Value $newContent -NoNewline
        Write-Output "Fixed: $($f.Name)"
    }
}
