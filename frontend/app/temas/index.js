import Link from 'next/link';
import AnimatedChartPanel from '../components/AnimatedChartPanel';
import CategoriaBadge from '../components/CategoriaBadge';
import DataAvailabilityBadge from '../components/DataAvailabilityBadge';
import SectionBlock from '../components/SectionBlock';
import { fetchAnalisesResumos, fetchInteligenciaPanorama } from '../lib/api';
import RecentThemeAnalyses from './components/RecentThemeAnalyses';
import styles from './styles.module.css';

const DESCRICOES = {
  'Alimentação':              'Merenda escolar, gêneros alimentícios, chamadas públicas e rancho.',
  'Saúde':                    'Vacinas, medicamentos, consórcios de saúde, veterinário e laboratórios.',
  'Educação':                 'Escola, creche, material didático, uniforme escolar e transporte escolar.',
  'Cultura e Eventos':        'Shows, bandas, cantores, rodeios, festas, exposições e contratações artísticas.',
  'Obras e Infraestrutura':   'Construção, reforma, pavimentação, redes elétricas e de água.',
  'Serviços':                 'Contabilidade, vigilância, limpeza, eventos, locações e transporte.',
  'Equipamentos e Materiais': 'Veículos, informática, mobiliário, uniformes e ferramentas.',
  'Outros':                   'Licitações sem classificação clara pelas palavras-chave disponíveis.'
};

export default async function TemasPage() {
  const [panorama, analises] = await Promise.all([
    fetchInteligenciaPanorama().catch(() => null),
    fetchAnalisesResumos({ limite: 8 }).catch(() => ({ itens: [] }))
  ]);

  const categorias = panorama?.por_categoria || [];
  const totalMax = Math.max(...categorias.map((c) => c.total), 1);

  const chartItems = categorias
    .filter((c) => c.categoria !== 'Outros')
    .map((c) => ({
      label: c.categoria,
      value: c.total,
      valueLabel: `${c.total}`
    }));

  return (
    <main className="page-container">
      <div className="page-title">
        <div>
          <h1>Temas públicos</h1>
          <p>Navegue pelas licitações de Ritápolis por assunto. Classificação por palavras-chave sobre os documentos oficiais coletados.</p>
        </div>
        <DataAvailabilityBadge status="real" />
      </div>

      <section className="topic-hero">
        <div>
          <h2>Categorias baseadas em dados reais</h2>
          <p>Cada categoria filtra as licitações classificadas pelo sistema. Clique em uma para ver os editais correspondentes.</p>
        </div>
        <Link href="/inteligencia" className="button button-primary">Ver inteligência</Link>
      </section>

      {categorias.length > 0 && (
        <SectionBlock title="Categorias de contratação">
          <div className="quality-list">
            {categorias.map((c) => {
              const pct = Math.round((c.total / totalMax) * 100);
              return (
                <Link
                  key={c.categoria}
                  href={`/licitacoes?categoria=${encodeURIComponent(c.categoria)}`}
                  className="quality-row"
                >
                  <div>
                    <strong style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <CategoriaBadge categoria={c.categoria} />
                      <span style={{ fontSize: 13, opacity: 0.6, fontWeight: 400 }}>
                        {DESCRICOES[c.categoria] || ''}
                      </span>
                    </strong>
                    <div style={{ marginTop: 8, height: 4, background: 'var(--surface-muted)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)', borderRadius: 2 }} />
                    </div>
                  </div>
                  <span>{c.total}</span>
                </Link>
              );
            })}
          </div>
        </SectionBlock>
      )}

      <div className={styles.contentGrid}>
        {chartItems.length > 0 && (
          <AnimatedChartPanel
            title="Distribuição por categoria"
            description="Licitações classificadas por tema — excluindo 'Outros'."
            items={chartItems}
          />
        )}
        <RecentThemeAnalyses itens={analises.itens || []} />
      </div>

      <SectionBlock
        title="Outras entradas"
        description="Portas de entrada por natureza documental ou fonte."
      >
        <div className="quality-list">
          <Link href="/licitacoes" className="quality-row">
            <div><strong>Todas as licitações</strong><p>Editais, pregões, dispensas e compras públicas de Ritápolis.</p></div>
            <span>→</span>
          </Link>
          <Link href="/analises" className="quality-row">
            <div><strong>Análises verificáveis</strong><p>Leituras feitas por IA sobre documentos com fonte identificada.</p></div>
            <span>→</span>
          </Link>
        </div>
      </SectionBlock>
    </main>
  );
}
