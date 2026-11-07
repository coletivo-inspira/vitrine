# Contrato de acesso administrativo proposto

Transporte inicial: Data API Supabase com chave publicável e sessão de usuário;
RLS executa autorização no banco. Nenhuma chamada de usuário usa service role.
Este contrato não define interface HTTP própria em Cloudflare nesta fatia.

| Operação | Proprietário | Membro da vitrine | Outro usuário / visitante |
| --- | --- | --- | --- |
| Listar vitrines | Próprias e associações | Somente associações | Nenhuma vitrine privada |
| Consultar rascunho | Permitido | Leitura | Negado |
| Alterar rascunho | Permitido com revisão esperada | Negado nesta fatia | Negado |
| Alterar proprietário | Negado | Negado | Negado |
| Escrever vínculo de membro | Negado na API pública nesta fatia | Negado | Negado |

Listagem filtra linhas inacessíveis; leitura individual sem acesso pode retornar
resultado vazio conforme a Data API, sem revelar existência. Escrita pode falhar
ou afetar zero linhas: o cliente só informa sucesso se exatamente a linha e revisão
esperadas forem atualizadas. Conflito de revisão exige recarregar e tentar novamente.
Erros não incluem tokens, consultas internas ou conteúdo de outras vitrines.

Vínculos de teste são preparados por mecanismo administrativo local. O fluxo de
convites e revogação é outra fatia. A revogação de um vínculo deve ser respeitada
na próxima consulta, sem depender de papel embutido em token antigo.
