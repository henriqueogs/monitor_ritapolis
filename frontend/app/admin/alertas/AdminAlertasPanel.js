'use client';

import { useCallback, useState } from 'react';
import {
  fetchAlertasAdmin,
  fetchAlertasAdminStats,
  updateAlertaStatus,
  updateAlertaEditorial,
  reprocessarAlerta,
  updateAlertaConfig,
  gerarAlertasManual,
} from '../../lib/api';
import { nivelLabel } from '../../lib/descobertas';
import styles from './styles.module.css';

const SEV_COR = { critico: '#d97706', atencao: '#2563eb', info: '#64748b' };

// Agrupa as ~18 chaves de config em seções — a lista solta misturava
// detectores legados, investigação factual, scheduler e gasto atípico sem
// nenhuma organização.
const GRUPOS_CONFIG = [
  { titulo: 'Investigação factual (IA)', prefixos: ['alertas:investigacao_', 'alertas:narrativa_'] },
  { titulo: 'Detectores temáticos (legado)', prefixos: ['alertas:min_repeticao', 'alertas:valor_threshold', 'alertas:anomalia_', 'alertas:gatilhos_ativos'] },
  { titulo: 'Scheduler incremental', prefixos: ['descobertas:'] },
  { titulo: 'Gasto atípico (empenhos)', prefixos: ['gasto_atipico.'] },
];

function agruparConfig(config) {
  const grupos = GRUPOS_CONFIG.map((g) => ({ ...g, itens: [] }));
  const outros = [];
  for (const c of config) {
    const grupo = grupos.find((g) => g.prefixos.some((p) => c.chave.startsWith(p)));
    (grupo ? grupo.itens : outros).push(c);
  }
  if (outros.length) grupos.push({ titulo: 'Outros', itens: outros });
  return grupos.filter((g) => g.itens.length > 0);
}

function valorParaInput(valor) {
  if (typeof valor === 'boolean') return valor;
  if (valor && typeof valor === 'object') return JSON.stringify(valor);
  return valor;
}

