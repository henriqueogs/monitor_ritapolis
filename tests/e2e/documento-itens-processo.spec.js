'use strict';

const { test, expect } = require('@playwright/test');

const ADMIN_STORAGE_KEY = 'monitor-ritapolis-admin-mode';

async function ativarModoInterno(page) {
  await page.addInitScript((key) => window.localStorage.setItem(key, 'true'), ADMIN_STORAGE_KEY);
};

// Doc 5: registro de preços — extração ainda é heurística/regex e falha em
// documentos fora de padrão (doc 605 prova isso). Até a reextração via IA
// cobrir o documento, o detalhamento fica oculto do público (§11 — nunca
// dado incerto como se fosse fato); só visível em modo interno.
test.describe('Itens do processo — oculto do público, visível em modo interno (doc 5)', () => {
  test('público vê apenas a contagem, nunca os blocos de detalhamento', async ({ page }) => {
    await page.goto('/documento/5');
    const publico = page.locator('.public-only-placeholder');
    await expect(publico.getByText('Itens deste processo')).toBeVisible();
    await expect(publico.getByText(/em revisão de qualidade/i)).toBeVisible();

    await expect(page.getByRole('heading', { name: 'O que foi solicitado' })).toBeHidden();
    await expect(page.getByRole('heading', { name: /quem venceu \(por lote\)/i })).toBeHidden();
    await expect(page.locator('body')).not.toContainText('38.520.000');
  });

  test('modo interno mostra os 3 blocos, com contexto e cross-links', async ({ page }) => {
    await ativarModoInterno(page);
    await page.goto('/documento/5');

    // Bloco ① demanda e bloco ② resultado por lote existem e são distintos
    await expect(page.getByRole('heading', { name: 'O que foi solicitado' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /quem venceu \(por lote\)/i })).toBeVisible();

    // Teto homologado com contexto honesto; total inventado não aparece
    await expect(page.getByText(/teto homologado/i).first()).toBeVisible();
    await expect(page.locator('body')).not.toContainText('38.520.000');

    // Cross-links: vencedor → credor (perfil por CNPJ ou busca por nome); fonte → ata (anexo)
    await expect(page.locator('a[href^="/credores"]').first()).toBeVisible();
    await expect(page.locator('a[href^="/anexo/"]').first()).toBeVisible();

    // Ruído de parser colapsado, não solto na lista
    await expect(page.getByText(/linha descartada|linhas descartadas/i)).toBeVisible();

    // Aviso explícito de que a extração ainda é heurística, não IA
    await expect(page.getByText(/extração heurística/i)).toBeVisible();
  });

  test('documento sem itens estruturados mostra placeholder honesto (regressão)', async ({ page }) => {
    // Doc 321 é edital com muitos itens — garante que a seção aparece sem erro
    await page.goto('/documento/321');
    await expect(page.locator('.public-only-placeholder').getByText('Itens deste processo')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('38.520.000');
  });
});
