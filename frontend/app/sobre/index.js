import SectionBlock from '../components/SectionBlock';
import Link from 'next/link';
import DataAvailabilityBadge from '../components/DataAvailabilityBadge';
import { fetchEstatisticas } from '../lib/api';
import { formatMoney, formatDate } from '../lib/format';
import styles from './styles.module.css';

export const metadata = {
  title: 'Sobre',
  description: 'Como o Ritápolis.com funciona, o que monitora e quais são os limites atuais.'
};

export default async function SobrePage() {
  const stats = await fetchEstatisticas().catch(() => null);
  const totalDocs = stats?.total_documentos ?? '—';
  const totalLics = stats?.total_licitacoes ?? '—';
  const valorTotal = stats?.valor_estimado_total ?? null;
  const ultimaColeta = stats?.ultima_coleta?.coletado_em ?? null;

  return (
    <main className="page-container">
      <div className="page-title">
        <div>
          <h1>Sobre o Ritápolis.com</h1>
          <p>
            Uma plataforma de inteligência pública verificável para Ritápolis/MG. Coleta documentos
            oficiais, estrutura os dados com parsers determinísticos e enriquece com IA — sempre com
            rastreabilidade da fonte original.
          </p>
        </div>
        <DataAvailabilityBadge status="real" />
      </div>

      <SectionBlock title="Autoria do projeto">
        <p>
          O Ritápolis.com é um projeto independente desenvolvido por{' '}
          <a href="https://github.com/henriqueogs" rel="author">Henrique (henriqueogs no GitHub)</a>.
          Não é um site oficial da Prefeitura ou da Câmara Municipal.
        </p>
      </SectionBlock>

      {/* Fontes monitoradas */}
      <SectionBlock title="O que é monitorado">
        <div className={styles.statusList}>
          <div className={styles.statusRow}>
            <div>
              <strong>Prefeitura Municipal de Ritápolis</strong>
              <p>Editais, licitações, dispensas, contratos, atas e outras publicações disponíveis no <Link href="/acervo">acervo de documentos</Link>. A cobertura depende das publicações acessíveis e dos registros já coletados.</p>
            </div>
            <DataAvailabilityBadge status="real" />
          </div>
          <div className={styles.statusRow}>
            <div>
              <strong>Câmara Municipal de Ritápolis</strong>
              <p>Leis, decretos, portarias, resoluções e atos legislativos disponíveis na área de <Link href="/legislacao">atos oficiais de Ritápolis</Link>. A ausência de um documento no projeto não comprova ausência de publicação no órgão de origem.</p>
            </div>
            <DataAvailabilityBadge status="pendente" />
          </div>
          <div className={styles.statusRow}>
            <div>
              <strong>Portal Nacional de Contratações Públicas (PNCP)</strong>
              <p>Fonte complementar para consulta de contratações públicas. A disponibilidade dos registros e do cruzamento varia por processo; confira o documento e a fonte indicada em cada <Link href="/licitacoes">licitação</Link>.</p>
            </div>
            <DataAvailabilityBadge status="pendente" />
          </div>
          <div className={styles.statusRow}>
            <div>
              <strong>Portal de Transparência financeira</strong>
              <p>Consulte <Link href="/transparencia">gastos públicos de Ritápolis</Link> e <Link href="/transparencia/empenhos">empenhos</Link>. Valor estimado, empenho e pagamento representam etapas diferentes: um valor empenhado não comprova pagamento.</p>
            </div>
            <DataAvailabilityBadge status="parcial" />
          </div>
        </div>
      </SectionBlock>

      {/* Estado atual */}
      <SectionBlock title={`Estado atual da base${ultimaColeta ? ` — atualizado em ${formatDate(ultimaColeta)}` : ''}`}>
        <div className={styles.statusList}>
          <div className={styles.statusRow}>
            <div>
              <strong>{totalDocs} documentos cadastrados — {totalLics} licitações</strong>
              <p>Inclui editais, dispensas, pregões, chamadas públicas, atas e extratos. Os demais são leis, decretos e portarias da Câmara.</p>
            </div>
            <DataAvailabilityBadge status="real" />
          </div>
          <div className={styles.statusRow}>
            <div>
              <strong>{valorTotal ? `${formatMoney(valorTotal)} em valores estimados` : 'Valores em processamento'}</strong>
              <p>Soma dos valores estimados de contratos e licitações coletadas. Vencedores e valores finais confirmados disponíveis em /inteligencia.</p>
            </div>
            <DataAvailabilityBadge status="real" />
          </div>
          <div className={styles.statusRow}>
            <div>
              <strong>Licitações classificadas em 8 categorias</strong>
              <p>Classificação determinística por palavras-chave: Saúde, Alimentação, Educação, Cultura e Eventos, Obras e Infraestrutura, Serviços, Equipamentos e Materiais, Outros. Visível em cada edital e no dashboard /inteligencia.</p>
            </div>
            <DataAvailabilityBadge status="real" />
          </div>
          <div className={styles.statusRow}>
            <div>
              <strong>Perfis de fornecedores</strong>
              <p>Consulte os <Link href="/credores">credores</Link> e os registros disponíveis associados a cada fornecedor, com referências para conferir os dados.</p>
            </div>
            <DataAvailabilityBadge status="real" />
          </div>
          <div className={styles.statusRow}>
            <div>
              <strong>Resumos de documentos com apoio de IA</strong>
              <p>O catálogo de <Link href="/analises">análises de documentos</Link> reúne os resumos disponíveis. A cobertura é parcial, e as leituras devem ser conferidas nas fontes originais.</p>
            </div>
            <DataAvailabilityBadge status="parcial" />
          </div>
          <div className={styles.statusRow}>
            <div>
              <strong>Qualidade dos registros</strong>
              <p>A disponibilidade de texto, data, arquivo, resumo, produtos e resultado varia por documento. Campos ausentes devem ser tratados como lacunas da base, não como prova de irregularidade.</p>
            </div>
            <DataAvailabilityBadge status="parcial" />
          </div>
        </div>
      </SectionBlock>

      {/* Camada de inteligência */}
      <SectionBlock title="Como explorar as informações">
        <div className={styles.statusList}>
          <div className={styles.statusRow}>
            <div>
              <strong>Dashboard /inteligencia</strong>
              <p>Visão cruzada de contratos, fornecedores e categorias. Gastos por tema, ranking de fornecedores, licitações por ano e alertas de lacuna.</p>
            </div>
            <DataAvailabilityBadge status="real" />
          </div>
          <div className={styles.statusRow}>
            <div>
              <strong>Auditoria de qualidade</strong>
              <p>Score de prontidão por documento para orientar priorização de processamento. Visível em /admin/qualidade.</p>
            </div>
            <DataAvailabilityBadge status="real" />
          </div>
          <div className={styles.statusRow}>
            <div>
              <strong>Automação de coletas e IA</strong>
              <p>Documentos e resumos são atualizados pelo processamento do projeto. A atualização depende da disponibilidade das fontes e do andamento das tarefas; a base pode apresentar lacunas e atrasos.</p>
            </div>
            <DataAvailabilityBadge status="real" />
          </div>
        </div>
      </SectionBlock>

      {/* Princípios */}
      <SectionBlock title="Como a plataforma deve ser lida">
        <div className={styles.statusList}>
          <div className={styles.statusRow}>
            <div>
              <strong>Fonte oficial sempre visível</strong>
              <p>Todo resumo ou leitura aponta para documentos, arquivos ou páginas oficiais. O link original está sempre acessível.</p>
            </div>
          </div>
          <div className={styles.statusRow}>
            <div>
              <strong>IA como apoio, não como fonte</strong>
              <p>A IA resume, organiza e compara — mas não substitui a fonte oficial. Quando há divergência entre IA e documento, o documento prevalece.</p>
            </div>
          </div>
          <div className={styles.statusRow}>
            <div>
              <strong>Lacunas explícitas</strong>
              <p>Quando falta PNCP, fornecedor, vencedor, valor ou resumo, a interface sinaliza — sem preencher lacunas com estimativas não rastreáveis.</p>
            </div>
          </div>
          <div className={styles.statusRow}>
            <div>
              <strong>Dados verificáveis</strong>
              <p>Cada número tem origem rastreável: extração determinística, resumo IA com campo-fonte citado, ou dado do documento original.</p>
            </div>
          </div>
        </div>
      </SectionBlock>

      {/* Limitações */}
      <SectionBlock title="Limitações atuais">
        <div className={styles.statusList}>
          <div className={styles.statusRow}>
            <div>
              <strong>Cobertura IA histórica parcial</strong>
              <p>Nem todos os documentos possuem resumo ou texto extraído. Consulte o <Link href="/acervo">acervo</Link> e os arquivos originais; a existência de um resumo não comprova cobertura integral de um período.</p>
            </div>
          </div>
          <div className={styles.statusRow}>
            <div>
              <strong>Resultados de licitações podem estar incompletos</strong>
              <p>Vencedor, CNPJ e valor final podem não estar identificados nos registros consultados. Confira os atos de homologação e os documentos oficiais antes de concluir quem venceu ou quanto foi contratado.</p>
            </div>
          </div>
          <div className={styles.statusRow}>
            <div>
              <strong>PNCP com instabilidade</strong>
              <p>Falhas temporárias de acesso às fontes podem impedir consultas e cruzamentos. Uma consulta sem resultado não comprova que um processo deixou de ser publicado.</p>
            </div>
          </div>
          <div className={styles.statusRow}>
            <div>
              <strong>Administração protegida</strong>
              <p>A área administrativa é separada da consulta pública e exige autenticação.</p>
            </div>
          </div>
          <div className={styles.statusRow}>
            <div>
              <strong>Acervo do projeto</strong>
              <p>Os números apresentados descrevem os registros disponíveis no Ritápolis.com. Não representam necessariamente a totalidade das publicações nem o orçamento completo do município.</p>
            </div>
          </div>
        </div>
      </SectionBlock>
    </main>
  );
}
