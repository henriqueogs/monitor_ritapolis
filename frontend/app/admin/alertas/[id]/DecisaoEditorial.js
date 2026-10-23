'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateAlertaEditorial, reprocessarAlerta } from '../../../lib/api';
import { MOTIVOS_DESCARTE_OPCOES } from '../../../../lib/alerta-revisao';
import styles from './styles.module.css';

const ESTADO = { PUBLICADO: 'publicado', REVISAO: 'revisao', REJEITADO: 'rejeitado' };

export default function DecisaoEditorial({ alerta, gate }) {
  const router = useRouter();
  const [motivo, setMotivo] = useState('');
  const [nota, setNota] = useState('');
  const [carregando, setCarregando] = useState(null);
  const [mensagem, setMensagem] = useState(null);

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
    executar(estado, () => updateAlertaEditorial(alerta.id, estado, motivos, nota), `Descoberta → ${estado}`);

  const reprocessar = () =>
    executar('reprocessar', () => reprocessarAlerta(alerta.id), 'Investigação da IA enviada; recarregue em instantes.');

  const ocupado = carregando !== null;

  return (
    <section className={styles.section}>
      <h2>Sua decisão</h2>
      <label className={styles.campo}>
        <span>Nota (opcional, fica no histórico)</span>
        <textarea value={nota} maxLength={500} rows={2} onChange={(e) => setNota(e.target.value)} />
      </label>

      <div className={styles.acoes}>
        <button
          className="button"
          disabled={ocupado || !gate.podePublicar || alerta.estado_editorial === ESTADO.PUBLICADO}
          title={gate.bloqueio || ''}
          onClick={() => decidir(ESTADO.PUBLICADO)}
        >
          Confirmar e publicar
        </button>
        <button className="button button-secondary" disabled={ocupado} onClick={() => decidir(ESTADO.REVISAO)}>
          Manter em revisão
        </button>
        <button className="button button-secondary" disabled={ocupado} onClick={reprocessar}>
          {carregando === 'reprocessar' ? 'Enviando…' : 'Reprocessar com IA'}
        </button>
      </div>
      {!gate.podePublicar && gate.bloqueio ? <p className={styles.muted}>Publicar bloqueado: {gate.bloqueio}</p> : null}

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
