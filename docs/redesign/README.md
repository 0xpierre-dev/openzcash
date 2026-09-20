# Redesign do OpenZcash — escopo, regras e estado

Este documento substitui o plano de 8 de setembro de 2026 (branch
`michae2xl/redesign-grant-org-structure`), que congelava a primeira tela de cada
app e limitava o redesign às telas internas. A decisão tomada no ambiente de
teste de 17 de setembro foi outra, e é a que vale: o redesign cobre o shell e
todas as telas dos apps, inclusive a home; só o Monthly e a sala 3D ficam como estão.

## 1. Fronteira

**Preservado byte a byte** (a guarda falha se a branch tocar):

| Grupo    | Arquivos                                                                                  |
| -------- | ----------------------------------------------------------------------------------------- |
| Monthly  | `src/app/monthly*/`, `components/monthly/`, `lib/monthly/`, `public/monthly/`             |
| Sala 3D  | `office/scene.tsx`, `office-canvas.tsx`, `proposal-dialog.tsx`, `public/office-assets/`   |

**Do redesign**: `layout.tsx`, `app-shell.tsx`, `shell-gate.tsx`, os primitivos
(`ui.tsx`, `data-table.tsx`, `components/workspace.tsx`), a primeira tela de
cada app (`/zcg`, `/zf`, `/zechub`, `/news`, `/wallets`, …) e todas as telas
internas, inclusive a entrada do office (`office/page.tsx`,
`office-entrance.tsx`).

**Contratos que só mudam de forma aditiva** (a guarda avisa): rotas de
`src/app/api/`, repositórios contábeis (`*-repo.ts`), importadores
(`import-*.ts`), política de publicação D-1, `db/schema.ts` e migrações.

Guarda mecânica: `scripts/redesign-scope-check.sh [base]` (padrão `origin/main`).
Uma exceção aprovada passa por `REDESIGN_ALLOW=caminho`.

Desde 20/09 a home (`src/app/page.tsx`, `treasury-overview.tsx`,
`components/app-launcher.tsx`) também faz parte do redesign: ela vive dentro
do shell e as duas tesourarias ficam fixas no rodapé de todas as páginas.

## 2. Onde vive

- Branch: `michae2xl/redesign-staging` (base `origin/main`). Worktree local:
  `/Users/maiconguimaraes/openzcash-redesign`.
- Push na branch publica em https://zbo-redesign.up.railway.app/design-review
  (Railway, environment `redesign`, banco próprio). IDs, credenciais, política de
  coleta e histórico de validação: [`STAGING.md`](./STAGING.md).
- `route-coverage.json` lista o tratamento de cada rota; `data-parity.json`
  registra a cópia do banco de produção.

## 3. Princípios

