// Espelho de slugParlamentar em src/camara/parlamentares.js: o link do nome de uma ata
// precisa cair no mesmo perfil que a API monta.
export function slugParlamentar(nome) {
  return String(nome || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .replace(/-junior(?=-|$)/g, '-jr');
}
