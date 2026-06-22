'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchAdminStatus, fetchAdminFerramentas, triggerAdminAction } from '../../lib/api';
import styles from './styles.module.css';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n) {
  return Number(n || 0).toLocaleString('pt-BR');
}

function pct(a, b) {
  if (!b) return 0;
  return Math.round((a / b) * 100);
}

function relativeTime(iso) {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'agora';
  if (m < 60) return `${m}min atrás`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h atrás`;
  return `${Math.floor(h / 24)}d atrás`;
}

function fmtDur(s) {
  if (s == null) return '—';
  const seg = Math.max(0, Math.round(s));
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  if (h) return `${h}h${String(m).padStart(2, '0')}m`;
  if (m) return `${m}m${String(seg % 60).padStart(2, '0')}s`;
  return `${seg}s`;
}

const ESTADO_INFO = {
  ativo: { label: '▶ ativo', color: '#2563eb' },
  concluido: { label: '✓ concluído', color: '#16a34a' },
  travado: { label: '⚠ possível travamento', color: '#dc2626' },
};

function TaskCard({ tarefa }) {
  const info = ESTADO_INFO[tarefa.estado] || ESTADO_INFO.ativo;
  const c = tarefa.contadores || {};
  return (
    <div className={styles.metricCard} style={{ borderLeftColor: info.color }}>
      <div className={styles.schedulerName}>{tarefa.nome}</div>
      <div className={styles.schedulerState} style={{ color: info.color }}>
        {info.label} · {tarefa.processados}
        {tarefa.total != null ? `/${tarefa.total}` : ''}
        {tarefa.total ? ` (${pct(tarefa.processados, tarefa.total)}%)` : ''}
      </div>
      {tarefa.total != null && <ProgressBar value={tarefa.processados} max={tarefa.total} color={info.color} />}
      <div className={styles.metricSub}>
        {tarefa.taxa_por_min}/min
        {tarefa.eta_s != null && !tarefa.concluido ? ` · ETA ${fmtDur(tarefa.eta_s)}` : ''}
        {' · '}atualizado há {fmtDur(tarefa.idade_s)}
        {Object.keys(c).length ? ` · ${Object.entries(c).map(([k, v]) => `${k}:${v}`).join(' ')}` : ''}
      </div>
    </div>
  );
}

// ── Sub-componentes ───────────────────────────────────────────────────────────

function ProgressBar({ value, max, color = '#2563eb' }) {
  const w = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className={styles.progressBar}>
      <div className={styles.progressFill} style={{ width: `${w}%`, background: color }} />
      <span className={styles.progressLabel}>{w}%</span>
    </div>
  );
}

function MetricCard({ label, value, sub, color }) {
  return (
    <div className={styles.metricCard} style={color ? { borderLeftColor: color } : {}}>
      <div className={styles.metricValue}>{fmt(value)}</div>
      <div className={styles.metricLabel}>{label}</div>
      {sub && <div className={styles.metricSub}>{sub}</div>}
    </div>
  );
}

function SchedulerBadge({ label, status }) {
  const enabled = status?.enabled !== false;
  const running = status?.running || status?.cycle_running;
  const state = !enabled ? 'off' : running ? 'on' : 'idle';
  const colors = { on: '#16a34a', idle: '#64748b', off: '#dc2626' };
  const labels = { on: 'ativo', idle: 'aguardando', off: 'desabilitado' };
  return (
    <div className={styles.schedulerBadge}>
      <span className={styles.schedulerDot} style={{ background: colors[state] }} />
      <div>
        <div className={styles.schedulerName}>{label}</div>
        <div className={styles.schedulerState} style={{ color: colors[state] }}>
          {labels[state]}
        </div>
      </div>
    </div>
  );
}

function TriggerButton({ label, acao, onTrigger, loading }) {
  return (
    <button
      className={styles.triggerBtn}
      onClick={() => onTrigger(acao)}
      disabled={loading === acao}
    >
      {loading === acao ? '⟳ Aguardando...' : label}
    </button>
  );
}

// ── Painel principal ──────────────────────────────────────────────────────────

export default function AdminJobsDashboard({ initialData }) {
  const [data, setData] = useState(initialData);
  const [ferramentas, setFerramentas] = useState(null);
  const [tarefas, setTarefas] = useState([]);
  const [loading, setLoading] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [triggerLog, setTriggerLog] = useState([]);
  const intervalRef = useRef(null);
  const tarefasRef = useRef(null);

  const refresh = useCallback(async () => {
    try {
      const fresh = await fetchAdminStatus();
      setData(fresh);
      setLastRefresh(new Date());
    } catch {
      // silently fail — data from last fetch still visible
    }
  }, []);

  // Tarefas em andamento + catálogo de ferramentas (poll mais rápido p/ progresso)
  const refreshTarefas = useCallback(async () => {
    try {
      const f = await fetchAdminFerramentas();
      setFerramentas(f.ferramentas || []);
      setTarefas(f.tarefas || []);
    } catch {
      // mantém último estado
    }
  }, []);

  // Auto-refresh: status 30s, tarefas/progresso 8s
  useEffect(() => {
    intervalRef.current = setInterval(refresh, 30_000);
    refreshTarefas();
    tarefasRef.current = setInterval(refreshTarefas, 8_000);
    return () => {
      clearInterval(intervalRef.current);
      clearInterval(tarefasRef.current);
    };
  }, [refresh, refreshTarefas]);

  const handleTrigger = useCallback(async (acao) => {
    setLoading(acao);
    try {
      const r = await triggerAdminAction(acao);
      setTriggerLog((prev) => [
        { acao, msg: r.msg || JSON.stringify(r.resultado || r), ts: new Date() },
        ...prev.slice(0, 4),
      ]);
      // Atualiza dados após trigger
      await Promise.all([refresh(), refreshTarefas()]);
    } catch (e) {
      setTriggerLog((prev) => [
        { acao, msg: `Erro: ${e.message}`, ts: new Date(), erro: true },
        ...prev.slice(0, 4),
      ]);
    } finally {
      setLoading(null);
    }
  }, [refresh, refreshTarefas]);

  if (!data) return <p className="empty-state">Carregando...</p>;

  const { jobs, cobertura, fts, schedulers, atividade_ia_24h, erros_recentes } = data;
  const totalJobs = (jobs?.pendente || 0) + (jobs?.ok || 0) + (jobs?.erro || 0) + (jobs?.processando || 0);

  return (
    <div className={styles.dashboard}>

      {/* ── Cabeçalho ─────────────────────────────────────────────────────── */}
      <div className={styles.header}>
        <div>
          <h1>Observabilidade de Jobs</h1>
          <p>Atualizado {relativeTime(lastRefresh.toISOString())} · auto-refresh 30s</p>
        </div>
        <button className="button button-secondary" onClick={refresh} disabled={!!loading}>
          ↺ Atualizar
        </button>
      </div>

      {/* ── Progresso de resumos IA ───────────────────────────────────────── */}
      <section className={styles.section}>
        <h2>Resumos IA</h2>
        <div className={styles.metricsRow}>
          <MetricCard label="Pendentes" value={jobs?.pendente} color="#f59e0b" />
          <MetricCard label="Concluídos" value={jobs?.ok} color="#16a34a" />
          <MetricCard label="Erros" value={jobs?.erro} color="#dc2626" />
          <MetricCard label="Processando" value={jobs?.processando} color="#2563eb" />
          <MetricCard
            label="Com resumo JSON"
            value={jobs?.com_resumo}
            sub={`de ${fmt(jobs?.total_docs)} docs (${jobs?.pct_resumo}%)`}
            color="#7c3aed"
          />
        </div>
        <div className={styles.progressSection}>
          <span>Progresso de cobertura</span>
          <ProgressBar value={jobs?.com_resumo} max={jobs?.total_docs} color="#7c3aed" />
        </div>
        {atividade_ia_24h?.total > 0 && (
          <p className={styles.activityNote}>
            Últimas 24h: <strong>{fmt(atividade_ia_24h.ok)}</strong> ok,{' '}
            <strong>{fmt(atividade_ia_24h.erro)}</strong> erros
            {atividade_ia_24h.ultimo && ` · último ${relativeTime(atividade_ia_24h.ultimo)}`}
          </p>
        )}
      </section>

      {/* ── Cobertura de vencedores ───────────────────────────────────────── */}
      <section className={styles.section}>
        <h2>Cobertura de Vencedores</h2>
        <div className={styles.metricsRow}>
          <MetricCard
            label="Com vencedor"
            value={cobertura?.com_vencedor}
            sub={`de ${fmt(cobertura?.total)} licitações (${cobertura?.pct_vencedor}%)`}
            color="#16a34a"
          />
          <MetricCard label="Com CNPJ" value={cobertura?.com_cnpj} color="#0891b2" />
          <MetricCard label="Com valor final" value={cobertura?.com_valor_final} color="#7c3aed" />
          <MetricCard label="Via IA" value={cobertura?.por_origem?.resumo_ai} sub="extraídos de resumos" />
          <MetricCard label="Via portal" value={cobertura?.por_origem?.portal_transparencia} sub="portal transparência" />
        </div>
        <div className={styles.progressSection}>
          <span>Vencedores identificados</span>
          <ProgressBar
            value={cobertura?.com_vencedor}
            max={cobertura?.total}
            color="#16a34a"
          />
        </div>
      </section>

      {/* ── Schedulers ───────────────────────────────────────────────────── */}
      <section className={styles.section}>
        <h2>Schedulers</h2>
        <div className={styles.schedulersRow}>
          <SchedulerBadge
            label={`Coleta de docs · a cada ${schedulers?.coleta?.intervalo_horas}h`}
            status={schedulers?.coleta}
          />
          <SchedulerBadge
            label={`Resumos IA · ${fmt(schedulers?.ia?.docs_por_ciclo)} docs/ciclo · a cada ${schedulers?.ia?.intervalo_horas}h`}
            status={schedulers?.ia}
          />
          <SchedulerBadge
            label={`Transparência diária · última ${relativeTime(schedulers?.diario?.ultima_transparencia)}`}
            status={{ enabled: schedulers?.diario?.enabled, running: schedulers?.diario?.rodando_transparencia }}
          />
          <SchedulerBadge
            label={`PNCP sync · ${schedulers?.diario?.proxima_pncp_due ? 'PENDENTE' : 'em dia'}`}
            status={{ enabled: schedulers?.diario?.enabled, running: schedulers?.diario?.rodando_pncp }}
          />
          <SchedulerBadge
            label={`FTS5 · ${fts?.indexado ? `${fmt(fts?.matches_pregao)} matches "pregão"` : 'não indexado'}`}
            status={{ enabled: fts?.indexado, running: false }}
          />
        </div>
      </section>

      {/* ── Ações manuais ─────────────────────────────────────────────────── */}
      <section className={styles.section}>
        <h2>Ações Manuais</h2>
        <div className={styles.triggersRow}>
          <TriggerButton
            label="▶ Ciclo IA agora"
            acao="ai-cycle"
            onTrigger={handleTrigger}
            loading={loading}
          />
          <TriggerButton
            label="⬇ Extrair entidades"
            acao="extract-entities"
            onTrigger={handleTrigger}
            loading={loading}
          />
          <TriggerButton
            label="🔍 Rebuild FTS"
            acao="rebuild-fts"
            onTrigger={handleTrigger}
            loading={loading}
          />
          <TriggerButton
            label="💧 Coleta transparência"
            acao="daily-transparencia"
            onTrigger={handleTrigger}
            loading={loading}
          />
        </div>
        {triggerLog.length > 0 && (
          <div className={styles.triggerLog}>
            {triggerLog.map((entry, i) => (
              <div
                key={i}
                className={styles.triggerLogEntry}
                style={{ color: entry.erro ? '#dc2626' : '#16a34a' }}
              >
                <strong>[{entry.acao}]</strong> {entry.msg}{' '}
                <span className={styles.triggerLogTime}>
                  {entry.ts.toLocaleTimeString('pt-BR')}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Tarefas em andamento (rastreador de progresso) ────────────────── */}
      {tarefas.length > 0 && (
        <section className={styles.section}>
          <h2>Tarefas em andamento</h2>
          <div className={styles.metricsRow}>
            {tarefas.map((t) => (
              <TaskCard key={t.nome} tarefa={t} />
            ))}
          </div>
        </section>
      )}

      {/* ── Ferramentas de manutenção ─────────────────────────────────────── */}
      {ferramentas?.length > 0 && (
        <section className={styles.section}>
          <h2>Manutenção de dados</h2>
          <div className={styles.triggersRow}>
            {ferramentas.map((f) => {
              const rodando = f.progresso && tarefas.some((t) => t.nome === f.progresso && t.estado === 'ativo');
              return (
                <button
                  key={f.id}
                  className={styles.triggerBtn}
                  onClick={() => handleTrigger(f.id)}
                  disabled={loading === f.id || rodando}
                  title={f.descricao}
                >
                  {loading === f.id
                    ? '⟳ Iniciando...'
                    : rodando
                      ? `▶ ${f.label} (rodando)`
                      : `${f.modo === 'background' ? '⚙' : '✓'} ${f.label}`}
                </button>
              );
            })}
          </div>
          <p className={styles.activityNote}>
            ⚙ roda em background com progresso acima · ✓ roda na hora e mostra o resultado abaixo
          </p>
        </section>
      )}

      {/* ── Erros recentes ───────────────────────────────────────────────── */}
      {erros_recentes?.length > 0 && (
        <section className={styles.section}>
          <h2>Erros Recentes de Jobs</h2>
          <div className={styles.errorsTable}>
            <div className={styles.errorsHead}>
              <span>Doc</span>
              <span>Tipo / Ano</span>
              <span>Erro</span>
              <span>Tentativas</span>
            </div>
            {erros_recentes.map((e) => (
              <div key={e.documento_id} className={styles.errorsRow}>
                <a href={`/documento/${e.documento_id}`} className={styles.errorsDocLink}>
                  {e.titulo?.slice(0, 45) || `#${e.documento_id}`}
                </a>
                <span>
                  {e.tipo} / {e.ano}
                </span>
                <span className={styles.errorsMsg}>{e.erro}</span>
                <span>{e.tentativas}×</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
