# Envio automático do Mapa de Rebanho

A função `mapa-email` consulta `mapa_rebanho_estado` no momento da execução e gera PDF e Excel atualizados com o mesmo calculador do sistema. Os dados de remetente, destinatários e assinatura ficam exclusivamente na configuração privada do servidor.

## Configuração

- Aplicar o modelo `supabase/email_setup.sql` substituindo os placeholders. Configuração inicia pausada.
- Adicionar `RESEND_API_KEY` aos secrets das Edge Functions.
- Definir remetente, endereço de resposta, proprietário da conta e assinatura na tabela privada `mapa_email_config`.
- Cadastrar apenas destinatários autorizados na tabela privada `mapa_email_recipients`.
- Antes de ativar, cancelar agendamentos antigos com anexos fixos no provedor, se existirem.
- Verificar o domínio no Resend antes de habilitar destinatários diferentes do proprietário. Definir `domain_verified=true` somente após essa verificação e usar um remetente autorizado.
- Definir `enabled=true` para ativar; `test_until` limita os testes até a data indicada. `null` permite continuar diariamente.

## Invocação

O token aleatório de autenticação fica no Vault, com somente o hash na configuração privada. A função usa autenticação própria e deve ser implantada com `verify_jwt=false`.

Invocar por POST autenticado usando `Authorization: Bearer <token privado>` e corpo JSON:

- `{"mode":"preview"}`: consulta a base e gera os anexos, devolvendo metadados sem enviar.
- `{"mode":"scheduled"}`: respeita pausa e data limite.
- `{"mode":"send"}`: envia imediatamente, respeitando pausa e bloqueio de destinatários.

O cron usa 11:00 UTC, equivalente a 07:00 America/Campo_Grande. Cada destinatário recebe mensagem individual. A assinatura branca é anexada por CID.

## Verificação e registros

A combinação única de data e destinatário impede duplicatas entre chamadas concorrentes. Novos destinatários podem receber no mesmo dia. Consultar `mapa_email_deliveries` para status e IDs do provedor. Reservas `sending` ou `uncertain` exigem conferência no Resend antes de repetir. Não liberar reservas automaticamente após falhas de rede.

As tabelas usam RLS e acesso exclusivo de service_role. A chave Resend nunca deve entrar no repositório ou no cliente. Os anexos preservam SISBOV, chip e brinco como texto. O envio é bloqueado se houver inconsistências ou animais sem categoria/seção.

Dependências fixadas: pdf-lib 1.17.1 e xlsx-js-style 1.2.0. Testes realizados: prévia no servidor, bloqueio de chamada sem autenticação, integridade do XLSX e regeneração após alteração simulada de movimentação, sem alterar a produção.
