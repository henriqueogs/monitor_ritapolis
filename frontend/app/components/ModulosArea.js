import Link from 'next/link';
import { areaPorId } from '../lib/modulos';

const ICONE_MODULO = 20;
const ICONE_AREA = 22;

function CardModulo({ modulo }) {
  const Icone = modulo.icone;
  return (
    <Link href={modulo.href} prefetch={false} className="hub-destino">
      <span className="hub-destino-icone" aria-hidden="true"><Icone size={ICONE_MODULO} /></span>
      <strong className="hub-destino-titulo">{modulo.titulo}</strong>
      <span className="hub-destino-pergunta">{modulo.pergunta}</span>
      <span className="hub-destino-cta" aria-hidden="true">→</span>
    </Link>
  );
}

/**
 * Grade de módulos de uma área, agrupada pela jornada (ver lib/modulos.js).
 * Na home leva cabeçalho com números da área; na página da área, `semCabecalho`.
 * `stats`: [{ valor, rotulo }] — rótulo sempre com o período (§11.1).
 */
export default function ModulosArea({ areaId, stats = [], semCabecalho = false }) {
  const area = areaPorId(areaId);
  if (!area) return null;
  const IconeArea = area.icone;
  const tituloId = `area-${area.id}`;

  return (
    <section className={`area-modulos area-${area.id}`} aria-labelledby={semCabecalho ? undefined : tituloId} aria-label={semCabecalho ? `Módulos de ${area.titulo}` : undefined}>
      {semCabecalho ? null : (
        <header className="area-modulos-cabecalho">
          <span className="area-modulos-icone" aria-hidden="true"><IconeArea size={ICONE_AREA} /></span>
          <div className="area-modulos-texto">
            <h2 id={tituloId}>{area.titulo}</h2>
            <p>{area.descricao}</p>
          </div>
          {stats.length ? (
            <dl className="area-modulos-stats">
              {stats.map((s) => (
                <div key={s.rotulo}>
                  <dt>{s.rotulo}</dt>
                  <dd>{s.valor}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          <Link href={area.href} prefetch={false} className="area-modulos-link">
            Visão geral da área →
          </Link>
        </header>
      )}
      <div className="area-modulos-grupos">
        {area.grupos.map((grupo) => (
          <div key={grupo.titulo} className="area-modulos-grupo" data-n={grupo.modulos.length}>
            <h3>{grupo.titulo}</h3>
            <div className="area-modulos-grade">
              {grupo.modulos.map((modulo) => <CardModulo key={modulo.href} modulo={modulo} />)}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
