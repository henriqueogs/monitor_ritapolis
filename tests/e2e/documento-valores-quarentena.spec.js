'use strict';

const { test, expect } = require('@playwright/test');

const ADMIN_STORAGE_KEY = 'monitor-ritapolis-admin-mode';

async function ativarModoInterno(page) {
  await page.addInitScript((key) => window.localStorage.setItem(key, 'true'), ADMIN_STORAGE_KEY);
}

// Documento 178: registro de preços por lote com contexto de empenho — ainda
// na extração heurística (sem reprocessamento via IA), então continua atrás
// de modo interno (doc 5, o caso original, migrou pra IA — ver
// documento-itens-processo.spec.js). A UI nunca pode: (a) estampar totais
// derivados inventados nem (b) apresentar teto homologado como gasto sem
// contexto.
test.describe('Valores de itens: quarentena e contexto (doc 178, modo interno)', () => {
  test('teto homologado aparece com contexto e link pra ata de origem', async ({ page }) => {
    await ativarModoInterno(page);
    await page.goto('/documento/178');
    await expect(page.getByRole('heading', { name: 'Itens deste processo' }).first()).toBeVisible();

    // Teto homologado com contexto honesto
    await expect(page.getByText(/teto homologado/i).first()).toBeVisible();
    await expect(page.getByText(/empenhados até agora/).first()).toBeVisible();

    // §11.3 — link pra ata (anexo) de onde o valor veio, não pro edital
    const linkAta = page.locator('a[href^="/anexo/"]').first();
    await expect(linkAta).toBeVisible();
  });

  test('documento sem inconsistência não ganha aviso nem contexto (regressão)', async ({ page }) => {
    await ativarModoInterno(page);
    // Doc 321: 425 produtos com valor final, zero validações de plausibilidade
    await page.goto('/documento/321');
    await expect(page.getByRole('heading', { name: 'Itens deste processo' }).first()).toBeVisible();
    await expect(page.locator('body')).not.toContainText('Valor não confiável');
    await expect(page.locator('body')).not.toContainText('teto homologado');
  });
});
