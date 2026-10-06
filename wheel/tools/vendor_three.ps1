$ErrorActionPreference = 'Stop'
$gameRoot = Split-Path -Parent $PSScriptRoot
$packageRoot = Join-Path $gameRoot 'node_modules\.pnpm\three@0.180.0\node_modules\three'
if (-not (Test-Path -LiteralPath $packageRoot)) { $packageRoot = Join-Path $gameRoot 'node_modules\three' }
$vendorRoot = Join-Path $gameRoot 'vendor'
New-Item -ItemType Directory -Path $vendorRoot -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $packageRoot 'build\three.module.js') -Destination $vendorRoot
Copy-Item -LiteralPath (Join-Path $packageRoot 'build\three.core.js') -Destination $vendorRoot
Copy-Item -LiteralPath (Join-Path $packageRoot 'LICENSE') -Destination (Join-Path $vendorRoot 'THREE-LICENSE.txt')
$addonRoot = Join-Path $vendorRoot 'addons'
foreach ($folder in @('loaders','controls','utils','objects')) {
    $target = Join-Path $addonRoot $folder
    New-Item -ItemType Directory -Path $target -Force | Out-Null
}
foreach ($file in @('loaders\GLTFLoader.js','controls\OrbitControls.js','utils\BufferGeometryUtils.js','objects\Reflector.js')) {
    Copy-Item -LiteralPath (Join-Path $packageRoot "examples\jsm\$file") -Destination (Join-Path $addonRoot $file)
}
Write-Output 'Vendored Three.js and GLTFLoader for static, CDN-independent hosting.'
