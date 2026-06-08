import SectionBlock from '../components/SectionBlock';
import DataAvailabilityBadge from '../components/DataAvailabilityBadge';
import styles from './styles.module.css';

export const metadata = {
  title: 'Sobre — Monitor Ritápolis',
  description: 'Como o Monitor Ritápolis funciona, o que monitora e quais são os limites atuais.'
};

export default function SobrePage() {
  return (
    <main className="page-container">
      <div className="page-title">
        <div>
          <h1>Sobre o Monitor Ritápolis</h1>
          <p>
            Uma plataforma de inteligência pública verificável para Ritápolis/MG. Coleta documentos
            oficiais, estrutura os dados com parsers determinísticos e enriquece com IA — sempre com
            rastreabilidade da fonte original.
          </p>
        </div>
        <DataAvailabilityBadge status="real" />
      </div>

      {/* Fontes monitoradas */}
      <SectionBlock title="O que é monitorado">
        <div className={styles.statusList}>
          <div className={styles.statusRow}>
            <div>
              <strong>Prefeitura Municipal de Ritápolis</strong>
              <p>Editais, licitações, dispensas, contratos, atas e demais publicações do portal oficial. Coleta automática a cada 12 horas. 532 registros processados.</p>
            </div>
            <DataAvailabilityBadge status="real" />
          </div>
          <div className={styles.statusRow}>
            <div>
              <strong>Câmara Municipal de Ritápolis</strong>
              <p>Leis, decretos, portarias, resoluções e atos legislativos. 13 registros coletados.</p>
            </div>
            <DataAvailabilityBadge status="real" />
          </div>
          <div className={styles.statusRow}>
            <div>
              <strong>Portal Nacional de Contratações Públicas (PNCP)</strong>
              <p>Fonte nacional complementar para cruzamento de dados de licitações. A API externa apresenta instabilidade intermitente — dados são vinculados quando disponíveis.</p>
            </div>
            <DataAvailabilityBadge status="parcial" />
          </div>
          <div className={styles.statusRow}>
            <div>
              <strong>Portal de Transparência financeira</strong>
              <p>Despesas, empenhos e pagamentos do município. Integração planejada para fechar o ciclo contratação → pagamento.</p>
            </div>
            <DataAvailabilityBadge status="pendente" />
          </div>
        </div>
      </SectionBlock>

      {/* Estado atual */}
      <SectionBlock title="Estado atual da base (junho 2026)">
        <div className={styles.statusList}>
          <div className={styles.statusRow}>
            <div>
              <strong>545 documentos cadastrados — 494 licitações</strong>
              <p>Inclui editais, dispensas, pregões, chamadas públicas, atas e extratos. Os demais são leis, decretos e portarias da Câmara.</p>
            </div>
            <DataAvailabilityBadge status="real" />
          </div>
          <div className={styles.statusRow}>
            <div>
              <strong>R$ 3,08 milhões em valores identificados</strong>
              <p>Soma de contratos homologados com vencedor registrado e produtos licitados com preço estruturado. 14 licitações com vencedor identificado.</p>
            </div>
            <DataAvailabilityBadge status="real" />
          </div>
          <div className={styles.statusRow}>
            <div>
              <strong>495 licitações classificadas em 7 categorias</strong>
              <p>Classificação determinística por palavras-chave: Saúde, Alimentação, Educação, Obras e Infraestrutura, Serviços, Equipamentos e Materiais, Outros. Visível em cada edital e no dashboard /inteligencia.</p>
            </div>
            <DataAvailabilityBadge status="real" />
          </div>
          <div className={styles.statusRow}>
            <div>
              <strong>25 fornecedores com perfil consolidado</strong>
              <p>CNPJs agregados de produtos licitados e contratos homologados, com total contratado, vitórias e anos de atividade.</p>
            </div>
            <DataAvailabilityBadge status="real" />
          </div>
          <div className={styles.statusRow}>
            <div>
              <strong>57 documentos com resumo IA — 430 pendentes</strong>
              <p>Resumos gerados via NVIDIA (modelo llama-3.1-70b). Cobertura completa nos editais de 2026. Scheduler automático processa 10 documentos por dia priorizando anos mais recentes.</p>
            </div>
            <DataAvailabilityBadge status="parcial" />
          </div>
          <div className={styles.statusRow}>
            <div>
              <strong>Score médio de prontidão: 48,9 / 100</strong>
              <p>Calculado por documento considerando texto extraído, resumo IA, data, arquivo, produtos e vencedor. 2026 lidera com 75,6. Detalhes em /admin/qualidade.</p>
            </div>
            <DataAvailabilityBadge status="parcial" />
          </div>
        </div>
      </SectionBlock>

      {/* Camada de inteligência */}
      <SectionBlock title="Camada de inteligência pública (v0.6)">
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
              <p>Coleta automática a cada 12 horas. Resumos IA gerados em lotes diários sem intervenção manual.</p>
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
              <p>430 documentos ainda aguardam resumo. O scheduler processa 10 por dia — cobertura completa estimada em 43 dias ao ritmo atual.</p>
            </div>
          </div>
          <div className={styles.statusRow}>
            <div>
              <strong>97% das licitações sem vencedor registrado</strong>
              <p>A leitura integrada (que identifica vencedor, CNPJ e valor final) foi feita para editais de 2026. Anos anteriores estão sendo priorizados pelo scheduler.</p>
            </div>
          </div>
          <div className={styles.statusRow}>
            <div>
              <strong>PNCP com instabilidade</strong>
              <p>A API do Portal Nacional de Contratações Públicas retorna timeout e erro 503 com frequência. Dados de cruzamento ficam indisponíveis nesses períodos.</p>
            </div>
          </div>
          <div className={styles.statusRow}>
            <div>
              <strong>Sem autenticação administrativa</strong>
              <p>A área /admin não exige login nesta fase. O projeto ainda não está publicado em servidor público.</p>
            </div>
          </div>
          <div className={styles.statusRow}>
            <div>
              <strong>Banco local SQLite</strong>
              <p>Dados em banco local. Não há sincronização com servidor externo nesta fase.</p>
            </div>
          </div>
        </div>
      </SectionBlock>
    </main>
  );
}
