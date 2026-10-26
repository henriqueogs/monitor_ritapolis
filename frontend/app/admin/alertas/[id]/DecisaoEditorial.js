'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateAlertaEditorial, reprocessarAlerta } from '../../../lib/api';
import { MOTIVOS_DESCARTE_OPCOES, liberadoParaPublicar } from '../../../../lib/alerta-revisao';
import styles from './styles.module.css';

const ESTADO = { PUBLICADO: 'publicado', REVISAO: 'revisao', REJEITADO: 'rejeitado' };

export default function DecisaoEditorial({ alerta, gate }) {
  const router = useRouter();
  const [motivo, setMotivo] = useState('');
  const [nota, setNota] = useState('');
  const [carregando, setCarregando] = useState(null);
  const [mensagem, setMensagem] = useState(null);
  const [marcados, setMarcados] = useState(() => new Set());

  function alternar(campo) {
    setMarcados((atual) => {
      const novo = new Set(atual);
      if (novo.has(campo)) novo.delete(campo);
      else novo.add(campo);
      return novo;
    });
  }

  async function executar(chave, acao, sucesso) {
    setCarregando(chave);
    setMensagem(null);
    try {
      await acao();
      setMensagem({ erro: false, texto: sucesso });
      setNota('');
      router.refresh();
    } catch (e) {
      setMensagem({ erro: true, texto: e.message });
    } finally {
      setCarregando(null);
    }
  }

  const decidir = (estado, motivos = []) =>
    executar(
      estado,
      () => updateAlertaEditorial(alerta.id, estado, { motivos, nota, conferidos: [...marcados] }),
      `Descoberta → ${estado}`
    );

  const reprocessar = () =>
    executar('reprocessar', () => reprocessarAlerta(alerta.id), 'Investigação da IA enviada; recarregue em instantes.');

  const ocupado = carregando !== null;
  const liberado = liberadoParaPublicar(gate, marcados);

  return (
    <section className={styles.section}>
      <h2>Sua decisão</h2>
      <label className={styles.campo}>
        <span>Nota (opcional, fica no histórico)</span>
        <textarea value={nota} maxLength={500} rows={2} onChange={(e) => setNota(e.target.value)} />
      </label>

      {gate.deterministico ? (
        <fieldset className={styles.conferencia}>
          <legend>Conferi nas fontes oficiais (obrigatório para publicar)</legend>
          {gate.campos.map((campo) => (
            <label key={campo}>
              <input type="checkbox" checked={marcados.has(campo)} onChange={() => alternar(campo)} /> {campo}
            </label>
          ))}
        </fieldset>
      ) : null}

      <div className={styles.acoes}>
        <button
          className="button"
          disabled={ocupado || !liberado || alerta.estado_editorial === ESTADO.PUBLICADO}
          title={gate.bloqueio || ''}
          onClick={() => decidir(ESTADO.PUBLICADO)}
        >
          Confirmar e publicar
        </button>
        <button className="button button-secondary" disabled={ocupado} onClick={() => decidir(ESTADO.REVISAO)}>
          Manter em revisão
        </button>
        {gate.deterministico ? null : (
          <button className="button button-secondary" disabled={ocupado} onClick={reprocessar}>
            {carregando === 'reprocessar' ? 'Enviando…' : 'Reprocessar com IA'}
          </button>
        )}
      </div>
      {!liberado && gate.bloqueio ? <p className={styles.muted}>Publicar bloqueado: {gate.bloqueio}</p> : null}

      <div className={styles.descarte}>
        <label className={styles.campo}>
          <span>Motivo do descarte</span>
          <select value={motivo} onChange={(e) => setMotivo(e.target.value)}>
            <option value="">escolha um motivo…</option>
            {MOTIVOS_DESCARTE_OPCOES.map((o) => (
              <option key={o.codigo} value={o.codigo}>{o.rotulo}</option>
            ))}
          </select>
        </label>
        <button
          className="button button-secondary"
          disabled={ocupado || !motivo || alerta.estado_editorial === ESTADO.REJEITADO}
          onClick={() => decidir(ESTADO.REJEITADO, [motivo])}
        >
          Descartar
        </button>
      </div>

      {mensagem ? (
        <p className={mensagem.erro ? styles.erro : styles.ok} role="status">{mensagem.texto}</p>
      ) : null}
    </section>
  );
}
