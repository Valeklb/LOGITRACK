# LogiTrack

App web para acompanhar **ordens de serviço (OS)** de transporte, do escritório até o caminhão.

- O **escritório** (administrador e gestor) cadastra a equipe, cria as OS, acompanha tudo em tempo real e lança KM e custo.
- O **motorista** usa o celular: inicia o turno com o checklist do caminhão, registra a coleta e a entrega de cada OS.

Tudo o que aparece nas telas vem do banco de dados. Não existem dados de exemplo.
Datas e horários são mostrados no horário de **Manaus**.

---

## Os dois caminhos

Cada pessoa entra pela mesma tela de login e o app leva cada uma para o seu caminho. Ninguém consegue abrir as telas do outro caminho.

| Caminho | Quem usa | Telas (endereço) |
|---|---|---|
| Login | todos | `/login` |
| Troca de senha | quem está com senha provisória | `/trocar-senha` |
| **Administrativo** | admin e gestor | `/admin/painel` · `/admin/ordens` · `/admin/historico` · `/admin/checklists` · `/admin/equipe` · `/admin/aprovacoes` · detalhe da OS em `/admin/os/:id` |
| **Motorista** | motorista | `/motorista` (turno + Minhas OS: Ativas / Finalizadas) · `/motorista/turno` (iniciar turno) · `/motorista/os/:id` (detalhe da OS) |

O que tem em cada tela do caminho administrativo:

- **Painel**: custo total, taxa de conclusão, OS em rota, motoristas em turno e gráfico dos últimos 7 dias. Atualiza sozinho.
- **Ordens**: criar, editar e acompanhar OS (com KM, custo, observação, horário previsto e realizado).
- **Histórico**: OS finalizadas e canceladas.
- **Checklists**: checklists do caminhão (início de turno) e da carreta (coleta). Itens com problema aparecem em vermelho.
- **Equipe**: usuários, senha provisória, ativar/desativar e encerrar turno esquecido.
- **Aprovações**: pedidos de troca de motorista (realocação). Só o gestor aprova ou reprova.

---

## Papéis: quem pode fazer o quê

