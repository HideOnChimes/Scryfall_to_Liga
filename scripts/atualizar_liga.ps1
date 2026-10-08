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
    # sem -RepetitionDuration = repete para sempre (Windows 10/11)
    $gatilho = New-ScheduledTaskTrigger -Once -At (Get-Date).Date.AddMinutes(17) `
        -RepetitionInterval (New-TimeSpan -Hours 6)
    $cfg = New-ScheduledTaskSettingsSet -StartWhenAvailable -RunOnlyIfNetworkAvailable `
        -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew `
        -ExecutionTimeLimit (New-TimeSpan -Hours 6)
    try {
        Register-ScheduledTask -TaskName $nome -Action $acao -Trigger $gatilho -Settings $cfg -Force -ErrorAction Stop | Out-Null
    } catch {
        Write-Host "Falha ao registrar a tarefa: $_"
        exit 1
    }
    Write-Host "Tarefa '$nome' registrada: roda a cada 6h (00:17, 06:17, 12:17, 18:17) com o PC ligado."
    Write-Host "Para rodar agora: Start-ScheduledTask -TaskName '$nome'"
    exit 0
}

Set-Location $repo
$env:PYTHONIOENCODING = "utf-8"
# nunca abrir janela pedindo senha: a tarefa roda escondida e ficaria travada ate o limite de 6h
$env:GIT_TERMINAL_PROMPT = "0"
$env:GCM_INTERACTIVE = "never"

function Push-Dados {
    # 3 tentativas; se nao der, o commit fica local e sobe na proxima execucao
    for ($i = 1; $i -le 3; $i++) {
        git push --quiet 2>&1 | ForEach-Object { Log "  git push: $_" }
        if ($LASTEXITCODE -eq 0) { return $true }
        Log "git push falhou (tentativa $i)"
        if ($i -lt 3) { Start-Sleep -Seconds 60 }
    }
    return $false
}

Log "inicio (max=$Max, minutes=$Minutes, only='$Only')"

git pull --rebase --quiet 2>&1 | ForEach-Object { Log "  git pull: $_" }
if ($LASTEXITCODE -ne 0) { Log "git pull falhou"; exit 1 }

# commit de uma execucao anterior que nao conseguiu subir? publica logo, antes das 5h de scraping
git rev-list --count "@{u}..HEAD" 2>$null | ForEach-Object { $pendentes = [int]$_ }
if (-not $NoPush -and $pendentes -gt 0) {
    Log "$pendentes commit(s) pendente(s) de execucao anterior, publicando"
    if (Push-Dados) { Log "publicado (pendente)" }
}

$pyArgs = @("-u", "scripts\build_data.py", "--max", $Max, "--minutes", $Minutes)
if ($Only) { $pyArgs += "--only"; $pyArgs += $Only.Split(" ") }
& python @pyArgs 2>&1 | ForEach-Object { Log $_ }
if ($LASTEXITCODE -ne 0) { Log "build_data.py falhou (exit $LASTEXITCODE)"; exit 1 }

git add docs/data
git diff --cached --quiet
if ($LASTEXITCODE -eq 0) { Log "nada mudou"; exit 0 }
git commit --quiet -m "dados: atualiza edicoes da Liga"
if ($NoPush) { Log "commit feito, push pulado (-NoPush)"; exit 0 }
if (-not (Push-Dados)) { Log "commit ficou local; sobe na proxima execucao"; exit 1 }
Log "publicado"