export default function AdminAlertasPanel({ initialStats, initialConfig, initialAlertas }) {
  const [stats, setStats] = useState(initialStats || { severidade: { total: 0 }, editorial: { total: 0 } });
  const [config, setConfig] = useState(initialConfig || []);
  const [alertas, setAlertas] = useState(initialAlertas?.dados || []);
  const [loading, setLoading] = useState(null);
  const [log, setLog] = useState([]);
  const [filtroTema, setFiltroTema] = useState('todos');
  // 'rejeitado' são itens arquivados (legado/superado por rebuild) — nunca
  // foram públicos, não precisam de atenção. Sem isso, a fila de 90 mostra 81
  // itens mortos por padrão. 'todos' continua disponível pra quem quiser ver.
  const [filtroEditorial, setFiltroEditorial] = useState('nao_rejeitado');

  const registrar = useCallback((msg, erro = false) => {
    setLog((prev) => [{ msg, erro, ts: new Date() }, ...prev.slice(0, 5)]);
  }, []);

  const recarregar = useCallback(async () => {
    const [s, a] = await Promise.all([
      fetchAlertasAdminStats().catch(() => null),
      fetchAlertasAdmin({ status: 'ativo', limite: 100 }).catch(() => null),
    ]);
    if (s) setStats(s);
    if (a) setAlertas(a.dados || []);
  }, []);

  const handleGerar = useCallback(async () => {
    setLoading('gerar');
    try {
      const r = await gerarAlertasManual({ full: true });
      registrar(
        `Geração factual: ${r.gerados ?? 0} novas, ${r.atualizados ?? 0} atualizadas, ${r.removidos ?? 0} rejeitadas, ${r.erros ?? 0} erros`
      );
      await recarregar();
    } catch (e) {
      registrar(`Erro ao gerar: ${e.message}`, true);
    } finally {
      setLoading(null);
    }
  }, [recarregar, registrar]);

  const handleStatus = useCallback(async (id, status) => {
    setLoading(`alerta-${id}`);
    try {
      await updateAlertaStatus(id, status);
      registrar(`Alerta #${id} → ${status}`);
      await recarregar();
    } catch (e) {
      registrar(`Erro no alerta #${id}: ${e.message}`, true);
    } finally {
      setLoading(null);
    }
  }, [recarregar, registrar]);

  const handleEditorial = useCallback(async (id, estado) => {
    setLoading(`editorial-${id}`);
    try {
      await updateAlertaEditorial(id, estado);
      registrar(`Descoberta #${id} → ${estado}`);
      await recarregar();
    } catch (e) {
      registrar(`Erro editorial #${id}: ${e.message}`, true);
    } finally {
      setLoading(null);
    }
  }, [recarregar, registrar]);

  const handleReprocessar = useCallback(async (id) => {
    setLoading(`reprocessar-${id}`);
    try {
      const r = await reprocessarAlerta(id);
      const item = r.itens?.[0];
      registrar(`Descoberta #${id} reprocessada → ${item?.status || 'concluída'}`);
      await recarregar();
    } catch (e) {
      registrar(`Erro ao reprocessar #${id}: ${e.message}`, true);
    } finally {
      setLoading(null);
    }
  }, [recarregar, registrar]);

  const handleConfig = useCallback(async (chave, valorBruto, tipoOriginal) => {
    setLoading(`config-${chave}`);
    try {
      let valor = valorBruto;
      if (typeof tipoOriginal === 'number') valor = Number(valorBruto);
      else if (typeof tipoOriginal === 'boolean') valor = Boolean(valorBruto);
      else if (tipoOriginal && typeof tipoOriginal === 'object') valor = JSON.parse(valorBruto);
      await updateAlertaConfig(chave, valor);
      setConfig((prev) => prev.map((c) => (c.chave === chave ? { ...c, valor } : c)));
      registrar(`Config ${chave} salva`);
    } catch (e) {
      registrar(`Erro na config ${chave}: ${e.message}`, true);
    } finally {
      setLoading(null);
    }
  }, [registrar]);

  const alertasFiltrados = alertas.filter((a) => {
    const discovery = a.metadados?.discovery_v3 || a.metadados?.discovery_v2;
    const tema = discovery?.tipo_investigacao || a.metadados?.investigacao_tipo || 'sem_ia';
    const passaEditorial = filtroEditorial === 'todos'
      ? true
      : filtroEditorial === 'nao_rejeitado'
        ? a.estado_editorial !== 'rejeitado'
        : a.estado_editorial === filtroEditorial;
    return (filtroTema === 'todos' || tema === filtroTema) && passaEditorial;
  });
  const temas = [...new Set(alertas
    .map((a) => (a.metadados?.discovery_v3 || a.metadados?.discovery_v2)?.tipo_investigacao || a.metadados?.investigacao_tipo)
    .filter(Boolean))];
  const estadosEditoriais = [...new Set(alertas.map((a) => a.estado_editorial || 'sem_estado'))];
  const editorial = stats.editorial || { total: 0 };
  const acionaveis = (editorial.publicado || 0) + (editorial.revisao || 0) + (editorial.candidato || 0);
  const gruposConfig = agruparConfig(config);

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div>
          <h1>Descobertas</h1>
          <p>
            {acionaveis} acionáve{acionaveis === 1 ? 'l' : 'is'} ({editorial.publicado || 0} publicada, {editorial.revisao || 0} em revisão,{' '}
            {editorial.candidato || 0} candidata){editorial.rejeitado ? ` · ${editorial.rejeitado} arquivada${editorial.rejeitado === 1 ? '' : 's'}` : ''}
          </p>
        </div>
        <button className="button" onClick={handleGerar} disabled={loading === 'gerar'}>
          {loading === 'gerar' ? 'Gerando…' : 'Gerar candidatos factuais'}
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
        {gruposConfig.map((grupo) => (
          <div key={grupo.titulo} className={styles.configGrupo}>
            <h3>{grupo.titulo}</h3>
            <div className={styles.configGrid}>
              {grupo.itens.map((c) => (
                <ConfigRow key={c.chave} c={c} loading={loading === `config-${c.chave}`} onSalvar={handleConfig} />
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className={styles.section}>
        <h2>Fila editorial ({alertasFiltrados.length}/{alertas.length})</h2>
        <div className={styles.configGrid}>
          <label className={styles.configRow}>
            <span className={styles.configChave}>Tema investigativo</span>
            <select value={filtroTema} onChange={(e) => setFiltroTema(e.target.value)}>
              <option value="todos">todos</option>
              {temas.map((tema) => <option key={tema} value={tema}>{tema}</option>)}
            </select>
          </label>
          <label className={styles.configRow}>
            <span className={styles.configChave}>Estado editorial</span>
            <select value={filtroEditorial} onChange={(e) => setFiltroEditorial(e.target.value)}>
              <option value="nao_rejeitado">ativas (sem arquivadas)</option>
              <option value="todos">todos</option>
              {estadosEditoriais.map((estado) => <option key={estado} value={estado}>{estado}</option>)}
            </select>
          </label>
        </div>
        {alertas.length === 0 && <p className="empty-state">Nenhuma descoberta ativa.</p>}
        <div className={styles.lista}>
          {alertasFiltrados.map((a) => (
            <div key={a.id} className={styles.alertaRow} style={{ borderLeftColor: SEV_COR[a.severidade] }}>
              <div className={styles.alertaInfo}>
                <strong>{a.titulo}</strong>
                <span className={styles.alertaMeta}>
                  #{a.id} · {a.estado_editorial || 'sem estado'} · {nivelLabel(a.severidade)} · {a.categoria || '—'} · {a.ultima_publicacao_documento || 's/ data'}
                </span>
                {a.qualidade_motivos?.length ? (
                  <span className={styles.alertaMotivos}>{a.qualidade_motivos.join(' · ')}</span>
                ) : null}
              </div>
              <div className={styles.alertaAcoes}>
                {a.estado_editorial === 'publicado' ? (
                  <a className="button button-secondary" href={`/na-lupa/${a.id}`} target="_blank" rel="noreferrer">ver</a>
                ) : null}
                <button className="button button-secondary" disabled={loading === `reprocessar-${a.id}`} onClick={() => handleReprocessar(a.id)}>
                  reprocessar
                </button>
                {a.estado_editorial !== 'publicado' ? (
                  <button className="button button-secondary" disabled={loading === `editorial-${a.id}`} onClick={() => handleEditorial(a.id, 'publicado')}>
                    publicar
                  </button>
                ) : (
                  <button className="button button-secondary" disabled={loading === `editorial-${a.id}`} onClick={() => handleEditorial(a.id, 'revisao')}>
                    revisar
                  </button>
                )}
                <button className="button button-secondary" disabled={loading === `editorial-${a.id}`} onClick={() => handleEditorial(a.id, 'rejeitado')}>
                  rejeitar
                </button>
                <button className="button button-secondary" disabled={loading === `alerta-${a.id}`} onClick={() => handleStatus(a.id, 'arquivado')}>
                  arquivar
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
        {loading ? '…' : 'salvar'}
      </button>
    </div>
  );
}
