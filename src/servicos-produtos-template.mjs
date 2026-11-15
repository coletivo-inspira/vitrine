// Modelo "Serviços e produtos" (issue #136). Espelha a linha de `public.templates`
// gravada em supabase/migrations/20261116001400_template_servicos_produtos.sql; o
// teste test/servicos-produtos-template.test.mjs garante que os dois não divergem.
// Receita e porquê de cada seção: docs/modelo-servicos-e-produtos.md.

export const SERVICES_PRODUCTS_TEMPLATE_CODE = 'servicos-produtos-v1';
export const BUSINESS_PAGE_SLUG = 'empresas';

const sections = [
  {
    id: 'sec-abertura',
    moduleCode: 'hero',
    config: {
      eyebrow: 'Sua profissão ou especialidade',
      headline: 'Conte em uma frase para quem é o seu trabalho',
      subtitle: 'Explique em uma ou duas linhas o que a pessoa encontra aqui e como você atende.',
      primaryAction: { label: 'Ver serviços e produtos', target: 'selecao' },
      secondaryAction: { label: 'Conversar no WhatsApp', target: 'whatsapp' }
    }
  },
  {
    id: 'sec-destaques',
    moduleCode: 'highlights',
    config: {
      items: [
        { icon: 'online', text: 'Diga como atende: online, presencial ou os dois' },
        { icon: 'pessoas', text: 'Conte para quem é: individual, grupo ou turma' },
        { icon: 'garantia', text: 'Escreva uma condição que dá segurança' },
        { icon: 'mensagem', text: 'Atendimento direto pelo WhatsApp' }
      ]
    }
  },
  { id: 'sec-itens', moduleCode: 'catalog_grid', config: { columns: 2 } },
  {
    id: 'sec-sobre',
    moduleCode: 'about_story',
    config: {
      bio: 'Conte sua história: há quanto tempo faz este trabalho, como começou e o que a pessoa encontra ao falar com você.'
    }
  },
  { id: 'sec-depoimentos', moduleCode: 'testimonials', config: { items: [] } },
  {
    id: 'sec-perguntas',
    moduleCode: 'faq',
    config: {
      items: [
        {
          q: 'Quais são as formas de pagamento?',
          a: 'Escreva como a pessoa paga: Pix, cartão, na hora do atendimento ou pelo link do seu sistema de pagamento.'
        },
        {
          q: 'É online ou presencial?',
          a: 'Explique onde o atendimento acontece e o que a pessoa precisa ter ou levar.'
        },
        {
          q: 'E se eu precisar remarcar?',
          a: 'Diga com quanto tempo de antecedência dá para remarcar e como avisar.'
        }
      ]
    }
  },
  {
    id: 'sec-chamada-final',
    moduleCode: 'hero',
    config: {
      headline: 'Escreva aqui o convite final, como “Vamos conversar sobre o que você precisa?”',
      subtitle: 'Uma linha que lembre como é simples falar com você.',
      primaryAction: { label: 'Conversar no WhatsApp', target: 'whatsapp' }
    }
  }
];

const businessPage = {
  slug: BUSINESS_PAGE_SLUG,
  title: 'Para empresas',
  active: false,
  sections: [
    {
      id: 'sec-empresas-abertura',
      moduleCode: 'hero',
      config: {
        headline: 'Diga o que você oferece para empresas',
        subtitle: 'Palestras, oficinas, encomendas em quantidade ou parcerias: conte em uma frase como trabalha com equipes e marcas.'
      }
    },
    { id: 'sec-empresas-orcamento', moduleCode: 'quote_request', config: { allowNotes: true } },
    {
      id: 'sec-empresas-perguntas',
      moduleCode: 'faq',
      config: {
        title: 'Perguntas de empresas',
        items: [
          { q: 'Você emite nota fiscal?', a: 'Responda se emite nota e quais dados precisa receber da empresa.' },
          { q: 'Em quanto tempo chega o orçamento?', a: 'Diga em quanto tempo responde e o que a empresa precisa contar no pedido.' }
        ]
      }
    }
  ]
};

export const SERVICES_PRODUCTS_TEMPLATE = Object.freeze({
  code: SERVICES_PRODUCTS_TEMPLATE_CODE,
  name: 'Serviços e produtos',
  storefrontType: 'services',
  catalogType: 'products',
  schemaVersion: 1,
  defaultTokens: { accentColor: '#9C4221', fontPair: 'editorial-syne', buttonStyle: 'rounded' },
  defaultSections: sections,
  defaultPages: [businessPage]
});

/** Padrões no formato de `store.getStructureDefaults` (memória local e testes). */
export function servicesProductsStructureDefaults() {
  const template = structuredClone(SERVICES_PRODUCTS_TEMPLATE);
  return {
    catalogType: template.catalogType,
    template: {
      defaultTokens: template.defaultTokens,
      defaultSections: template.defaultSections,
      defaultPages: template.defaultPages
    }
  };
}
