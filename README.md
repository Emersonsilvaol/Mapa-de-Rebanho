# Mapa de Rebanho — Fazenda Bodoquena

O site consulta o Supabase. A função `rebanho-publico` confere o arquivo
`dados/rebanho.json` da branch `main` deste repositório e grava uma nova versão
no banco quando seu conteúdo muda. A conferência ocorre ao abrir a página e a
cada minuto enquanto ela permanece aberta e visível. Não há sincronização de
volta do Supabase para o GitHub nem tarefa que rode com todas as páginas fechadas.

## Atualizar a base

Substitua `dados/rebanho.json` por uma exportação completa no mesmo formato:

- `dataInicial` e `dataFinal`: datas de referência no formato `AAAA-MM-DD`.
- `setores`: nomes dos setores; `biomas`: relação setor → Cerrado ou Pantanal.
- `inicial` e `final`: linhas `[SISBOV, brinco, sexo, raça, setor, nascimento]`.
- `mov`: linhas `[data, tipo, SISBOV, origem, destino, sexo]`.
- `totais`: quantidade exata de linhas de `inicial`, `final` e `mov`.

SISBOV e brincos devem permanecer como texto. A base inicial contém apenas
animais da origem inicial; cadastros avulsos não entram nesse saldo. O mapa final
é uma fotografia já calculada na origem: o sincronizador não recalcula o saldo
a partir das movimentações e não transforma backups de outros formatos.

Para atualizar, envie o novo arquivo completo pelo GitHub usando o mesmo nome.
Mudar somente o HTML não altera a base. Após a atualização, abra ou recarregue
o site. O rodapé mostra a data da base e da última sincronização. A propagação
do arquivo no GitHub pode acrescentar alguns minutos.

## Funcionamento e acesso

As tabelas `rebanho_*` preservam as versões recebidas. Uma transação publica
mapas, setores e movimentações juntos. Arquivos inválidos não substituem a
última base válida; o site indica quando está exibindo a versão salva.

A página oferece consulta pública dos dados já autorizados para publicação.
Visitantes não têm acesso de gravação ao banco. A função utiliza a credencial
de serviço apenas no servidor. A chave `anon` presente na página é pública e
mantida por compatibilidade com a verificação JWT da Edge Function.

Código da função: `supabase/functions/rebanho-publico/index.ts`.
SQL de implantação inicial: `supabase/sync.sql` (já aplicado; não executar novamente).
O `index.html` na raiz do GitHub corresponde a `dist/index.html` no projeto Sites.
