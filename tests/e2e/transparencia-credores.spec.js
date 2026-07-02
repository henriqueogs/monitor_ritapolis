'use strict';

const { test, expect } = require('@playwright/test');

const DEEP_LINK_RE =
  /Detalhamento_Despesa\.php\?ID8_DESP=\d{8}&STR_EXR_EXR=\d{4}&CHAR_ID_EMP=1&LG_OP_DESP=[SN]/;

test.describe('Dinheiro público → credor → empenho (caminho feliz)', () => {
  test('padrão é o mandato em curso e todo card de métrica declara período', async ({ page }) => {
    await page.goto('/transparencia');
    await expect(page.getByRole('heading', { name: 'Dinheiro público' })).toBeVisible();

    // §11.1 — todo rótulo de métrica carrega ano ou intervalo
    const cards = page.locator('.admin-metric-card > span');
    const n = await cards.count();
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i += 1) {
      await expect(cards.nth(i)).toContainText(/\(\d{4}(–\d{4})?\)/);
    }

    // Padrão = mandato em curso destacado no seletor
    await expect(page.getByRole('navigation', { name: 'Período' })).toContainText('em curso');
  });

  test('seletor de período muda o escopo das métricas', async ({ page }) => {
    await page.goto('/transparencia');
    const labelPadrao = await page.locator('.admin-metric-card > span').first().textContent();

    await page.goto('/transparencia?exercicio=2024');
    const label2024 = await page.locator('.admin-metric-card > span').first().textContent();
    expect(label2024).toContain('(2024)');
    expect(label2024).not.toBe(labelPadrao);
  });

  test('nenhum link legado quebrado ?exercicio= para o portal', async ({ page }) => {
    await page.goto('/transparencia');
    const legados = page.locator('a[href*="Tempo_Real_Despesa?exercicio="]');
    await expect(legados).toHaveCount(0);
  });

  test('empenho recente tem deep-link real do portal', async ({ page }) => {
    await page.goto('/transparencia');
    const link = page.locator('a[href*="Detalhamento_Despesa.php"]').first();
    await expect(link).toBeVisible();
    const href = await link.getAttribute('href');
    expect(href).toMatch(DEEP_LINK_RE);
  });

  test('credor no top é link interno e o perfil pagina os empenhos', async ({ page }) => {
    await page.goto('/transparencia');
    const credorLink = page.locator('a[href^="/credores/"]').filter({ hasNotText: 'fornecedores' }).first();
    await expect(credorLink).toBeVisible();
    await credorLink.click();

    await expect(page).toHaveURL(/\/credores\/\d{14}/);
    await expect(page.getByText(/Total recebido \(\d{4}/)).toBeVisible();
    await expect(page.getByText(/Mandato \d{4}–\d{4}/).first()).toBeVisible();

    // Deep-link por empenho no perfil
    const linkEmpenho = page.locator('a[href*="Detalhamento_Despesa.php"]').first();
    await expect(linkEmpenho).toBeVisible();
    expect(await linkEmpenho.getAttribute('href')).toMatch(DEEP_LINK_RE);

    // Paginação quando há mais de uma página
    const proxima = page.getByRole('link', { name: 'Próxima →' });
    if (await proxima.count()) {
      await proxima.click();
      await expect(page).toHaveURL(/pagina=2/);
      await expect(page.getByText(/Pág\. 2 de/)).toBeVisible();
    }
  });
});