O **Master** é um administrador especial: pode tudo que o admin **e** o gestor podem (inclusive cancelar OS e aprovar realocações), e ninguém mais consegue editar, desativar ou resetar a senha dele. Veja [Usuário Master](#usuário-master).

| Ação | Admin | Gestor | Motorista |
|---|:---:|:---:|:---:|
| Ver painel, ordens, histórico, checklists e equipe | ✅ | ✅ | — |
| Criar usuários | ✅ qualquer papel | ✅ só motoristas | — |
| Editar e ativar/desativar usuários | ✅ todos | ✅ só motoristas | — |
| Resetar senha (gerar senha provisória) | ✅ de qualquer outro usuário | ✅ só de motoristas | — |
| Encerrar turno esquecido de um motorista | ✅ | ✅ | — |
| Criar, editar e excluir OS / lançar KM e custo | ✅ | ✅ | — |
| Trocar o motorista de uma OS | só com a OS **Aberta** e sem pedido pendente; nos outros casos, **pede realocação** | ✅ na hora | — |
| Aprovar ou reprovar realocação | — (só vê os pedidos) | ✅ | — |
| Cancelar OS | — | ✅ | — |
| Iniciar e encerrar o próprio turno | — | — | ✅ |
| Ver as próprias OS e registrar coleta e entrega | — | — | ✅ |
| Alterar a própria senha | ✅ | ✅ | ✅ |

Regras importantes:

- O motorista **não cria OS**. Ele só vê as OS que são dele.
- Só dá para **excluir** uma OS que está Aberta e ainda não teve coleta. Depois disso, o gestor usa **Cancelar**.
- O sistema não deixa ficar **sem nenhum admin ativo** nem **sem nenhum gestor ativo**.
- Ninguém muda o próprio papel. Para trocar a própria senha, use **Alterar senha** (o reset é para os outros).
- Desativar um usuário encerra o turno dele e desconecta na hora.

---

## Primeiro acesso e senha provisória

1. O admin ou o gestor cria o usuário (ou reseta a senha dele) e define uma **senha provisória** (mínimo 6 caracteres).
2. Ele passa essa senha para a pessoa, de forma particular (pessoalmente ou por mensagem direta).
3. No primeiro login, o app **obriga** a pessoa a criar uma senha própria antes de mostrar qualquer outra tela. O servidor também bloqueia tudo até a troca.
4. Depois disso, qualquer pessoa pode trocar a senha em **Alterar senha**.

Esqueceu a senha? Peça ao admin ou ao gestor para **Resetar senha** na tela Equipe. Quando a senha é resetada, a pessoa é desconectada de todos os aparelhos.

---

## Usuário Master

O Master é criado pelas variáveis do Railway — a senha nunca precisa passar por chat ou e-mail.

1. No Railway, crie `MASTER_NAME`, `MASTER_EMAIL` e `MASTER_PASSWORD` (mínimo 6 caracteres; use uma senha forte).
2. O Railway reinicia o servidor sozinho. A conta Master é criada (ou, se o e-mail já existir, essa conta vira Master).
3. Entre com esse e-mail e senha. Não há troca obrigatória no primeiro acesso, porque a senha foi escolhida por você.

Como funciona:

- Existe **um só Master**: o e-mail que está em `MASTER_EMAIL`. Trocou o e-mail na variável? O selo passa para a nova conta.
- Na tela Equipe ele aparece com o selo **Master**, e ninguém mais tem botões de ação no cartão dele.
- **Esqueceu a senha do Master?** Troque `MASTER_PASSWORD` no Railway. Ao reiniciar, a senha é redefinida e o Master é desconectado dos aparelhos.
- Se você **não** mexer na variável, reiniciar o servidor **não** desfaz uma troca de senha feita pelo app (Alterar senha).

---

## Rodar no seu computador

Pré-requisito: **Node.js 20 ou mais novo**.

```bash
npm install
npm run dev
```

Abra **http://localhost:3000**. A API, o WebSocket e as telas rodam juntos nessa porta.

**Primeiro login local:** quando o banco está vazio, o servidor cria **uma única conta de administrador**:

- e-mail: `admin@logitrack.com` (ou o valor de `ADMIN_EMAIL`)
- senha provisória: o valor de `ADMIN_PASSWORD` ou, se ela não for definida, a senha padrão `admin123`

No primeiro login o app pede para criar uma senha nova. Depois, crie os outros usuários pela tela **Equipe**.

Para usar outra senha logo na primeira vez, passe a variável ao iniciar:

```bash
ADMIN_PASSWORD=minha-senha-provisoria npm run dev
```

O banco local fica no arquivo `logistic.db`, na pasta do projeto (ele não vai para o Git). Para começar do zero **no seu computador**, pare o servidor e apague esse arquivo.

Outros comandos:

| Comando | Para que serve |
|---|---|
| `npm run lint` | confere os tipos do TypeScript |
| `npm run build` | gera as telas de produção na pasta `dist/` |
| `npm start` | roda em modo produção (usa a pasta `dist/`) |

---

## Variáveis de ambiente

O arquivo [`.env.example`](.env.example) tem todas as variáveis com exemplos. **Nunca** coloque senhas reais no Git.

### Railway (servidor)

| Variável | Obrigatória? | O que faz |
|---|---|---|
| `DATABASE_PATH` | **sim** no Railway | Onde fica o banco. Use `/data/logistic.db` (dentro do Volume). |
| `ADMIN_EMAIL` | não | E-mail do primeiro admin. Padrão: `admin@logitrack.com`. |
| `ADMIN_PASSWORD` | recomendada | Senha provisória do primeiro admin. |
| `GESTOR_NAME`, `GESTOR_EMAIL`, `GESTOR_TEMP_PASSWORD` | não | Criam um gestor ao iniciar, se ainda não existir usuário com esse e-mail. |
| `MOTORISTA_NAME`, `MOTORISTA_EMAIL`, `MOTORISTA_TEMP_PASSWORD` | não | Criam um motorista ao iniciar, se ainda não existir usuário com esse e-mail. |
| `MASTER_NAME`, `MASTER_EMAIL`, `MASTER_PASSWORD` | não | Criam/atualizam a conta **Master** a cada início. Veja [Usuário Master](#usuário-master). |
| `PORT` | não | O Railway define sozinho. |

- `ADMIN_EMAIL` e `ADMIN_PASSWORD` **só valem quando o banco está vazio**. Se o admin já existe, elas não mudam nada.
- As senhas de `GESTOR_*` e `MOTORISTA_*` são provisórias (mínimo 6 caracteres): a pessoa troca no primeiro acesso.

### Vercel (telas)

| Variável | Obrigatória? | O que faz |
|---|---|---|
| `RAILWAY_API_URL` | **sim** | Endereço público da API no Railway, começando com `https://` e **sem** barra no final. Sem ela, o build na Vercel **para de propósito** com uma mensagem explicando. |
| `VITE_WS_URL` | não | Endereço dos avisos em tempo real (WebSocket). Se ficar vazia, usa o mesmo de `RAILWAY_API_URL`. |

Depois de salvar ou mudar variáveis na Vercel, é preciso fazer **Redeploy**.

---

## Publicar (deploy): passo a passo

Siga **nesta ordem**:

1. **Railway: crie o Volume primeiro.**
   No serviço da API, crie um **Volume montado em `/data`**. Só depois adicione a variável `DATABASE_PATH=/data/logistic.db`.
   Aproveite para definir `ADMIN_PASSWORD` (e, se quiser, as variáveis `GESTOR_*` e `MOTORISTA_*`).
   > ⚠️ Sem o Volume, **cada deploy apaga todos os dados**. Se o servidor rodar sem Volume, o log do Railway mostra um aviso "rodando no Railway SEM volume".

2. **Railway: publique e teste.**
   Faça o deploy e abra `https://<url-do-railway>/api/health`. A resposta deve ser `{"ok":true}`.

3. **Vercel: aponte para a API.**
   Em *Settings → Environment Variables*, defina `RAILWAY_API_URL=https://<url-do-railway>` e faça **Redeploy** (*Deployments → ⋯ → Redeploy*).

4. **Entre como admin e monte a equipe.**
   Faça login, crie sua senha nova e, na tela **Equipe**, cadastre **pelo menos 1 gestor** e os **motoristas** (cada um com senha provisória).
   Confira se não há contas estranhas na Equipe. Se o banco veio da versão antiga do app, **desative as contas antigas de demonstração** que vocês não usam (o log do Railway avisa quais vieram do banco antigo).

5. **Avise todo mundo.**
   Peça para todos **recarregarem o app e entrarem de novo**.

> Se o banco já tinha dados da versão antiga: na primeira subida, o servidor faz uma cópia de segurança (`logistic.db.bak-<data>`) e converte o banco. As senhas antigas continuam funcionando, mas cada pessoa precisa criar uma senha nova no próximo login.

---

## Roteiro de teste (do começo ao fim)

Use dois aparelhos ou dois navegadores: um para o **admin** (computador) e outro para o **motorista** (celular). Veja as [Dicas](#dicas).

1. **Admin** → Equipe → **Novo usuário**: cria um motorista com senha provisória.
2. **Motorista** entra com a senha provisória e **cria a própria senha**.
3. **Motorista** → **Iniciar Turno**: informa a placa do cavalo e marca cada item do checklist como **OK** ou **Problema**.
4. **Admin** → Ordens → **Nova OS** para esse motorista (número, origem, destino, data e horário previsto).
5. **Motorista** recebe o **aviso** da nova OS e abre a OS.
6. **Motorista** → **Iniciar OS**: escolhe carreta **cheia** ou **vazia**, informa a placa da carreta → **Iniciar Viagem**. A OS fica "Em rota".
7. **Motorista** → **Finalizar Viagem**. A OS fica "Finalizada".
8. **Admin** vê tudo atualizar sozinho. Abre a OS, toca em **Editar (KM e custo)** e lança o **KM** e o **Custo (R$)**. O **Painel** mostra o gráfico dos últimos 7 dias com esses valores.
9. **Realocação**: o admin abre uma OS e usa **Realocar** (com motivo). O **gestor** aprova ou reprova em **Aprovações**.
10. **Reset de senha**: o admin reseta a senha do motorista. O motorista é desconectado e precisa entrar com a nova senha provisória e trocá-la.
11. **Sem internet**: com uma OS em rota, desligue a internet do celular, toque em **Finalizar Viagem**, religue a internet e confira que o registro foi enviado.

---

## Dicas

- **Teste admin e motorista em navegadores diferentes** (por exemplo, Chrome e Firefox) **ou numa janela anônima**. No mesmo navegador, a sessão é compartilhada e um login substitui o outro.
- **Motorista sem internet:** o app guarda a coleta e a entrega **no celular** e envia sozinho quando a internet voltar. A tela mostra "pendente envio" enquanto isso.
  **Enquanto houver registros pendentes, não saia do app (Sair) nem limpe os dados do navegador**, senão esses registros se perdem. O app pergunta antes de sair se houver pendências.
- Se o servidor recusar um registro (por exemplo, a OS foi passada para outro motorista), ele aparece em **"não enviados"** na tela do motorista.
- **KM e custo** aceitam vírgula: `1200,50`.
- **Previsto** é o horário planejado pelo escritório; **Realizado** é o horário registrado pelo motorista (o escritório pode ajustar).
- Motorista esqueceu de encerrar o turno? Use **Equipe → Encerrar turno**.

---

## Estrutura do projeto

```
server.ts                  API (Express), banco SQLite, WebSocket e regras de acesso.
                           No modo dev, também serve as telas.
railway.toml               configuração do Railway (healthcheck e reinício automático)
vercel.json                configuração da Vercel
scripts/prepare-vercel.mjs confere a URL da API durante o build na Vercel
.env.example               lista de variáveis de ambiente, com exemplos
src/
  App.tsx                  rotas, proteção por papel e avisos em tempo real
  types.ts                 tipos usados nas telas
  lib/                     sessão, chamadas à API, login, eventos, fila offline e cache
  components/admin/        caminho administrativo (painel, ordens, equipe, aprovações...)
  components/driver/       caminho do motorista (turno, minhas OS, detalhe da OS)
  components/common/       peças compartilhadas (login, troca de senha, checklist, botões)
  utils/                   datas no horário de Manaus, números e rótulos
```
