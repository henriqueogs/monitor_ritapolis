'use client';

import { useCallback, useState } from 'react';
import {
  fetchAlertas,
  fetchAlertasStats,
  fetchAlertasConfig,
  updateAlertaStatus,
  updateAlertaConfig,
  gerarAlertasManual,
} from '../../lib/api';
import styles from './styles.module.css';

const SEV_COR = { critico: '#dc2626', atencao: '#d97706', info: '#2563eb' };

function valorParaInput(valor) {
  if (typeof valor === 'boolean') return valor;
  if (valor && typeof valor === 'object') return JSON.stringify(valor);
  return valor;
}

export default function AdminAlertasPanel({ initialStats, initialConfig, initialAlertas }) {
  const [stats, setStats] = useState(initialStats || { total: 0 });
  const [config, setConfig] = useState(initialConfig || []);
  const [alertas, setAlertas] = useState(initialAlertas?.dados || []);
  const [loading, setLoading] = useState(null);
  const [log, setLog] = useState([]);

  const registrar = useCallback((msg, erro = false) => {
    setLog((prev) => [{ msg, erro, ts: new Date() }, ...prev.slice(0, 5)]);
  }, []);

  const recarregar = useCallback(async () => {
    const [s, a] = await Promise.all([
      fetchAlertasStats().catch(() => null),
      fetchAlertas({ status: 'ativo', limite: 50 }).catch(() => null),
    ]);
    if (s) setStats(s);
    if (a) setAlertas(a.dados || []);
  }, []);

  const handleGerar = useCallback(async () => {
    setLoading('gerar');
    try {
      const r = await gerarAlertasManual({ limite: 200 });
      registrar(`Geração: ${r.gerados ?? 0} gerados, ${r.atualizados ?? 0} atualizados, ${r.erros ?? 0} erros`);
      await recarregar();
    } catch (e) {
      registrar(`Erro ao gerar: ${e.message}`, true);
    } finally {
      setLoading(null);
    }
  }, [recarregar, registrar]);

  const handleStatus = useCallback(
    async (id, status) => {
      setLoading(`alerta-${id}`);
      try {
        await updateAlertaStatus(id, status);
        setAlertas((prev) => prev.filter((a) => a.id !== id));
        registrar(`Alerta #${id} → ${status}`);
        setStats((prev) => ({ ...prev, total: Math.max(0, (prev.total || 1) - 1) }));
      } catch (e) {
        registrar(`Erro no alerta #${id}: ${e.message}`, true);
      } finally {
        setLoading(null);
      }
    },
    [registrar]
  );

  const handleConfig = useCallback(
    async (chave, valorBruto, tipoOriginal) => {
      setLoading(`config-${chave}`);
      try {
        let valor = valorBruto;
        if (typeof tipoOriginal === 'number') valor = Number(valorBruto);
        else if (typeof tipoOriginal === 'boolean') valor = Boolean(valorBruto);
        else if (tipoOriginal && typeof tipoOriginal === 'object') valor = JSON.parse(valorBruto);
        await updateAlertaConfig(chave, valor);
        registrar(`Config ${chave} salva`);
      } catch (e) {
        registrar(`Erro na config ${chave}: ${e.message}`, true);
      } finally {
        setLoading(null);
      }
    },
    [registrar]
  );

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div>
          <h1>Alertas de Inteligência</h1>
          <p>
            {stats.total} ativos · {stats.critico || 0} críticos · {stats.atencao || 0} atenção · {stats.info || 0} info
          </p>
        </div>
        <button className="button" onClick={handleGerar} disabled={loading === 'gerar'}>
          {loading === 'gerar' ? '⟳ Gerando...' : '▶ Gerar alertas agora'}
        </button>
      </div>

      {log.length > 0 && (
        <div className={styles.log}>
          {log.map((l, i) => (
            <div key={i} style={{ color: l.erro ? '#dc2626' : '#16a34a' }}>
              {l.msg} <span className={styles.logTime}>{l.ts.toLocaleTimeString('pt-BR')}</span>
            </div>
          ))}
        </div>
      )}

      <section className={styles.section}>
        <h2>Configuração de gatilhos</h2>
        {config.length === 0 && <p className="empty-state">Sem configurações registradas (usando defaults).</p>}
        <div className={styles.configGrid}>
          {config.map((c) => (
            <ConfigRow key={c.chave} c={c} loading={loading === `config-${c.chave}`} onSalvar={handleConfig} />
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h2>Alertas ativos ({alertas.length})</h2>
        {alertas.length === 0 && <p className="empty-state">Nenhum alerta ativo.</p>}
        <div className={styles.lista}>
          {alertas.map((a) => (
            <div key={a.id} className={styles.alertaRow} style={{ borderLeftColor: SEV_COR[a.severidade] }}>
              <div className={styles.alertaInfo}>
                <strong>{a.titulo}</strong>
                <span className={styles.alertaMeta}>
                  {a.severidade} · {a.categoria || '—'} · {a.ultima_publicacao_documento || 's/ data'}
                  {a.valor_total ? ` · ${a.valor_periodo_label || ''}` : ''}
                </span>
              </div>
              <div className={styles.alertaAcoes}>
                <a className="button button-secondary" href={`/alertas/${a.id}`} target="_blank" rel="noreferrer">
                  ver
                </a>
                <button className="button button-secondary" disabled={loading === `alerta-${a.id}`} onClick={() => handleStatus(a.id, 'arquivado')}>
                  arquivar
                </button>
                <button className="button button-secondary" disabled={loading === `alerta-${a.id}`} onClick={() => handleStatus(a.id, 'suprimido')}>
                  suprimir
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function ConfigRow({ c, loading, onSalvar }) {
  const [valor, setValor] = useState(valorParaInput(c.valor));
  const ehBool = typeof c.valor === 'boolean';
  return (
    <div className={styles.configRow}>
      <label title={c.descricao || ''}>
        <span className={styles.configChave}>{c.chave}</span>
        {ehBool ? (
          <input type="checkbox" checked={Boolean(valor)} onChange={(e) => setValor(e.target.checked)} />
        ) : (
          <input type="text" value={valor} onChange={(e) => setValor(e.target.value)} />
        )}
      </label>
      <button className="button button-secondary" disabled={loading} onClick={() => onSalvar(c.chave, valor, c.valor)}>
        {loading ? '...' : 'salvar'}
      </button>
    </div>
  );
}
