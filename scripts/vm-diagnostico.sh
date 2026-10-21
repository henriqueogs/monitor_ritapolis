#!/bin/bash
# Diagnóstico somente leitura da VM, para o workflow vm-diagnostico.yml.
#
# Instalado em /opt/monitor-ritapolis/report-diagnostico.sh e preso a uma
# chave SSH própria (command="...",restrict no authorized_keys): a chave só
# executa este script. A janela vem do cliente via SSH_ORIGINAL_COMMAND e é
# validada antes de qualquer comando.
#
# O repositório é PÚBLICO e os logs do Actions também: a saída é só resumo
# agregado e saneado (sem IPs v4/v6, URIs, chaves pf-, e-mails, CPF/CNPJ,
# tokens ou linhas brutas de log). Nada aqui altera a VM.
set -uo pipefail

APP_DIR=/opt/monitor-ritapolis
SERVICO=monitor-ritapolis
JANELA_MAX_S=86400
RE_MINUTO='^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}$'
TOP_MENSAGENS=8
TAMANHO_MENSAGEM=120

falhar() { echo "$1" >&2; exit 2; }

# ── Janela ────────────────────────────────────────────────────────────────────
read -r -a ARGS <<< "${SSH_ORIGINAL_COMMAND:-}"
if [[ ${#ARGS[@]} -eq 0 ]]; then
  J_SINCE='-60min'
  J_UNTIL='now'
  LOG_SINCE="$(date -u -d '-60 min' +%Y-%m-%dT%H:%M)"
  LOG_UNTIL="$(date -u +%Y-%m-%dT%H:%M)"
elif [[ ${#ARGS[@]} -eq 2 && ${ARGS[0]} =~ $RE_MINUTO && ${ARGS[1]} =~ $RE_MINUTO ]]; then
  ini=$(date -u -d "${ARGS[0]/T/ }" +%s 2>/dev/null) || falhar 'janela invalida: data inexistente'
  fim=$(date -u -d "${ARGS[1]/T/ }" +%s 2>/dev/null) || falhar 'janela invalida: data inexistente'
  (( fim > ini )) || falhar 'janela invalida: fim deve ser depois do inicio'
  (( fim - ini <= JANELA_MAX_S )) || falhar 'janela invalida: maximo de 24h'
  J_SINCE="${ARGS[0]/T/ }"
  J_UNTIL="${ARGS[1]/T/ }"
  LOG_SINCE="${ARGS[0]}"
  LOG_UNTIL="${ARGS[1]}"
else
  falhar 'janela invalida: use "AAAA-MM-DDTHH:MM AAAA-MM-DDTHH:MM" (UTC) ou nada'
fi

# ── Saneamento (repositório público) ──────────────────────────────────────────
sanear() {
  # Ordem importa: segredos longos antes das regras de IP/números, senão uma
  # chave hex é fatiada e metade escapa.
  sed -E \
    -e 's/(nvapi|sk|gsk)[-_][A-Za-z0-9_-]+/[segredo]/g' \
    -e 's/AIza[A-Za-z0-9_-]+/[segredo]/g' \
    -e 's/[Bb]earer [A-Za-z0-9._~+\/=-]+/Bearer [segredo]/g' \
    -e 's/[Bb]asic [A-Za-z0-9+\/=]+/Basic [segredo]/g' \
    -e 's/(key|token|secret|senha|password)([=: ]+)[^ ,"]+/\1\2[segredo]/Ig' \
    -e 's/[A-Za-z0-9_+\/=-]{32,}/[segredo]/g' \
    -e 's/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/[email]/g' \
    -e 's#pf-[a-z0-9-]+#[pf]#g' \
    -e 's#(/[^/ "]+){2,}#[uri]#g' \
    -e 's/\[([0-9A-Fa-f]{0,4}:){2,7}[0-9A-Fa-f]{0,4}\](:[0-9]+)?/[ip]/g' \
    -e 's/([0-9A-Fa-f]{0,4}:){3,7}[0-9A-Fa-f]{0,4}/[ip]/g' \
    -e 's/[0-9]{1,3}(\.[0-9]{1,3}){3}/[ip]/g' \
    -e 's/[0-9]{3}\.[0-9]{3}\.[0-9]{3}-[0-9]{2}/[cpf]/g' \
    -e 's/[0-9]{2}\.[0-9]{3}\.[0-9]{3}\/[0-9]{4}-[0-9]{2}/[cnpj]/g' \
    -e 's/[0-9]{6,}/[n]/g' |
    cut -c1-"$TAMANHO_MENSAGEM"
}

top_mensagens() { sanear | sort | uniq -c | sort -rn | head -n "$TOP_MENSAGENS"; }

jctl() { TZ=UTC journalctl --since "$J_SINCE" --until "$J_UNTIL" --no-pager "$@" 2>/dev/null; }

echo "janela: $LOG_SINCE -> $LOG_UNTIL (UTC)"

# ── Deploy ────────────────────────────────────────────────────────────────────
echo '== deploy'
if grep -q 'deploy-lock-hash' "$APP_DIR/deploy.sh" 2>/dev/null; then
  echo 'deploy_sh_versao_nova: sim'
else
  echo 'deploy_sh_versao_nova: nao'
fi
if cmp -s "$APP_DIR/deploy.sh" "$APP_DIR/scripts/oracle-deploy.sh"; then
  echo 'deploy_sh_igual_ao_repo: sim'
else
  echo 'deploy_sh_igual_ao_repo: nao'
fi
marcador="$APP_DIR/node_modules/.deploy-lock-hash"
if [[ ! -f "$marcador" ]]; then
  echo 'marcador_lock: ausente'
elif [[ "$(cat "$marcador")" == "$(git -C "$APP_DIR" rev-parse HEAD:package-lock.json 2>/dev/null)" ]]; then
  echo 'marcador_lock: igual ao lockfile atual'
else
  echo 'marcador_lock: diferente do lockfile atual'
fi

# ── Serviço e máquina ─────────────────────────────────────────────────────────
echo '== systemd'
systemctl show "$SERVICO" -p NRestarts -p ActiveEnterTimestamp -p Restart -p RestartUSec 2>/dev/null
echo "restarts_agendados_na_janela: $(jctl -u "$SERVICO" | grep -c 'Scheduled restart')"
echo "saidas_do_processo_na_janela: $(jctl -u "$SERVICO" | grep -c 'Main process exited')"
echo '== maquina'
free -m 2>/dev/null
uptime 2>/dev/null
df -h / 2>/dev/null
echo "oom_kills_na_janela: $(jctl -k | grep -ciE 'out of memory|killed process')"

# ── Caddy (só o campo msg; nunca IP de visitante nem URI) ─────────────────────
echo '== caddy'
caddy_erros=$(jctl -u caddy -o cat | grep -E '"level":"(error|fatal)"')
echo "caddy_erros_na_janela: $(printf '%s' "$caddy_erros" | grep -c .)"
printf '%s\n' "$caddy_erros" | grep -o '"msg":"[^"]*"' | sed -E 's/^"msg":"|"$//g' | top_mensagens

# ── Aplicação (logs/app.log: JSON do winston, ver src/logger.js) ──────────────
# Só os campos de topo level/message/timestamp; o meta (ip, path, chave...)
# nunca sai. JSON.parse em vez de grep para não pegar "message" aninhado.
# Avisos e erros levam a categoria do erro de IA (timeout, limite_provider...),
# calculada do meta erro/error pelo classificador do app; o texto do erro não sai.
echo '== app.log'
APP_LOG_FILTRO='
  const [ini, fim, appDir] = process.argv.slice(1);
  let classificar = null;
  try { ({ classifyAiError: classificar } = require(appDir + "/src/ai/classificar-erro-ia.js")); } catch {}
  const categoria = (r) => {
    const detalhe = r.erro ?? r.error;
    if (!detalhe) return "sem_detalhe";
    return classificar ? classificar(typeof detalhe === "string" ? detalhe : JSON.stringify(detalhe)) : "indisponivel";
  };
  const niveis = {}; const msgs = [];
  for (const linha of require("fs").readFileSync(0, "utf8").split("\n")) {
    let r; try { r = JSON.parse(linha); } catch { continue; }
    const ts = String(r.timestamp || "").slice(0, 16);
    if (!ts || ts < ini || ts > fim) continue;
    niveis[r.level] = (niveis[r.level] || 0) + 1;
    if ((r.level === "error" || r.level === "warn") && typeof r.message === "string") {
      msgs.push(categoria(r) + " | " + r.message.replace(/\s+/g, " "));
    }
  }
  const resumo = Object.keys(niveis).sort().map((k) => k + "=" + niveis[k]).join(" ");
  console.log("app_log_por_nivel: " + (resumo || "nenhuma linha"));
  for (const m of msgs) console.log("MSG\t" + m);
'
saida_app=$(node -e "$APP_LOG_FILTRO" "$LOG_SINCE" "$LOG_UNTIL" "$APP_DIR" < "$APP_DIR/logs/app.log" 2>/dev/null) ||
  saida_app='app_log_por_nivel: indisponivel'
printf '%s\n' "$saida_app" | grep -v $'^MSG\t'
printf '%s\n' "$saida_app" | grep $'^MSG\t' | cut -f2- | top_mensagens

# Seções sem ocorrência (grep sem match) não são falha do diagnóstico.
exit 0
