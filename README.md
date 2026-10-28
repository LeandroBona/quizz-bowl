# Quiz Bowl

Painel administrativo para competições acadêmicas de perguntas e respostas. Inclui eventos, participantes, equipes, banco de questões, fase de grupos, chaveamento eliminatório e mediação completa de partidas; dashboard, placar e telão; regulamento por evento; simulação isolada; exportações CSV/PDF; e tema claro/escuro.

## Requisitos

- Node.js 20.12 ou superior (recomendado: Node.js 22 LTS)
- npm
- Docker com Compose, ou um servidor MySQL 8 acessível

## Executar localmente

```bash
cp .env.example .env
docker compose up -d mysql
npm install
npm run db:generate
npm run db:deploy
npm run admin:user -- create professor "Professor responsável"
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000) e entre com o usuário e a senha criados no terminal. O comando pede a senha duas vezes sem exibi-la; use ao menos 12 caracteres. Aguarde o healthcheck do MySQL antes de aplicar a migração. A URL em `.env` já corresponde ao serviço do `docker-compose.yml`; ajuste `DATABASE_URL` se usar um servidor externo.

O contêiner expõe o MySQL na porta local **3307** para evitar conflito com instalações MySQL existentes. O sistema inicia sem registros de exemplo. Crie um evento em **Eventos**, selecione-o no cabeçalho, configure as fases em **Participantes** e então cadastre ou importe os alunos. Monte as equipes em **Equipes**, cadastre perguntas em **Banco de Questões**, configure a fase em **Grupos** e confirme o sorteio; os confrontos são criados automaticamente. Use **Partidas** para jogos fora da fase de grupos. Se este projeto já estava instalado, execute `npm run db:deploy` após atualizar o código para aplicar as migrações novas. **Configurações** também permite criar um evento fictício para percorrer a competição sem dados reais.

## Comandos

| Comando | Finalidade |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção |
| `npm run start` | Servidor de produção após o build |
| `npm run typecheck` | Verificação TypeScript |
| `npm run lint` | Análise estática |
| `npm test` | Testes unitários de sorteios, classificação, questões, pontuação e cronômetro |
| `npm run test:integration` | Fluxos de partida, classificação, chaveamento, telão e simulação completa no MySQL; exige banco migrado |
| `npm run db:generate` | Gera o Prisma Client |
| `npm run db:migrate` | Cria/aplica migrações em desenvolvimento |
| `npm run db:deploy` | Aplica migrações existentes |
| `npm run db:studio` | Abre o Prisma Studio |
| `npm run db:local` | Reinicia o MySQL nativo já inicializado em `.local/mysql-data` nesta instalação macOS; execute em terminal separado |
| `npm run admin:user -- create usuario "Nome"` | Cria uma conta individual de professor, com senha solicitada no terminal |
| `npm run admin:user -- reset usuario` | Troca a senha e encerra as sessões anteriores desse usuário |

## Acesso dos professores

- Crie uma conta por professor com `npm run admin:user -- create ...`. Não há senha padrão nem cadastro público. Todas as contas criadas têm acesso administrativo nesta versão.
- O painel e as APIs administrativas exigem login. A sessão fica no MySQL e o navegador recebe apenas um cookie HttpOnly; em produção, ele é enviado somente por HTTPS. **Sair da conta** revoga a sessão atual. O telão em `/telao/ID_DO_EVENTO` e suas APIs públicas continuam sem login e nunca recebem gabaritos futuros.
- Professores podem abrir a mesma partida em computadores diferentes. Respostas e pontos são gravados em transações; se duas ações incompatíveis ocorrerem juntas, só uma é aceita e a outra tela recebe erro para atualizar. A mediação sincroniza os placares pelo stream ao vivo, e as novas ações de partida registram o usuário responsável no histórico.
- Um professor pode selecionar **Classificação** ou **Chaveamento** em **Placar e Telão** enquanto outro registra respostas na partida. A tela escolhida continua no projetor; os pontos seguem sendo salvos. Para voltar, selecione **Placar** ou **Pergunta**. O início de uma nova partida coloca automaticamente seu placar no telão.

## Estrutura

- `prisma/schema.prisma` e `prisma/migrations/`: modelo relacional e migrações MySQL, incluindo fases de grupos, sessões de partidas, trilha de eventos, homologação, questões e reservas de não repetição.
- `src/app/api/`: APIs dos cadastros, importação, sorteio, fase de grupos, mediação e dashboard.
- `src/server/`: acesso ao banco, importação, sorteio, regras de integridade e tratamento de erros.
- `src/lib/validations.ts`: validação Zod das mutações; `src/lib/team-draw.ts` e `src/lib/group-stage.ts`: algoritmos independentes do banco.
- `src/components/`: componentes Shadcn/UI, navegação e telas.

As rotas de cadastro são `/api/events`, `/api/participants`, `/api/teams`, `/api/questions`, `/api/groups` e `/api/matches`. `GET` lista, `POST` cria, `PUT /:id` atualiza e `DELETE /:id` exclui. Os recursos ligados a eventos usam `eventId` na consulta e na mutação; uma questão compartilhada usa `eventId: null` no cadastro. `GET /api/dashboard?eventId=...` retorna as métricas. Erros de validação respondem com `issues` e status 400.

## Participantes e equipes

- Configure as fases por evento em **Participantes → Fases**. Participantes novos precisam de uma fase; registros criados antes desta migração podem ser editados para recebê-la.
- Pesquise por nome, turma, fase ou equipe; filtre por fase e situação. A exclusão é bloqueada enquanto o participante pertencer a uma equipe.
- A importação aceita CSV UTF-8 (vírgula ou ponto e vírgula) e XLSX, com até 5 MB e 5.000 linhas. As colunas obrigatórias são `Nome` e `Fase`; as opcionais são `Turma`, `Situação`, `Email` e `Instituição`. Use nomes de fases previamente configurados no evento. Situação pode ser `Ativo`, `Inativo` ou `Desistente` e, se omitida, será `Ativo`.
- A prévia aponta linhas inválidas e duplicadas. A confirmação revalida o arquivo e importa somente linhas válidas. A identidade usada para duplicidade é nome + fase + turma, normalizados. A restrição única no MySQL também protege importações concorrentes.
- Em **Equipes**, crie e renomeie equipes, adicione, remova ou mova integrantes e faça trocas entre duas equipes ou substitua um integrante por aluno sem equipe. Cada participante tem no máximo uma equipe. Equipes sorteadas mantêm os limites mínimo e máximo; quando uma mudança direta violaria um limite, use a troca de integrantes.
- Em **Sorteio de Equipes**, informe quantidade desejada e limites por equipe. O sistema mostra tamanhos viáveis e a presença de fases. Quando a quantidade pedida não cabe nos limites, usa automaticamente a quantidade viável mais próxima e explica o ajuste. Se alguma fase tiver poucos alunos para aparecer em todas as equipes, distribui seus alunos pelo maior número possível de equipes. A prévia é provisória; apenas **Confirmar sorteio** grava equipes e integrantes.

As APIs adicionais são `GET/POST /api/phases`, `PUT/DELETE /api/phases/:id`, `PUT /api/participants/:id/team`, `POST /api/teams/swap`, `POST /api/participants/import/preview`, `POST /api/participants/import/confirm`, `GET /api/team-draw/context`, `POST /api/team-draw/preview` e `POST /api/team-draw/confirm`. As rotas de importação recebem `multipart/form-data` com `eventId` e `file`; as demais mutações recebem JSON. O sorteio usa uma assinatura do estado do evento e recusa confirmar uma prévia se os participantes ou nomes das equipes mudarem nesse intervalo.

## Banco de questões

- Cadastre questões de múltipla escolha (2 a 6 alternativas), verdadeiro/falso e resposta curta. A resposta curta é corrigida manualmente pelo mediador. Categoria, dificuldade, pontos sugeridos, tempo, explicação, imagem e situação ficam salvos no banco.
- Questões do evento e do banco compartilhado aparecem juntas no evento selecionado. A lista permite pesquisa por enunciado e filtros por categoria, dificuldade, tipo e escopo. Questões já usadas não podem ser excluídas nem ter seu conteúdo alterado; podem ser desativadas ou duplicadas.
- A imagem pode ser uma URL HTTPS ou um arquivo PNG, JPEG, WebP ou GIF de até 1 MB anexado no formulário. Imagens anexadas são guardadas como data URL no MySQL; considere armazenamento de objetos se o volume crescer.
- A importação aceita CSV UTF-8 com vírgula ou ponto e vírgula, ou XLSX, até 5 MB e 5.000 linhas. Colunas obrigatórias: `Enunciado`, `Tipo`, `Resposta`. Opcionais: `Alternativas`, `Explicação`, `Categoria`, `Dificuldade`, `Pontos`, `Tempo`, `Imagem`, `Escopo` e `Situação`. Separe alternativas com `|`; a resposta pode ser a letra A–F ou o texto da opção. A prévia identifica linhas inválidas e duplicadas; a confirmação revalida e importa somente linhas válidas.
- Em **Regras e pontos**, configure pontuação sugerida por dificuldade ou fixa e ative/desative a não repetição no evento. Em **Sorteio e apresentação**, escolha partida, categoria, dificuldade e quantidade. Quando todos os níveis são permitidos, o sorteio os equilibra conforme a disponibilidade. Na mediação por campainha, cada questão usa a regra fixa de 10 pontos na primeira resposta correta ou 5 na segunda chance; os valores sugeridos das questões continuam como referência no banco.
- O sorteio roda em transação serializável. Com não repetição ativa, a chave única `(eventId, questionId)` da reserva impede seleção simultânea da mesma questão em duas partidas. Questões já usadas continuam excluídas se a regra for reativada depois de um período com repetição permitida.
- O telão consulta apenas `GET /api/matches/:id/questions/public?eventId=...`, que omite `answer` e `explanation` antes da revelação. O mediador usa o controle administrativo **Revelar resposta**; a partir daí a resposta aparece no telão. A rota administrativa `GET /api/matches/:id/questions/admin` contém o gabarito e exige login.

Outras APIs: `GET /api/questions/stats?eventId=...`, `POST /api/questions/:id/duplicate`, `POST /api/questions/import/preview`, `POST /api/questions/import/confirm`, `GET/PUT /api/question-settings`, `POST /api/matches/:id/questions/draw` e `POST /api/matches/:id/questions/:assignmentId/reveal`. As rotas administrativas usam `eventId` para delimitar o evento. As rotas de importação recebem `multipart/form-data` com `eventId` e `file`.

## Fase de grupos

- Em **Grupos**, configure a quantidade de grupos, o tamanho opcional, os classificados por grupo, pontos por vitória/empate/derrota, permissão de empate e ordem dos critérios de desempate. É possível salvar essa configuração antes de formar as equipes; o sorteio exige ao menos duas equipes por grupo. Ao confirmar, a fase cria grupos A–G e 21 confrontos para 21 equipes em 7 grupos de 3. Com 23 equipes e 7 grupos, deixe o tamanho automático para distribuir grupos de 3 ou 4.
- **Sortear grupos** cria uma prévia local. **Sortear novamente** substitui essa prévia; somente **Confirmar grupos** grava a distribuição. Se equipes ou regras mudarem entre prévia e confirmação, o servidor pede um novo sorteio. Uma chave única impede a mesma equipe em dois grupos da mesma fase.
- Ao confirmar o sorteio, o sistema gera cada confronto de grupo uma única vez, na mesma transação. A lista de partidas segue a rodada e, dentro dela, Grupo A, B, C etc.; cada confronto recebe um número na ordem de exibição. É possível trocar equipes de grupos diferentes enquanto as partidas dos grupos afetados não tiverem começado nem recebido questões ou resultados; os confrontos agendados são atualizados junto com a troca. **Gerar confrontos pendentes** só aparece para fases antigas confirmadas sem partidas.
- Registre os placares em **Grupos** e clique em **Homologar**. Para corrigir um placar já registrado, altere os números, informe o motivo e salve; a homologação anterior é revogada e a alteração entra no histórico da partida. Apenas jogos homologados entram na tabela; classificados e eliminados só são marcados após todos os confrontos previstos do grupo serem homologados.
- A tabela mostra posição, jogos, vitórias, empates, derrotas, pontos de classificação, pontos marcados e sofridos e saldo. A ordem configurável inclui pontos, vitórias, saldo, pontos marcados, confronto direto (para duas equipes quando há resultado homologado) e prioridade manual. Quando um empate atravessa a linha de classificação sem solução, ambas as equipes ficam **Em aberto**. Use a prioridade manual ou uma partida extra fora do grupo para definir o desempate; não há desempate aleatório.
- `GET /api/group-stage?eventId=...` lista as fases; com `phaseId` retorna grupos, confrontos e tabelas. `POST /api/group-stage` recebe `action`: `create`, `update`, `preview`, `confirm`, `swap`, `fixtures`, `result`, `homologate` ou `manualTie`. As mutações validam o evento com Zod. Sorteio confirmado, trocas e confrontos usam transações serializáveis e restrições únicas no MySQL.

## Partidas e pontuação

- Crie uma partida avulsa em **Partidas** ou confirme os grupos ou o chaveamento para gerar os confrontos, então clique em **Conduzir**. Informe o tempo e a quantidade de perguntas; ao iniciar, o sistema sorteia as questões automaticamente se ainda não foram escolhidas. O painel **Opções de questões** permite filtrar o sorteio ou fazer a associação manual antes do início.
- **Iniciar partida** muda o status para ao vivo, seleciona automaticamente esse confronto no telão e mostra seu placar. O servidor impede iniciar outra partida ao vivo no mesmo evento. **Apresentar primeira** e **Próxima questão** controlam a pergunta visível no telão.
- O cronômetro possui iniciar, pausar e reiniciar. O servidor guarda o instante de início e o tempo restante; mediador e telão recebem a mesma referência de tempo e sincronizam periodicamente. Uma recarga da página recupera a sessão, pergunta, respostas, placar e eventos do MySQL.
- O mediador identifica a equipe que tocou primeiro: acerto vale **10 pontos** e erro vale **0**. Após erro, somente a adversária pode responder; acerto na segunda chance vale **5 pontos** e novo erro vale **0**. Qualquer acerto encerra a pontuação da questão para ambas as equipes. A API aceita apenas `points: 0 | 5 | 10` conforme a etapa. **Corrigir registro** lança apenas a diferença no placar e exige justificativa; ajustes manuais extraordinários também exigem justificativa e ficam auditados. Cada lançamento fica em `Score`, e cada ação importante em `MatchEvent`.
- **Revelar resposta** libera o gabarito da questão atual no telão. As APIs públicas `GET /api/matches/:id/session/public` e `GET /api/matches/:id/questions/public` entregam apenas a questão apresentada e omitem resposta e explicação até a revelação. A API administrativa contém o gabarito e exige login.
- **Editar placar** na tela da partida permite informar os dois valores corretos e uma justificativa, inclusive para um resultado homologado. O sistema revoga a homologação e registra as diferenças no histórico; depois, revise e homologue novamente. Uma correção no mata-mata pode invalidar jogos dependentes mediante confirmação. Resultados da fase de grupos ficam protegidos após gerarem o chaveamento; nesse caso, é preciso revisar a estrutura eliminatória antes da correção.

APIs adicionais: `GET/POST /api/matches/:id/session`, `GET /api/matches/:id/session/public` e `POST /api/matches/:id/questions/assign`. A rota de sessão recebe uma ação JSON: `configure`, `start`, `present`, `turn`, `timer`, `answer`, `correct`, `setScore`, `adjust`, `reveal`, `finish`, `homologate` ou `revoke`. Todas as mutações usam transações serializáveis e validam evento e dados com Zod.

Para rodar os testes integrados após migrar o MySQL: `npm run test:integration`. Eles criam e removem eventos próprios e conferem os modos de partida, pontuação, correções, classificação, chaveamento e avanço após homologação.

## Chaveamento eliminatório

- Homologue todos os jogos da fase de grupos e resolva eventuais empates na linha de classificação. Em **Chaveamento**, selecione a fase de origem, escolha distribuição por campanha ou sorteio aleatório, a opção de evitar confrontos do mesmo grupo e a regra de desempate eliminatório. Gere a prévia e confirme o chaveamento. Se a classificação mudar entre prévia e confirmação, o servidor exige uma nova prévia.
- A campanha geral é ordenada por **pontos por jogo, vitórias por jogo, saldo por jogo, pontos marcados por jogo e posição no grupo**, nessa ordem. Nomes apenas estabilizam a apresentação de campanhas idênticas. Se um empate exato afetar as vagas diretas, o administrador deve revisar a ordem e aceitar explicitamente o desempate; a interface permite inverter equipes rigorosamente empatadas.
- A chave usa a próxima potência de dois: com 14 equipes, duas líderes recebem vagas diretas, 12 disputam seis preliminares e o caminho segue para quartas, semifinais e final, totalizando 13 partidas. Os mesmos cálculos atendem 8, 16, 24 e 32 classificadas. A primeira rodada redistribui os oponentes de menor campanha para evitar equipes do mesmo grupo quando houver combinação possível.
- Cada vaga e sua origem são persistidas. Ao confirmar o chaveamento, as partidas da primeira rodada são criadas automaticamente. Partidas de rodadas futuras são criadas assim que as duas equipes estiverem definidas por resultados homologados; nenhuma vencedora avança sem homologação. A chave única por equipe e rodada impede presença duplicada. Os jogos podem ser conduzidos pela tela **Partidas** ou receber placar direto no chaveamento enquanto não houver sessão de mediação.
- Para empates eliminatórios, escolha **Pontos adicionais** (placar precisa ser desempatado por questão extra ou ajuste justificado) ou **Decisão do mediador** (vencedora e justificativa obrigatórias). Confrontos ainda não iniciados podem ter participantes trocados entre jogos da mesma rodada.
- Correções de um resultado oficial revogam o avanço e invalidam jogos dependentes. Se alguma partida posterior começou, o servidor exige confirmação explícita; o histórico do jogo cancelado permanece em `MatchEvent`. A correção de placar oficial exige justificativa. A origem na fase de grupos fica protegida depois da geração para impedir que a classificação do mata-mata se torne inconsistente.
- O quadro visual tem conexões entre rodadas, identifica vagas diretas, jogos pendentes, vencedoras, eliminadas e campeã, e oferece modo de projeção em tela cheia. `GET /api/bracket?eventId=...&phaseId=...` retorna o estado. `POST /api/bracket` recebe as ações `preview`, `confirm`, `swap`, `score`, `homologate` e `revoke`, validadas com Zod. Ações concorrentes usam transações serializáveis, além de restrições únicas no MySQL.

## Telão público ao vivo

Na fase de grupos, o mediador lança manualmente 10 pontos pelo primeiro acerto ou 5 pela segunda chance; um erro vale 0. A classificação usa, por padrão, 3 pontos por vitória, 1 por empate e 0 por derrota. No mata-mata, os botões manuais oferecem 10 pontos na primeira tentativa, 15 na resposta da adversária e 20 na tréplica da primeira equipe. O roteiro inicial tem 10 questões. Se o placar continuar empatado, **Questão extra** sorteia a 11ª (e outras, se necessário); o resultado eliminatório só pode ser encerrado após o desempate. A pontuação pode ser lançada mesmo depois de revelar o gabarito da questão atual. Partidas eliminatórias já iniciadas com menos de 10 questões recebem novas perguntas automaticamente até completar o roteiro. O telão exibe as faixas de pontos de cada fase. Para atualizar uma instalação existente na VPS, execute `npm run db:deploy` antes de reiniciar o servidor; a migração `20261028120000_knockout_reply` habilita a tréplica e os empates nos grupos existentes.

- Em **Placar e Telão** (`/placar`), escolha a partida, configure logo, boas-vindas, visibilidade do placar durante a pergunta, explicação e efeitos sonoros. Selecione a tela de abertura, equipes, pergunta, revelação, placar, classificação, chaveamento ou campeã. A escolha é persistida por evento.
- Abra **Telão público** em outra janela: `/telao/ID_DO_EVENTO`. Esta rota não mostra menu nem controles administrativos. A prévia no painel e qualquer número de janelas públicas recebem o mesmo estado por SSE (`/api/public/events/ID_DO_EVENTO/stream`). A primeira atualização é enviada imediatamente. Se o proxy da VPS interromper o stream, o telão consulta automaticamente a API pública a cada três segundos e mostra erros de conexão ou de banco em vez de permanecer em “Conectando”.
- Durante a mediação, **Iniciar partida** mostra o placar do confronto escolhido, **Apresentar questão** muda para a pergunta e **Revelar resposta** muda para a revelação. Placar e cronômetro continuam sincronizados por SSE; o cronômetro usa o horário do servidor. Sons requerem ativação local na janela pública por causa das políticas de reprodução do navegador.
- A API pública só serializa a questão atualmente apresentada. O gabarito aparece apenas após a revelação do mediador e quando a tela de revelação está ativa; a explicação depende da configuração. Resultados de classificação são oficiais. A tela de campeã só pode ser selecionada após a final homologada.
- A migração `20261015190000_live_presentation` cria a configuração do telão. Execute `npm run db:deploy` antes de iniciar a versão atualizada. `npm test` cobre o bloqueio de respostas e a entrega a duas conexões SSE simultâneas; `npm run test:integration` verifica a rota pública e a persistência com MySQL ativo.

## Configurações, demonstração e exportação

- Em **Configurações**, personalize nome, descrição, local, datas, regulamento, situação, padrões da formação de equipes, estrutura dos grupos, pontuação e desempates, mata-mata, quantidade e tempo das perguntas, penalidades, pontos por dificuldade ou fixos e aparência do telão. As fases dos participantes são editadas em **Participantes**. Configurações de grupos confirmados continuam no regulamento da própria fase; mudar o padrão não reescreve resultados existentes.
- O logo do telão aceita URL HTTP(S). A API valida intervalos, estrutura dos grupos e contraste mínimo das cores com o texto. As cores de fundo e destaque seguem para a tela pública.
- Em **Configurações → Simulação**, crie um evento identificado como fictício. Execute, em ordem, nove etapas persistidas: gerar 117 participantes e 180 questões; sortear 21 equipes de cinco ou seis com as quatro fases em cada uma; criar 7 grupos e 21 partidas automaticamente; conferir os confrontos; homologar resultados; validar 14 classificadas; criar o mata-mata de 13 confrontos, com duas vagas diretas; homologar as eliminatórias; e declarar a campeã. Cada etapa opera somente no evento fictício. Você pode inspecionar grupos, partidas, chaveamento e telão entre as etapas. Para refazer toda a demonstração, crie outro evento fictício.
- Em **Configurações → Exportar dados**, baixe participantes, composição das equipes, grupos, classificação, resultados e chaveamento do evento selecionado em CSV UTF-8 ou PDF A4. O CSV inclui todos os campos das respectivas tabelas e abre em planilhas com separador `;`; o PDF é paginado. Os arquivos são gerados a partir do estado atual do banco e não contêm dados de outros eventos.
- APIs: `GET/PUT /api/event-settings`, `GET/POST /api/demo` e `GET /api/exports?eventId=...&dataset=...&format=csv|pdf`. A migração `20261015200000_event_settings_demo` adiciona configurações e marcação de eventos fictícios. Execute `npm run db:deploy` antes de usar esta versão.

## Implantação

Em uma VPS com Node.js 20.12+ e MySQL 8, configure `DATABASE_URL` em `.env`; mantenha o MySQL restrito à rede privada. Execute `npm ci`, `npm run db:generate`, `npm run db:deploy`, `npm run admin:user -- create professor "Nome"`, `npm run build` e `npm run start`. Crie uma conta separada para cada professor. Publique o Next.js atrás de um proxy **HTTPS** que preserve o cabeçalho `Host`; em produção o cookie de sessão exige HTTPS. Limite tentativas de login no proxy e restrinja o acesso direto à porta do Next.js. O telão usa SSE; o proxy precisa permitir conexões longas sem buffer e enviar `X-Accel-Buffering: no` quando aplicável. Faça backup do MySQL antes de aplicar migrações em produção.

### Login na VPS

Se o botão ficar em **Entrando…** ao acessar por `http://`, abra o site por um domínio com certificado TLS válido (`https://`). O cookie de sessão tem a opção `Secure` em produção e não funciona no endereço HTTP da VPS. Configure o proxy para encaminhar `Host`, `X-Forwarded-Host` e `X-Forwarded-Proto: https` ao Next.js, e redirecione a porta 80 para HTTPS. A tela de login agora mostra o erro de transporte e confirma a sessão antes de abrir o painel. Após atualizar o código na VPS, execute `npm run build` e reinicie o processo do Next.js.

Se o login ainda falhar em HTTPS, verifique no navegador se `POST /api/auth/login` retornou 200 e se `GET /api/auth/me` retornou 200. Resposta 401 em `/api/auth/me` indica que o cookie não foi enviado; resposta 503 aponta para a conexão com o MySQL. Consulte os logs do processo Next.js para falhas de banco de dados.

## Escopo atual

Há autenticação básica por usuário e senha, com permissões administrativas iguais para os professores. Ainda não há perfis de acesso diferentes, recuperação de senha por e-mail nem autenticação em dois fatores. Os testes integrados precisam de MySQL ativo e com as migrações aplicadas. Testes unitários, lint, verificação TypeScript e build não exigem o banco.
