# Contrato: `GET /api/auth/config` (ampliado)

Rota pública já existente (`workers/api.mjs`), usada por `fetchAuthConfig()` em `web/portal/portal.js`. Campos atuais (`supabaseUrl`, `publishableKey`, `PUBLIC_SITE_ORIGIN`, `PORTAL_ORIGIN`) continuam iguais. Campos novos:

```json
{
  "authMethods": {
    "emailPassword": true,
    "phonePassword": false,
    "whatsappOtp": false
  },
  "socialProviders": ["google"],
  "whatsappNumber": "5567999999999",
  "turnstileSiteKey": "0x4AAAA..."
}
```

| Campo | Origem | Regra |
|---|---|---|
| `authMethods.emailPassword` | `AUTH_METHODS` contém `email_password` | Desligado por padrão; em produção, só depois de BLK-SMTP-01 e T045. |
| `authMethods.phonePassword` | `AUTH_METHODS` contém `phone_password` | Exige `whatsappOtp` ligado, porque a confirmação do telefone usa o mesmo canal. |
| `authMethods.whatsappOtp` | `AUTH_METHODS` contém `whatsapp_otp` e todos os segredos do WhatsApp e do hook existem | Se faltar segredo, vira `false` mesmo que listado. |
| `socialProviders` | `AUTH_SOCIAL_PROVIDERS` (padrão `google`) | Só valores da lista permitida `google`, `facebook`, `x`. |
| `whatsappNumber` | `WHATSAPP_DISPLAY_NUMBER` | Só dígitos; presente apenas quando `whatsappOtp` é `true`. |
| `turnstileSiteKey` | `TURNSTILE_SITE_KEY` | Chave pública; ausente desliga o desafio no front-end. |

- *Decisão proposta (revisar no PR; research S1)*: `AUTH_METHODS` fica vazio (ou ausente) no `wrangler.jsonc` versionado até T045; os métodos só são ligados no Worker de teste, apontado para o projeto Supabase de teste (BLK-SBTEST-01). `AUTH_METHODS` só controla a tela e as rotas do Worker; a barreira contra chamadas diretas ao Supabase é o provedor desligado no projeto de produção (FR-017). Teste: `test/auth-methods-off.test.mjs` (T047).
- `Cache-Control: no-store`, como hoje.
- Nenhum segredo (`*_SECRET`, `*_TOKEN`, `*_KEY` privados, pepper) pode aparecer na resposta; teste dedicado.
