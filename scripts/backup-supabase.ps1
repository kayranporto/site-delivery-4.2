param(
    [string]$ProjectRef = "wzxsjxdbxonrmlmzufpv",
    [string]$OutputDirectory = "backups"
)

$ErrorActionPreference = "Stop"

$databasePassword = [Environment]::GetEnvironmentVariable("SUPABASE_DB_PASSWORD")
if ([string]::IsNullOrWhiteSpace($databasePassword)) {
    throw "Defina SUPABASE_DB_PASSWORD no ambiente antes de executar o backup."
}

$repositoryRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$backupRoot = [IO.Path]::GetFullPath((Join-Path $repositoryRoot $OutputDirectory))
if (-not $backupRoot.StartsWith($repositoryRoot, [StringComparison]::OrdinalIgnoreCase)) {
    throw "O diretório de backup deve permanecer dentro do repositório."
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$destination = Join-Path $backupRoot $timestamp
New-Item -ItemType Directory -Path $destination -Force | Out-Null

function Invoke-SupabaseDump {
    param([string[]]$Arguments)

    & npx --yes "supabase@2.115.0" db dump --project-ref $ProjectRef --password $databasePassword @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "O Supabase CLI não concluiu uma das etapas do backup."
    }
}

Invoke-SupabaseDump -Arguments @("--role-only", "--file", (Join-Path $destination "roles.sql"))
Invoke-SupabaseDump -Arguments @("--file", (Join-Path $destination "schema.sql"))
Invoke-SupabaseDump -Arguments @(
    "--data-only",
    "--use-copy",
    "--exclude", "storage.buckets_vectors",
    "--exclude", "storage.vector_indexes",
    "--file", (Join-Path $destination "data.sql")
)

$files = Get-ChildItem -LiteralPath $destination -File
if ($files.Count -ne 3 -or ($files | Where-Object Length -eq 0)) {
    throw "O conjunto de backup está incompleto ou contém arquivo vazio."
}

Write-Host "Backup lógico criado em $destination"
Write-Host "Arquivos: roles.sql, schema.sql e data.sql"
