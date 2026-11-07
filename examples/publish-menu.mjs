import { publicMenu, whatsappLink } from '../src/public-menu.mjs';
const menu = publicMenu({ template: 'pizzeria-v1', slug: 'pizza-demo', name: 'Pizzaria de demonstração',
  whatsapp: '5511999999999', items: [{ id: 'margherita', name: 'Margherita', priceCents: 4500, active: true }] });
console.log(JSON.stringify(menu, null, 2));
console.log(whatsappLink(menu, 'margherita'));
