---
status: accepted
---
# Login Google via Supabase Auth no MVP

Em 2026-11-07 o usuário aprovou iniciar com Entrar com Google via Supabase Auth.
Isso reduz a operação própria de senhas e emails de recuperação. Pessoas precisam
de conta Google; recuperação dessa conta segue o provedor, e suporte a perda de
acesso ao negócio ainda requer processo próprio. Email não será usado como chave
de propriedade: vínculos usam o identificador estável do usuário Supabase.
Outros métodos de login ficam fora do MVP inicial. Credenciais OAuth, consentimento
e URLs de retorno ainda precisam ser configurados; login não está implementado.
