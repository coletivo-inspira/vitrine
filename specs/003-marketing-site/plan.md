# Plano: divulgação estática

HTML semântico, CSS com tokens A e JavaScript modular sem framework. Fontes
Syne/DM Sans locais com OFL, vetores e Orb do brandbook preservados. Imagem de
pizza gerada para demonstração e comprimida em WebP, sem representar cliente.

web/ contém só a página e ativos públicos. scripts/build.mjs projeta catálogo e
contato para dist/data e copia somente web; scripts/serve.mjs serve exclusivamente
dist em loopback. wrangler.jsonc prepara Workers Static Assets, sem função dinâmica.

Garantias: banco existente não muda, nenhum conteúdo privado é publicado, CSP
restringe scripts e rede à origem. style-src permite estilo inline exclusivamente
porque o script oficial da Orb injeta seu CSS e propriedades de animação; script-src
não permite inline/eval. Tokens de Cloudflare não entram no build.

CI valida pacote, npm audit, testes e build. Telefone e cases continuam não
configurados; publicação remota e DNS ficam separados da entrega de código.

Revisão de exemplos reais: capturas JPEG locais em web/assets/showcase, links
estáticos nas categorias indicadas, pilha com CSS transform e JS sem dependências.
Capturas não são iframes. Orb usa posicionamento fixo nativo do script oficial;
rodapé responsivo preserva paleta e fontes. Critérios de medição e limites em
docs/marketing-design.md. npm test e build continuam obrigatórios.
