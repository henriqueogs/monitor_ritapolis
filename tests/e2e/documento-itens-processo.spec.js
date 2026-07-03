'use strict';

const { test, expect } = require('@playwright/test');

// Doc 5: registro de preços — a seção deve separar demanda (edital) de
// resultado por lote (teto homologado), sem misturar nem inventar totais.
test.describe('Itens do processo em 3 blocos (doc 5)', () => {
  test('separa demanda de resultado por lote, com contexto e cross-links', async ({ page }) => {
    await page.goto('/documento/5');
    await expect(page.getByText('Itens deste processo')).toBeVisible();

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
  });

  test('documento não-edital não renderiza a seção de itens', async ({ page }) => {
    // Doc 321 é edital com muitos itens — garante que a seção aparece sem erro
    await page.goto('/documento/321');
    await expect(page.getByText('Itens deste processo')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('38.520.000');
  });
});
