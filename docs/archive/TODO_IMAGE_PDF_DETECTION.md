# ✅ TODO — Detecção Automática de PDFs de Imagem

## v0.8.1 — Completo ✅

- [x] Criar `isImageBasedPdf()` em `src/parsers/pdf.js`
- [x] Expandir OCR para todos os tipos de documento
- [x] Criar `scripts/detectar-pdfs-imagem.js`
- [x] Criar `src/parsers/auto-detect-image-pdf.js`
- [x] Testar em documento 648 — ✅ Sucesso
- [x] Documentação em `IMPROVEMENTS_IMAGE_PDF_DETECTION.md`

---

## v0.9 — Recomendado

### Testes Unitários
- [ ] `src/parsers/auto-detect-image-pdf.test.js` — Testar `isImageBasedPdf()` com casos reais
  - [ ] Caso: Texto legível ➜ retorna `false`
  - [ ] Caso: Texto muito curto ➜ retorna `true`
  - [ ] Caso: Proporção baixa de alfanuméricos ➜ retorna `true`
  - [ ] Caso: Padrões de lixo ➜ retorna `true`

### Integração no Coletor
- [ ] Modificar `src/coletores/site-prefeitura.js`
  - [ ] Após `extractPdfText()`, chamar `checkAndMarkImageBasedPdf()`
  - [ ] Definir `status_coleta` automaticamente ("imagem" ou "ok")
  
- [ ] Modificar `src/coletores/pncp.js` (mesma lógica)

- [ ] Modificar `src/coletores/camara-sapl.js` (mesma lógica)

### Scheduler Periódico
- [ ] Criar `src/ai/image-detection-scheduler.js`
  - [ ] Rodar a cada 6 horas: `npm run ocr:detectar -- --apply --limite=30`
  - [ ] Log: documentos detectados e marcados
  - [ ] Trigger automático de OCR

- [ ] Adicionar ao `package.json`:
  ```json
  "detection-scheduler": "node src/ai/image-detection-scheduler.js"
  ```

### Interface Admin
- [ ] Criar rota `GET /api/admin/ocr/status` — Listar documentos 'imagem' pendentes
- [ ] Criar rota `POST /api/admin/ocr/mark/:id` — Marcar manualmente como 'imagem'
- [ ] Criar rota `DELETE /api/admin/ocr/mark/:id` — Desmarcar (reversão)
- [ ] Criar página `/admin/ocr` em frontend — UI para revisar/ajustar

### Documentação
- [ ] Atualizar `CLAUDE.md` §2.1 (Arquitetura) — Adicionar camada de detecção automática
- [ ] Atualizar `DEVELOPMENT_PLAN.md` — Incorporar na v0.9
- [ ] Criar `OCR_GUIDE.md` — Como usar detecção e OCR

---

## v1.0 — Expansões Futuras

- [ ] Integração com Tesseract.js em worker — paralelizar OCR para múltiplos documentos
- [ ] Detecção de idioma — adaptar OCR para PT-BR, ES, etc.
- [ ] Confiança de OCR — armazenar score de qualidade
- [ ] Alternativas: Google Vision API, Amazon Textract para PDFs complexos

---

## Notas

- **Critérios de detecção:** Balanceados para minimizar falsos positivos. Se necessário revisar, ajustar thresholds em `isImageBasedPdf()`.
- **Performance:** Detecção é O(n) — linear no tamanho do texto. Escalável até ~10K documentos.
- **Reversão:** Qualquer documento marcado pode ser revertido sem perda de dados — apenas muda `status_coleta`.
- **Auditoria:** Flag `auto_detect_imagem=1` rastreia documentos auto-detectados vs. marcados manualmente.

---

**Last Updated:** 2026-06-16  
**Owner:** Implementação Automática (GitHub Copilot)
