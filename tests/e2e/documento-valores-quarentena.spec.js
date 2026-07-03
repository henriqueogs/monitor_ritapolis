'use strict';

const { test, expect } = require('@playwright/test');

// Documento 5: registro de preços — a ata homologa TETOS por lote (ex.:
// R$ 195.000 no lote 1) enquanto o processo tem R$ 176.186,20 empenhados.
// A UI nunca pode: (a) estampar totais derivados inventados (38,5M) nem
// (b) apresentar teto homologado como gasto sem contexto.
test.describe('Valores de itens: quarentena e contexto (doc 5)', () => {
  test('teto homologado aparece com contexto e link pra ata de origem', async ({ page }) => {
    await page.goto('/documento/5');
    await expect(page.getByText('Itens deste processo')).toBeVisible();

    // O total inventado (4.815.000 × 8) não aparece em lugar nenhum
    await expect(page.locator('body')).not.toContainText('38.520.000');

    // Teto homologado com contexto honesto
    await expect(page.getByText(/teto homologado/i).first()).toBeVisible();
    await expect(page.getByText(/empenhados até agora/).first()).toBeVisible();

    // §11.3 — link pra ata (anexo) de onde o valor veio, não pro edital
    const linkAta = page.locator('a[href^="/anexo/"]').first();
    await expect(linkAta).toBeVisible();
  });

  test('documento sem inconsistência não ganha aviso nem contexto (regressão)', async ({ page }) => {
    // Doc 321: 425 produtos com valor final, zero validações de plausibilidade
    await page.goto('/documento/321');
    await expect(page.getByText('Itens deste processo')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('Valor não confiável');
    await expect(page.locator('body')).not.toContainText('teto homologado');
  });
});
