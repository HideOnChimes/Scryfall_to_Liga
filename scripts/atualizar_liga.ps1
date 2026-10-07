# Atualiza os dados da LigaMagic a partir deste PC e publica no GitHub.
#
# A LigaMagic (Cloudflare) responde HTTP 403 para os runners do GitHub Actions,
# entao o scraping roda aqui: baixa as edicoes, commita docs/data e faz push.
# O push dispara o workflow do Pages, que so publica o site.
#
# Uso:
#   powershell -ExecutionPolicy Bypass -File scripts\atualizar_liga.ps1              # execucao normal
#   powershell -ExecutionPolicy Bypass -File scripts\atualizar_liga.ps1 -Only "hob tla"
#   powershell -ExecutionPolicy Bypass -File scripts\atualizar_liga.ps1 -Max 0 -NoPush  # so testa (lista de edicoes)
#   powershell -ExecutionPolicy Bypass -File scripts\atualizar_liga.ps1 -Instalar    # agenda a cada 6h (Agendador de Tarefas)
#
# Log em scripts\atualizar_liga.log.

param(
    [int]$Max = 55,          # maximo de edicoes por execucao (crawl-delay de 6 min: 55 edicoes ~ 5h30)
    [double]$Minutes = 330,  # para antes de passar desse tempo
    [string]$Only = "",      # siglas separadas por espaco, opcional
    [switch]$NoPush,         # commita mas nao faz push
    [switch]$Instalar        # registra a tarefa agendada e sai
)

$ErrorActionPreference = "Continue"
$repo = Split-Path -Parent $PSScriptRoot
$script = $MyInvocation.MyCommand.Path
$log = Join-Path $PSScriptRoot "atualizar_liga.log"

function Log($m) {
    $line = "{0:yyyy-MM-dd HH:mm:ss} {1}" -f (Get-Date), $m
    Write-Host $line
    Add-Content -Path $log -Value $line -Encoding utf8
}

if ($Instalar) {
    $nome = "Conversor Liga - atualizar dados"
    $acao = New-ScheduledTaskAction -Execute "powershell.exe" `
        -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`""
    $gatilho = New-ScheduledTaskTrigger -Once -At (Get-Date).Date.AddMinutes(17) `
        -RepetitionInterval (New-TimeSpan -Hours 6) -RepetitionDuration ([TimeSpan]::MaxValue)
    $cfg = New-ScheduledTaskSettingsSet -StartWhenAvailable -RunOnlyIfNetworkAvailable `
        -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew `
        -ExecutionTimeLimit (New-TimeSpan -Hours 6)
    Register-ScheduledTask -TaskName $nome -Action $acao -Trigger $gatilho -Settings $cfg -Force | Out-Null
    Write-Host "Tarefa '$nome' registrada: roda a cada 6h (00:17, 06:17, 12:17, 18:17) com o PC ligado."
    Write-Host "Para rodar agora: Start-ScheduledTask -TaskName '$nome'"
    exit 0
}

Set-Location $repo
$env:PYTHONIOENCODING = "utf-8"
Log "inicio (max=$Max, minutes=$Minutes, only='$Only')"

git pull --rebase --quiet
if ($LASTEXITCODE -ne 0) { Log "git pull falhou"; exit 1 }

$pyArgs = @("-u", "scripts\build_data.py", "--max", $Max, "--minutes", $Minutes)
if ($Only) { $pyArgs += "--only"; $pyArgs += $Only.Split(" ") }
& python @pyArgs 2>&1 | ForEach-Object { Log $_ }
if ($LASTEXITCODE -ne 0) { Log "build_data.py falhou (exit $LASTEXITCODE)"; exit 1 }

git add docs/data
git diff --cached --quiet
if ($LASTEXITCODE -eq 0) { Log "nada mudou"; exit 0 }
git commit --quiet -m "dados: atualiza edicoes da Liga"
if ($NoPush) { Log "commit feito, push pulado (-NoPush)"; exit 0 }
git push --quiet
if ($LASTEXITCODE -ne 0) { Log "git push falhou"; exit 1 }
Log "publicado"
