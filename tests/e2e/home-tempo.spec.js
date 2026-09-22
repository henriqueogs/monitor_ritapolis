'use strict';

const { test, expect } = require('@playwright/test');

// Guardrail da Fase 5 do plano de performance
// (docs/PLANO_PERFORMANCE_CARREGAMENTO.md): a home nao pode voltar a esperar
// chamadas de rede no caminho de renderizacao (ex.: verificacao sincrona da
// Prefeitura, Fase 1). @perf porque tempo de resposta varia com a maquina --
// rodar isolado em CI noturno se ficar instavel.
test.describe('Home - tempo de resposta @perf', () => {
  test('home renderiza (domcontentloaded) em menos de 3s', async ({ page }) => {
    // 1a visita em `next dev` compila a rota sob demanda (10s+ so de webpack,
    // sem relacao com o que este guardrail mede) -- aquece antes de cronometrar.
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const inicio = Date.now();
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const decorrido = Date.now() - inicio;

    expect(decorrido).toBeLessThan(3000);
  });
});