Direção visual aprovada em 20/09/2026 (referência: Mercury; mockups em
https://claude.ai/artifact/Q8VGqjxTubVq1BaJCNbvZY):

1. Um sistema de tokens em `src/app/theme.css`, carregado por último, com a
   paleta de produção: creme `#faf8f4`, superfícies brancas separadas por
   hairline, texto na escala stone, dourado `#b7791f` como único acento para
   estado, ação e valores monetários nas tabelas. Tema claro é o padrão em
   qualquer sistema; o escuro (preto com gradiente leve de dourado) só pelo
   botão. Nenhuma página define cor: as utilidades Tailwind que as páginas usam
   são remapeadas para os tokens dentro de `.rd-content`.
2. Verde e vermelho só para fluxos reais de caixa (entrada/saída, sobre/sob
   orçamento) e vereditos que os exigem.
3. Número é sempre `.tnum`, ganha destaque por tamanho, não por cor; centavos
   e unidades em tamanho menor.
4. Toda cifra tem fonte. Link interno termina em `→`; link externo em `↗` e abre
   em nova aba (`RelatedLinks` faz isso sozinho).
5. Toda tela começa com `PageHeader`: título (28/400) e um subtítulo de uma
   frase que diz de onde o dado vem. Copy editorial entra em `EditorialIntro`,
   nunca no lugar da proveniência. As estatísticas (`Stat`) formam uma faixa
   única dividida por hairlines, sem cards coloridos.
6. Navegação: o modelo em `src/lib/design-routes.ts` é uma lista de apps na
   ordem do launcher de produção (Monthly, News, Lockbox, ZCG, ZF, FPF, DeFi,
   Z3, Zakura, Shielded Labs, ZecHub DAO, Arborist Calls, Communities, Wallets,
   Ecosystem; Manage só para admin), cada um com logo oficial quando existe e
   suas páginas internas. Tudo deriva dele: a sidebar (app com logo, páginas
   expansíveis, contagens), a trilha "Home › App › Página › Detalhe" no topo,
   o único controle de voltar (detalhe → lista, página → app, app → Home), as
   páginas irmãs no rodapé e o diálogo ⌘K. Nenhum `‹` inline. Links
   contextuais de escape ("Totals →") são permitidos porque não são "voltar".
7. Rótulos de status vêm de `src/lib/zcg/status-labels.ts` (grant, veredito ZCG,
   veredito coinholder). Nenhuma tela define o próprio mapa.
8. Tabelas usam `DataTable`: 25/50/100 linhas ou todas, CSV com o texto exibido,
   `mobileHidden` para colunas secundárias, `statusTabs={false}` quando a página
   já filtra por status na URL.
9. Mobile primeiro: `grid-cols-2` nas estatísticas, nada de scroll horizontal
   fora das tabelas; verificar a 390px e 1280px.
10. Ambiente: `OPENZCASH_ENV=redesign` liga a barra de preview, o `noindex` e a
    guarda de isolamento; `DISABLE_AUTO_REFRESH=true` congela a contabilidade
    (a diligência continua a aquecer). Sem essas variáveis o código se comporta
    como produção.

## 4. Estado das trilhas

**Trilha A — grants (o dinheiro).** Concluída: listas com a casca compartilhada,
detalhe de grant com progresso, fatos e registros conectados, detalhe de
recebedor, cronograma de pagamentos futuros (`/zcg/schedule`), KPIs de
desembolsos sobre a população inteira, CSV correto. Paridade com a produção
verificada em 19/09 (subtítulos metodológicos, rodapés, links).

**Trilha B — quem decide.** Concluída em `/zcg/committee`:

1. Assentos: os `MemberCard` de `current-committee.tsx` e a linha de mandatos
   por coorte (`COHORTS` e `membersByCohort()` em `current-committee-data.ts`).
2. Eleições: `ElectionsSection`.
3. Remuneração: resumo total e por membro (`lib/zcg/stipends.ts`, compartilhado
   com `/zcg/stipends`), ex-membros marcados.
4. Atas: as últimas cinco, com link para `/zcg/meetings` e para o fórum.
5. Orçamento próprio: `BudgetCards`, com link para `/zcg/budget`.
6. Quem vota: contagem do ZCAP com link para `/zf`, que continua dono do roster.
7. Fonte única: o office deriva seus assentos de `officeMembers()`; a legenda de
   cada cadeira é o primeiro fato com fonte do membro. Uma troca de comitê é uma
   edição em `current-committee-data.ts`.

**Fora do foco, mas alterados**: `/zcg/methodology` e os três copilots só
receberam a casca nova; o texto das regras não mudou.

## 5. Definição de pronto por tela

- [ ] `scripts/redesign-scope-check.sh` passa.
- [ ] Usa os primitivos de `components/workspace.tsx` (`SectionHeading`,
      `Facts`, `RelatedLinks`, `RecordLayout`, `ProgressRail`, `FeatureLink`,
      `EditorialIntro`, `SourceNote`) e `DataTable`. Exceção conhecida:
      `schedule/page.tsx` renderiza uma `<table>` server-side; migra quando
      houver uma tabela server-side compartilhada.
- [ ] Um único controle de voltar; nenhum `‹` inline.
- [ ] Rótulos de status de `status-labels.ts`.
- [ ] Toda cifra com fonte (`↗` externo, `→` interno) e `.tnum`.
- [ ] Testada a 390px e 1280px.
- [ ] `npm run typecheck && npm test && npm run lint` verdes; `next build` passa.
- [ ] Validação ao vivo no staging depois do deploy (as rotas de
      `route-coverage.json` respondem; os textos e cifras conferem).

## 6. Como trabalhar

```bash
cd /Users/maiconguimaraes/openzcash-redesign
npm run dev                                  # http://localhost:3000
npx tsc --noEmit && npx vitest run && npx eslint src
scripts/redesign-scope-check.sh              # compara com origin/main
git push origin michae2xl/redesign-staging   # publica no Railway
```

O worktree compartilha o `.git` com o repositório principal. O banco local pode
estar atrás do snapshot de produção (falta `zcg_publications`); propostas, FPF e
office se verificam no Railway.

## 7. Caminho para produção

Não há merge automático. Quando o redesign for aprovado: abrir PR de
`michae2xl/redesign-staging` para `main`, manter a configuração de produção (sem
`OPENZCASH_ENV`, sem `DISABLE_AUTO_REFRESH`) e deployar. A guarda de isolamento
só age sob `OPENZCASH_ENV=redesign`; `/design-review` continua acessível por URL,
mas só é linkado do shell no preview. Sem mudança de DNS ou domínio.
