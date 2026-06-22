param(
    [Parameter(Mandatory = $true)]
    [string]$Source,
    [string]$Out = ""
)

$ErrorActionPreference = "Stop"

$scriptRoot = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Path $MyInvocation.MyCommand.Path -Parent }
if (-not $Out) {
    $Out = [System.IO.Path]::GetFullPath((Join-Path $scriptRoot "..\\db\\catalog_rsk.json"))
}

function ToDouble($v) {
    if ($null -eq $v -or $v -eq '') { return 0 }
    return [double]$v
}

function ToIdString($v) {
    if ($null -eq $v) { return "" }
    return $v.ToString()
}

function LoadTable($conn, $sql) {
    $cmd = $conn.CreateCommand()
    $cmd.CommandText = $sql
    $da = New-Object System.Data.OleDb.OleDbDataAdapter($cmd)
    $dt = New-Object System.Data.DataTable
    $null = $da.Fill($dt)
    return $dt
}

if (!(Test-Path -LiteralPath $Source)) {
    throw "Источник не найден: $Source"
}

$outDir = Split-Path -Path $Out -Parent
if (!(Test-Path -LiteralPath $outDir)) {
    New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}

$cs = "Provider=Microsoft.ACE.OLEDB.12.0;Data Source=$Source;Persist Security Info=False"
$conn = New-Object System.Data.OleDb.OleDbConnection($cs)
$conn.Open()

# Units
$units = @{}
$unitRows = LoadTable $conn "SELECT Id, EdIzm, FullEdIzm FROM tSprEdIzm"
foreach ($row in $unitRows.Rows) {
    $id = ToIdString $row.Id
    $unitName = $row.EdIzm
    if (-not $unitName) { $unitName = $row.FullEdIzm }
    $units[$id] = $unitName
}

# Sections
$sections = @()
$sectionMap = @{}
$sectionRows = LoadTable $conn "SELECT IdRazdel, NameRazdel, IdParentRazdel FROM tPriceRazdels"
foreach ($row in $sectionRows.Rows) {
    $id = ToIdString $row.IdRazdel
    $sectionMap[$id] = @{
        id = $id
        name = $row.NameRazdel
        parent_id = if ($row.IdParentRazdel) { ToIdString $row.IdParentRazdel } else { $null }
    }
}

$pathCache = @{}
function GetSectionPath($id) {
    if (-not $id) { return "" }
    if ($pathCache.ContainsKey($id)) { return $pathCache[$id] }
    if (-not $sectionMap.ContainsKey($id)) { return "" }
    $node = $sectionMap[$id]
    if ($node.parent_id) {
        $parentPath = GetSectionPath $node.parent_id
        $path = if ($parentPath) { "$parentPath / $($node.name)" } else { $node.name }
    } else {
        $path = $node.name
    }
    $pathCache[$id] = $path
    return $path
}

foreach ($kv in $sectionMap.GetEnumerator()) {
    $id = $kv.Key
    $node = $kv.Value
    $sections += @{
        id = $node.id
        name = $node.name
        parent_id = $node.parent_id
        path = GetSectionPath $id
    }
}

# Materials
$materials = @()
$materialPriceMap = @{}
$materialRows = LoadTable $conn "SELECT IdMaterial, NameMaterial, EdIzm, PriceFakt, Koeff, PriceEst, IdGroup FROM tSprMaterials"
foreach ($row in $materialRows.Rows) {
    $id = ToIdString $row.IdMaterial
    $unit = $units[(ToIdString $row.EdIzm)]
    $priceFakt = ToDouble $row.PriceFakt
    $materials += @{
        id = $id
        name = $row.NameMaterial
        unit = $unit
        price = $priceFakt
        price_fakt = $priceFakt
        price_est = ToDouble $row.PriceEst
        coeff = ToDouble $row.Koeff
        group_id = if ($row.IdGroup) { ToIdString $row.IdGroup } else { $null }
    }
    $materialPriceMap[$id] = $priceFakt
}

# Work-material links
$workMaterials = @()
$materialsByWork = @{}
$wmRows = LoadTable $conn "SELECT IdPrice, IdMaterial, NormaRashoda, KolFormula, NumPP FROM tMaterialsForPrice"
foreach ($row in $wmRows.Rows) {
    $workId = ToIdString $row.IdPrice
    $matId = ToIdString $row.IdMaterial
    $norm = ToDouble $row.NormaRashoda
    $formula = if ($row.KolFormula) { [string]$row.KolFormula } else { $null }
    $wm = @{
        work_id = $workId
        material_id = $matId
        norm = $norm
        formula = $formula
        sort_order = ToDouble $row.NumPP
    }
    $workMaterials += $wm
    if (-not $materialsByWork.ContainsKey($workId)) { $materialsByWork[$workId] = @() }
    $materialsByWork[$workId] += $wm
}

# Works
$works = @()
$workRows = LoadTable $conn "SELECT IdPrice, IdRazdel, PriceName, EdIzm, PriceFakt, Koeff, PriceEst, Trudozatrats, Razrjad FROM tSprPrices"
foreach ($row in $workRows.Rows) {
    $id = ToIdString $row.IdPrice
    $sectionId = ToIdString $row.IdRazdel
    $unit = $units[(ToIdString $row.EdIzm)]
    $labor = ToDouble $row.PriceFakt
    $materialSum = 0
    if ($materialsByWork.ContainsKey($id)) {
        foreach ($m in $materialsByWork[$id]) {
            $price = 0
            if ($materialPriceMap.ContainsKey($m.material_id)) {
                $price = $materialPriceMap[$m.material_id]
            }
            if ($m.norm -gt 0) {
                $materialSum += $m.norm * $price
            }
        }
    }
    $works += @{
        id = $id
        code = $id
        name = $row.PriceName
        unit = $unit
        labor_price = $labor
        material_price = [double][math]::Round($materialSum, 4)
        category = GetSectionPath $sectionId
        section_id = $sectionId
        price_fakt = $labor
        price_est = ToDouble $row.PriceEst
        coeff = ToDouble $row.Koeff
        trudozatrats = ToDouble $row.Trudozatrats
        razrjad = ToDouble $row.Razrjad
    }
}

$conn.Close()

$catalog = @{
    version = 2
    generated_at = (Get-Date).ToString("yyyy-MM-dd")
    works = $works
    materials = $materials
    work_materials = $workMaterials
    sections = $sections
}

$catalog | ConvertTo-Json -Depth 8 | Out-File -FilePath $Out -Encoding utf8
Write-Host "OK: exported catalog to $Out (works=$($works.Count), materials=$($materials.Count), links=$($workMaterials.Count))"
