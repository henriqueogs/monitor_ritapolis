'use client';

import { useState } from 'react';
import { enviarPergunta, PERGUNTA_MAX } from '../../lib/perguntar';
import styles from './styles.module.css';

function Fonte({ fonte }) {
  return (
    <li className={styles.fonte}>
      <a href={fonte.url} target="_blank" rel="noopener noreferrer">
        {fonte.rotulo}
      </a>
      {fonte.nota ? <p className={styles.nota}>{fonte.nota}</p> : null}
      {fonte.trechos.map(trecho => (
        <blockquote key={trecho} className={styles.trecho}>
          {trecho}
        </blockquote>
      ))}
    </li>
  );
}

function Resultado({ resultado }) {
  if (resultado.tipo === 'erro') {
    return (
      <p role="alert" className={styles.erro}>
        {resultado.mensagem}
      </p>
    );
  }
  return (
    <section className={styles.resultado} aria-label="Resposta">
      <p className={resultado.tipo === 'recusa' ? styles.recusa : styles.resposta}>
        {resultado.texto}
      </p>
      {resultado.fontes.length > 0 ? (
        <>
          <h2 className={styles.fontesTitulo}>De onde vem esta resposta</h2>
          <ul className={styles.fontes}>
            {resultado.fontes.map(fonte => (
              <Fonte key={fonte.url} fonte={fonte} />
            ))}
          </ul>
        </>
      ) : null}
      {resultado.tipo === 'recusa' ? (
        <p className={styles.nota}>
          Experimente a <a href="/busca">busca de documentos</a> para encontrar o material original.
        </p>
      ) : null}
    </section>
  );
}

export default function PerguntarForm() {
  const [pergunta, setPergunta] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [resultado, setResultado] = useState(null);

  async function handleSubmit(evento) {
    evento.preventDefault();
    if (carregando) {
      return;
    }
    setCarregando(true);
    setResultado(null);
    setResultado(await enviarPergunta({ pergunta }));
    setCarregando(false);
  }

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      <label htmlFor="pergunta" className={styles.label}>
        Sua pergunta sobre os documentos públicos de Ritápolis
      </label>
      <textarea
        id="pergunta"
        name="pergunta"
        rows={3}
        maxLength={PERGUNTA_MAX}
        value={pergunta}
        onChange={evento => setPergunta(evento.target.value)}
        placeholder="Ex.: Quem venceu o pregão de merenda escolar de 2025?"
        className={styles.campo}
        disabled={carregando}
      />
      <div className={styles.rodape}>
        <span className={styles.contador}>
          {pergunta.length}/{PERGUNTA_MAX}
        </span>
        <button type="submit" className="button button-primary" disabled={carregando}>
          {carregando ? 'Consultando…' : 'Perguntar'}
        </button>
      </div>
      <div aria-live="polite">{resultado ? <Resultado resultado={resultado} /> : null}</div>
      <p className={styles.aviso}>
        Resposta gerada por inteligência artificial a partir de documentos públicos coletados do
        portal oficial. Pode conter imprecisões: confira sempre nas fontes indicadas. Não é parecer
        jurídico nem acusação a ninguém.
      </p>
    </form>
  );
}
