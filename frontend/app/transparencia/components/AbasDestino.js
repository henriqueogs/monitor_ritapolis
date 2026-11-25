'use client';

import { useRef, useState } from 'react';

/**
 * Abas acessíveis (WAI-ARIA tabs) para alternar visões de um mesmo bloco sem
 * recarregar. Os painéis chegam já renderizados no servidor; só o ativo aparece.
 */
export default function AbasDestino({ abas, rotulo }) {
  const [ativa, setAtiva] = useState(0);
  const refs = useRef([]);
  const visiveis = (abas || []).filter((aba) => aba.conteudo);
  if (!visiveis.length) return null;

  const focar = (indice) => {
    const proxima = (indice + visiveis.length) % visiveis.length;
    setAtiva(proxima);
    refs.current[proxima]?.focus();
  };

  const handleTecla = (event) => {
    if (event.key === 'ArrowRight') focar(ativa + 1);
    else if (event.key === 'ArrowLeft') focar(ativa - 1);
    else return;
    event.preventDefault();
  };

  return (
    <div>
      <div role="tablist" aria-label={rotulo} className="abas-lista" onKeyDown={handleTecla}>
        {visiveis.map((aba, indice) => (
          <button
            key={aba.id}
            ref={(el) => { refs.current[indice] = el; }}
            type="button"
            role="tab"
            id={`aba-${aba.id}`}
            aria-selected={indice === ativa}
            aria-controls={`painel-${aba.id}`}
            tabIndex={indice === ativa ? 0 : -1}
            className="abas-botao"
            onClick={() => setAtiva(indice)}
          >
            {aba.rotulo}
          </button>
        ))}
      </div>
      {visiveis.map((aba, indice) => (
        <div
          key={aba.id}
          role="tabpanel"
          id={`painel-${aba.id}`}
          aria-labelledby={`aba-${aba.id}`}
          hidden={indice !== ativa}
          className="abas-painel"
        >
          {aba.conteudo}
        </div>
      ))}
    </div>
  );
}
