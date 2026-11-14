import { readFile } from 'node:fs/promises';

// Vitrine de exemplo com foto no hero e destaques (issue #131), a partir de loja1.
export async function heroPhotoDraft() {
  const loja1 = JSON.parse(await readFile(new URL('../../content/vitrines/loja1.json', import.meta.url), 'utf8'));
  return {
    ...loja1,
    slug: 'forno-praca-destaques',
    structure: {
      pages: [{
        slug: 'home',
        title: 'Início',
        sections: [
          {
            id: 'abertura',
            moduleCode: 'hero',
            config: {
              eyebrow: 'Pizzaria de bairro desde 2012',
              headline: 'Pizza de fermentação natural, assada na hora',
              subtitle: 'Massa descansada por 48 horas, forno a lenha e ingredientes de pequenos produtores.',
              imageUrl: '/assets/pizza-demo.webp',
              imageAlt: 'Pizza margherita inteira sobre mesa de pedra clara, com manjericão fresco',
              primaryAction: { label: 'Ver a vitrine', target: 'selecao' },
              secondaryAction: { label: 'Conversar no WhatsApp', target: 'whatsapp' }
            }
          },
          {
            id: 'destaques',
            moduleCode: 'highlights',
            config: {
              items: [
                { icon: 'relogio', text: 'Massa com 48 horas de fermentação' },
                { icon: 'entrega', text: 'Entrega no bairro em até 40 minutos' },
                { icon: 'local', text: 'Retirada no balcão da praça' },
                { icon: 'mensagem', text: 'Pedido direto pelo WhatsApp' }
              ]
            }
          },
          { id: 'itens', moduleCode: 'catalog_grid', config: { columns: 2 } },
          { id: 'sobre', moduleCode: 'about_story', config: { bio: 'Forno a lenha aceso todas as noites, de terça a domingo.' } }
        ]
      }]
    }
  };
}
