'use strict';

const { test, expect } = require('@playwright/test');

const ADMIN_STORAGE_KEY = 'monitor-ritapolis-admin-mode';

async function ativarModoInterno(page) {
  await page.addInitScript((key) => window.localStorage.setItem(key, 'true'), ADMIN_STORAGE_KEY);
}

// Doc 5: bug original (edital com "Final total R$ 38.520.000,00" pra um
// processo de R$ 176.186,20) — corrigido de vez pela reextração via IA
// (Fase F/G). A IA já processou este documento com confiança aceitável,
// então a estrutura agora é `origem_estrutura: 'ia'` e fica visível direto
// ao público, sem precisar de modo interno.
test.describe('Itens do processo — reextração via IA pública (doc 5)', () => {
  test('público vê os 3 blocos direto, sem precisar de modo interno', async ({ page }) => {
    await page.goto('/documento/5');

    await expect(page.getByRole('heading', { name: 'Itens deste processo' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /quem venceu \(por lote\)/i })).toBeVisible();

    // Lote real do bug original (EQUIPE DE APOIO / HYAGO / R$ 195.000), sem o
    // total inventado de R$ 38.520.000
    await expect(page.locator('body')).toContainText('195.000,00');
    await expect(page.locator('body')).toContainText('HYAGO');
    await expect(page.locator('body')).not.toContainText('38.520.000');

    // Nota honesta de que a extração foi assistida por IA
    await expect(page.getByText(/assistida por ia/i)).toBeVisible();
  });
});

// Doc 46: ainda só tem extração heurística (sem reprocessamento via IA) —
// prova que a regra "oculto do público até a IA cobrir o documento" (Fase A)
// continua valendo pros documentos que ainda não passaram pela Fase F/G.
test.describe('Itens do processo — oculto do público, visível em modo interno (doc 46, sem IA)', () => {
  test('público vê apenas a contagem, nunca os blocos de detalhamento', async ({ page }) => {
    await page.goto('/documento/46');
    const publico = page.locator('.public-only-placeholder');
    await expect(publico.getByText('Itens deste processo')).toBeVisible();
    await expect(publico.getByText(/em revisão de qualidade/i)).toBeVisible();

    await expect(page.getByRole('heading', { name: 'O que foi solicitado' })).toBeHidden();
  });

  test('modo interno mostra os blocos, com aviso de extração heurística', async ({ page }) => {
    await ativarModoInterno(page);
    await page.goto('/documento/46');

    await expect(page.getByRole('heading', { name: 'O que foi solicitado' })).toBeVisible();
    await expect(page.getByText(/extração heurística/i)).toBeVisible();
  });

  test('documento sem itens estruturados mostra placeholder honesto (regressão)', async ({ page }) => {
    // Doc 321: edital com muitos itens, sem reprocessamento via IA
    await page.goto('/documento/321');
    await expect(page.locator('.public-only-placeholder').getByText('Itens deste processo')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('38.520.000');
  });
});
