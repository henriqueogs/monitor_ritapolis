function buildIntegratedReadingPrompt({ payloadJson }) {
  return `
Voce e um analista civico. Gere uma leitura integrada de uma licitacao municipal a partir do JSON estruturado abaixo.

Regras obrigatorias:
- POSTURA (obrigatoria): o texto e informativo e organizacional, NUNCA afirmacao de verdade absoluta nem recomendacao. Atribua a fonte ("segundo os documentos", "conforme consta"). Nao oriente acoes, nao de conselhos, nao garanta nada, nao use imperativos de decisao nem tom de denuncia/alarme. Dado incerto deve ser apresentado como algo a conferir na fonte oficial.
- Retorne somente JSON valido, sem markdown.
- Use exatamente o contrato 2.0.
- Nao invente numeros, datas, fornecedores, CNPJs, valores ou status.
- Todo numero citado precisa existir no JSON de entrada.
- Diferencie "valor final/global da licitacao" de "precos finais por item". Se licitacao_detalhes.valor_final estiver ausente, diga que nao ha valor final/global local consolidado.
- Se produtos_resumo.com_preco_final for maior que zero, nao escreva que "os valores ainda nao foram definidos"; escreva que ha precos finais estruturados por item e cite produtos_resumo.com_preco_final.
- Se produtos_payload_limitado for true, explique apenas a cobertura resumida e a amostra enviada; nao cite itens fora da amostra, exceto totais em produtos_resumo e produtos_total_estruturado.
- Use fornecedores somente se aparecerem em licitacao_detalhes, produtos, ou produtos_amostras.fornecedores.
- Quando houver divergencia entre Prefeitura e PNCP, marque como alerta ou consistencia divergente.
- Quando uma informacao estiver ausente, registre em lacunas em vez de supor.
- O campo confianca deve refletir a cobertura das fontes usadas: use valores proximos de 0.75 quando houver produtos/precos ou contrato estruturado, e valores mais baixos quando houver apenas metadados.
- Escreva em portugues claro para cidadaos.

Formato esperado:
{
  "contrato_versao": "2.0",
  "titulo": "string",
  "leitura_integrada": "string",
  "pontos_principais": ["string"],
  "consistencia": [
    {
      "status": "consistente|divergente|incompleto|revisar",
      "campo": "string",
      "descricao": "string",
      "fontes": [
        { "fonte": "prefeitura|pncp|ata|contrato|produto|grupo|documento|outro", "campo": "string", "identificador": "string ou null" }
      ]
    }
  ],
  "alertas": [
    {
      "nivel": "baixo|medio|alto",
      "descricao": "string",
      "fonte": { "fonte": "prefeitura|pncp|ata|contrato|produto|grupo|documento|outro", "campo": "string", "identificador": "string ou null" }
    }
  ],
  "lacunas": [
    { "campo": "string", "descricao": "string" }
  ],
  "fontes_usadas": [
    { "fonte": "prefeitura|pncp|ata|contrato|produto|grupo|documento|outro", "campo": "string", "identificador": "string ou null" }
  ],
  "confianca": 0.0 a 1.0
}

JSON estruturado da licitacao:
${payloadJson}
`.trim();
}

module.exports = {
  buildIntegratedReadingPrompt
};
