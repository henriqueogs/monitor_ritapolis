'use strict';

const ColetorSitePrefeitura = require('./site-prefeitura');
const { inferTipo, normalizarNumeroBusca } = require('./site-prefeitura');

// Fragmento real devolvido por ws_consulta/Conteudo_Generico.php (busca por número).
const FRAGMENTO_BUSCA = `
<DIV id='contenedor_registro_generico'><div class='cadgen-flex-container'>
  <div class='informacao_generica'><span class='titulo_generico'>Processo nº</span><span class='valor_generico'>0054/2026&nbsp;</span></div>
  <div class='informacao_generica'><span class='titulo_generico'>Modalidade nº</span><span class='valor_generico'>Pregão Presencial Filmado nº 009/2026&nbsp;</span></div>
  <div class='informacao_generica'><span class='titulo_generico'>Data</span><span class='valor_generico'>19/06/2026&nbsp;</span></div>
  <div class='informacao_generica'><span class='titulo_generico'>Objeto</span><span class='valor_generico'>Aquisição de Artefatos de Cimento.&nbsp;</span></div>
  <div class='informacao_generica'><span class='titulo_generico'>Link do processo</span><span class='valor_generico'><a href='http://'>http://</a>&nbsp;</span></div>
</div>
<DIV class='informacao_generica'><span class='titulo_generico'>Anexos</span>
  <div class='cadgen-container-anexos'><DIV class='cadgen-arquivo-item'>
    <span>PDF</span>
    <span id='nome_arquivo_registro_generico' onClick='javascript:obterArquivoCadastroGenerico(246934)'>Edital_Cimento_2026.pdf</span>
    <span id='datahora_arquivo_registro_generico'>(10/06/2026 07:46:39)</span>
  </DIV></div></DIV></DIV>`;

describe('site-prefeitura · normalizarNumeroBusca', () => {
  it('iguala número com zeros à esquerda e espaços', () => {
    expect(normalizarNumeroBusca('0054/2026')).toBe(normalizarNumeroBusca('54/2026'));
    expect(normalizarNumeroBusca(' 0054 / 2026 ')).toBe(normalizarNumeroBusca('54/2026'));
  });

  it('mantém números distintos diferentes', () => {
    expect(normalizarNumeroBusca('0054/2026')).not.toBe(normalizarNumeroBusca('0055/2026'));
  });
});

describe('site-prefeitura · parseRecords (fragmento de busca)', () => {
  it('extrai número, data de publicação (datahora do anexo) e sessão', () => {
    const coletor = new ColetorSitePrefeitura();
    const [rec] = coletor.parseRecords('https://ritapolis.mg.gov.br/pagina/6668/editais', 'Editais', FRAGMENTO_BUSCA);
    expect(rec.numero).toBe('0054/2026');
    expect(rec.dataPublicacao).toBe('2026-06-10'); // datahora do anexo
    expect(rec.dataSessao).toBe('2026-06-19'); // campo "Data" = sessão futura
    expect(rec.attachments[0].fileId).toBe('246934');
  });
});

describe('site-prefeitura · inferTipo', () => {
  describe('modalidades de contratação já suportadas', () => {
    it('classifica pregão como edital', () => {
      expect(inferTipo('Pregão Eletrônico nº 001/2024')).toBe('edital');
    });

    it('classifica dispensa como edital', () => {
      expect(inferTipo('Dispensa nº 005/2026 - Contratação de fanfarra')).toBe('edital');
    });

    it('classifica inexigibilidade como edital', () => {
      expect(inferTipo('Inexigibilidade nº 008/2026')).toBe('edital');
    });
  });

  describe('modalidades de contratação que faltavam (regressão dos 58 documento_publico)', () => {
    it('classifica chamamento público como edital', () => {
      expect(inferTipo('Chamamento 001/2025 - Credenciamento de Oficineiros')).toBe('edital');
    });

    it('classifica chamada pública como edital', () => {
      expect(inferTipo('Chamada Pública nº 01/2022 - Aquisição de gêneros da Agricultura Familiar')).toBe(
        'edital'
      );
    });

    it('classifica credenciamento como edital', () => {
      expect(inferTipo('Credenciamento nº 005/2025 - Instituição Financeira')).toBe('edital');
    });

    it('classifica concorrência pública como edital', () => {
      expect(inferTipo('Concorrência Pública nº 01/2022 - Contratação de empresa')).toBe('edital');
    });

    it('classifica leilão como edital', () => {
      expect(inferTipo('LEILÃO 003/2025 - Venda de veículos e sucatas')).toBe('edital');
    });

    it('classifica tomada de preços como edital', () => {
      expect(inferTipo('Tomada de Preços nº 002/2023')).toBe('edital');
    });

    it('classifica concessão de espaço público como edital', () => {
      expect(inferTipo('Concessão de Espaço Público - Exposição Agropecuária 2025')).toBe('edital');
    });

    it('tolera o erro de digitação "Inexibilidade"', () => {
      expect(inferTipo('Inexibilidade n° 008/2026 - Contratação de empresa')).toBe('edital');
    });
  });

  describe('não-licitações permanecem documento_publico', () => {
    it('convocação de conselheira tutelar não é edital', () => {
      expect(inferTipo('CONVOCAÇÃO DE CONSELHEIRA TUTELAR SUPLENTE nº 04/2025')).toBe(
        'documento_publico'
      );
    });

    it('permanência de conselheira tutelar não é edital', () => {
      expect(inferTipo('PERMANÊNCIA DE CONSELHEIRA TUTELAR SUPLENTE nº 001')).toBe(
        'documento_publico'
      );
    });
  });

  describe('outros tipos continuam corretos', () => {
    it('decreto', () => {
      expect(inferTipo('Decreto nº 1.234/2024')).toBe('decreto');
    });

    it('portaria', () => {
      expect(inferTipo('Portaria nº 045/2024')).toBe('portaria');
    });

    it('lei no título', () => {
      expect(inferTipo('Lei nº 001/2024')).toBe('lei');
    });
  });
});
