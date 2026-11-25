import {
  Archive,
  Briefcase,
  Building2,
  FileSignature,
  FileText,
  Gavel,
  Info,
  Landmark,
  Lightbulb,
  ListChecks,
  Megaphone,
  PieChart,
  Plane,
  ScrollText,
  Search,
  ShoppingCart,
  Stamp,
  Tags,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';

/**
 * Fonte única do mapa do site: áreas → grupos → módulos.
 * Home, páginas de área e menu do topo leem daqui, para nunca divergirem.
 *
 * Módulo = conjunto de dados com lista + filtros + detalhe + fonte.
 * Visões (panorama, "para onde vai") moram dentro da página da área, não aqui.
 */
export const AREAS = [
  {
    id: 'dinheiro',
    titulo: 'Dinheiro público',
    href: '/transparencia',
    icone: Landmark,
    descricao: 'De onde vem e para onde vai o dinheiro da Prefeitura.',
    grupos: [
      {
        titulo: 'Entrada',
        modulos: [
          { href: '/emendas', titulo: 'Emendas parlamentares', pergunta: 'Que recursos vieram de deputados?', icone: Wallet },
        ],
      },
      {
        titulo: 'Compras e gastos',
        modulos: [
          { href: '/licitacoes', titulo: 'Licitações', pergunta: 'O que a Prefeitura está comprando?', icone: Gavel },
          { href: '/transparencia/empenhos', titulo: 'Empenhos', pergunta: 'Cada gasto, do mais recente ao mais antigo', icone: ShoppingCart },
          { href: '/credores', titulo: 'Credores', pergunta: 'Quem recebe dinheiro?', icone: Building2 },
          { href: '/transparencia/finalidades', titulo: 'Finalidades', pergunta: 'Com o que se gasta? Saúde, educação, obras…', icone: PieChart },
        ],
      },
      {
        titulo: 'Pessoal',
        modulos: [
          { href: '/transparencia/servidores', titulo: 'Folha de servidores', pergunta: 'Quanto ganham os servidores?', icone: Briefcase },
          { href: '/transparencia/categoria/diarias', titulo: 'Diárias', pergunta: 'Quem viajou a serviço?', icone: Plane },
        ],
      },
    ],
  },
  {
    id: 'atos',
    titulo: 'Atos oficiais',
    href: '/legislacao',
    icone: ScrollText,
    descricao: 'O que a Prefeitura decreta e o que a Câmara vota.',
    grupos: [
      {
        titulo: 'Prefeitura',
        modulos: [
          { href: '/legislacao?tipo=lei_ordinaria', titulo: 'Leis', pergunta: 'Quais leis valem na cidade?', icone: ScrollText },
          { href: '/legislacao?tipo=decreto', titulo: 'Decretos', pergunta: 'O que o prefeito decretou?', icone: Stamp },
          { href: '/legislacao?tipo=portaria', titulo: 'Portarias', pergunta: 'Nomeações e atos administrativos', icone: FileSignature },
        ],
      },
      {
        titulo: 'Câmara Municipal',
        modulos: [
          { href: '/legislacao/camara/projetos', titulo: 'Projetos em tramitação', pergunta: 'O que está sendo votado?', icone: ListChecks },
          { href: '/legislacao/camara/sessoes', titulo: 'Sessões', pergunta: 'O que aconteceu nas sessões?', icone: Megaphone },
          { href: '/legislacao/camara/vereadores', titulo: 'Vereadores', pergunta: 'Quem são e o que propõem?', icone: Users },
          { href: '/legislacao?tipo=indicacao', titulo: 'Indicações', pergunta: 'Pedidos dos vereadores à Prefeitura', icone: Lightbulb },
        ],
      },
    ],
  },
];

/** Ferramentas que atravessam as áreas. */
export const FERRAMENTAS = [
  { href: '/na-lupa', titulo: 'Na Lupa', icone: Search },
  { href: '/temas', titulo: 'Temas', icone: Tags },
  { href: '/analises', titulo: 'Análises', icone: FileText },
  { href: '/inteligencia', titulo: 'Evolução de preços', icone: TrendingUp },
  { href: '/acervo', titulo: 'Acervo completo', icone: Archive },
  { href: '/sobre', titulo: 'Sobre / Metodologia', icone: Info },
];

export function areaPorId(id) {
  return AREAS.find((area) => area.id === id);
}
