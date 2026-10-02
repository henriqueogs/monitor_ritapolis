import Link from 'next/link';
import styles from '../styles.module.css';

export default function CityContext() {
  return (
    <section className={styles.cityContext} aria-labelledby="ritapolis-city-title">
      <h2 id="ritapolis-city-title">Ritápolis, Minas Gerais</h2>
      <p>
        Ritápolis é um município de Minas Gerais. No Censo 2022 do IBGE,
        a cidade tinha 4.994 habitantes. Quem nasce em Ritápolis é ritapolitano,
        e seu código de município no IBGE é 3156106.
      </p>
      <p>
        No Ritápolis.com, você pode acompanhar os{' '}
        <Link href="/transparencia">gastos públicos do município</Link>, consultar{' '}
        <Link href="/licitacoes">licitações, editais e contratos</Link> e pesquisar{' '}
        <Link href="/legislacao">leis, decretos e portarias</Link>.
        Cada área reúne os documentos disponíveis e indica as fontes para conferência.
      </p>
      <p className={styles.citySource}>
        Dados sobre a cidade: <a href="https://www.ibge.gov.br/cidades-e-estados/mg/ritapolis.html">IBGE — Ritápolis</a>.
        População referente ao Censo 2022; não é uma estimativa atual.
      </p>
    </section>
  );
}
