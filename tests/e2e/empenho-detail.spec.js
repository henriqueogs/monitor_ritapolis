'use strict';

const { test, expect } = require('@playwright/test');

const DEEP_LINK_RE =
  /Detalhamento_Despesa\.php\?ID8_DESP=\d{8}&STR_EXR_EXR=\d{4}&CHAR_ID_EMP=1&LG_OP_DESP=[SN]/;

test.describe('Página do empenho (caminho feliz)', () => {
  test('empenho recente abre a página interna com histórico, período e portal', async ({ page }) => {
    await page.goto('/transparencia');
    const linkEmpenho = page.locator('a[href^="/empenho/"]').first();
    await expect(linkEmpenho).toBeVisible();
    await linkEmpenho.click();

    await expect(page).toHaveURL(/\/empenho\/\d+/);
    await expect(page.getByRole('heading', { name: /Empenho \d{5}-\d{3}/ })).toBeVisible();

    // §11.1 — valor com exercício explícito
    await expect(page.getByText(/O que foi este gasto \(\d{4}\)/)).toBeVisible();
    await expect(page.getByText(/Valor \(\d{4}\)/)).toBeVisible();

    // Linha do tempo cidadã
    await expect(page.getByText('Do compromisso ao pagamento')).toBeVisible();
    await expect(page.getByText('Empenhado', { exact: true })).toBeVisible();

    // §11.3 — deep-link real do portal
    const portal = page.locator('a[href*="Detalhamento_Despesa.php"]').first();
    await expect(portal).toBeVisible();
    expect(await portal.getAttribute('href')).toMatch(DEEP_LINK_RE);

    // Classificação orçamentária presente
    await expect(page.getByText('De onde saiu o dinheiro')).toBeVisible();
  });

  test('empenho inexistente não quebra a aplicação', async ({ page }) => {
    const resp = await page.goto('/empenho/99999999');
    expect(resp.status()).toBeLessThan(500);
    await expect(page.getByRole('heading', { name: /Empenho não encontrado/i })).toBeVisible();
  });

  test('perfil do credor linka pro empenho interno', async ({ page }) => {
    await page.goto('/credores/01991246000135');
    const link = page.locator('a[href^="/empenho/"]').first();
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/\/empenho\/\d+/);
    await expect(page.getByRole('heading', { name: /Empenho/ })).toBeVisible();
  });
});
