param(
    [Parameter(Mandatory = $true)]
    [string]$BackupDirectory,

    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-z0-9]{20}$')]
    [string]$TargetProjectRef,

    [string]$SourceProjectRef = "wzxsjxdbxonrmlmzufpv"
)

$ErrorActionPreference = "Stop"

if ($TargetProjectRef -eq $SourceProjectRef) {
    throw "A restauração no projeto de origem/produção é proibida. Use um projeto temporário e vazio."
}

$repositoryRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$backupRoot = [IO.Path]::GetFullPath((Join-Path $repositoryRoot "backups"))
$resolvedBackup = [IO.Path]::GetFullPath((Join-Path $repositoryRoot $BackupDirectory))
$backupPrefix = $backupRoot.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar

if (-not $resolvedBackup.StartsWith($backupPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw "O backup deve estar dentro do diretório backups/ do repositório."
}

$requiredFiles = @("roles.sql", "schema.sql", "data.sql")
foreach ($fileName in $requiredFiles) {
    $filePath = Join-Path $resolvedBackup $fileName
    if (-not (Test-Path -LiteralPath $filePath -PathType Leaf)) {
        throw "Backup incompleto: $fileName não foi encontrado."
    }
    if ((Get-Item -LiteralPath $filePath).Length -eq 0) {
        throw "Backup inválido: $fileName está vazio."
    }
}

$targetHost = [Environment]::GetEnvironmentVariable("SUPABASE_RESTORE_DB_HOST")
$targetPort = [Environment]::GetEnvironmentVariable("SUPABASE_RESTORE_DB_PORT")
$targetPassword = [Environment]::GetEnvironmentVariable("SUPABASE_RESTORE_DB_PASSWORD")
$confirmation = [Environment]::GetEnvironmentVariable("SUPABASE_RESTORE_CONFIRM")
$targetUser = "postgres.$TargetProjectRef"

if ([string]::IsNullOrWhiteSpace($targetHost) -or [string]::IsNullOrWhiteSpace($targetPassword)) {
    throw "Defina SUPABASE_RESTORE_DB_HOST e SUPABASE_RESTORE_DB_PASSWORD somente no ambiente."
}
if ([string]::IsNullOrWhiteSpace($targetPort)) { $targetPort = "5432" }
if ($targetPort -notmatch '^\d{2,5}$') { throw "SUPABASE_RESTORE_DB_PORT inválida." }
if ($targetHost -notmatch '\.supabase\.(com|co)$') {
    throw "O destino deve ser um host oficial do Supabase."
}
if ($confirmation -cne "RESTORE:$TargetProjectRef") {
    throw "Defina SUPABASE_RESTORE_CONFIRM=RESTORE:$TargetProjectRef para confirmar o destino temporário."
}

$psql = Get-Command psql -ErrorAction SilentlyContinue
if (-not $psql) {
    throw "psql não foi encontrado. Instale o cliente PostgreSQL atual antes da restauração."
}

$previousPassword = [Environment]::GetEnvironmentVariable("PGPASSWORD")
try {
    [Environment]::SetEnvironmentVariable("PGPASSWORD", $targetPassword)
    $connectionArguments = @(
        "--host", $targetHost,
        "--port", $targetPort,
        "--username", $targetUser,
        "--dbname", "postgres"
    )

    & $psql.Source @connectionArguments `
        "--single-transaction" `
        "--variable", "ON_ERROR_STOP=1" `
        "--file", (Join-Path $resolvedBackup "roles.sql") `
        "--file", (Join-Path $resolvedBackup "schema.sql") `
        "--command", "SET session_replication_role = replica" `
        "--file", (Join-Path $resolvedBackup "data.sql")
    if ($LASTEXITCODE -ne 0) {
        throw "A restauração falhou e a transação foi revertida."
    }

    & $psql.Source @connectionArguments `
        "--variable", "ON_ERROR_STOP=1" `
        "--tuples-only" `
        "--command", "select 'migrations=' || count(*) from supabase_migrations.schema_migrations; select 'public_tables=' || count(*) from pg_tables where schemaname = 'public';"
    if ($LASTEXITCODE -ne 0) {
        throw "A restauração terminou, mas os smoke tests falharam. Preserve o projeto temporário para diagnóstico."
    }
}
finally {
    [Environment]::SetEnvironmentVariable("PGPASSWORD", $previousPassword)
}

Write-Host "Restauração e smoke tests concluídos no projeto temporário $TargetProjectRef."
