# Retro

Página: https://lombardilomba.github.io/retro/

Para publicar: Settings → Pages → Deploy from a branch → main → / (root).

Retrospectivas em português, com HTML, CSS e JavaScript estáticos. Os arquivos estão na raiz e podem ser publicados no GitHub Pages sem build.

## Configuração Firebase

1. O app Web do projeto `retro-801fc` já está configurado em `firebase-config.js`. Se trocar de projeto, substitua o objeto público `firebaseConfig`.
2. Ative **Authentication → Métodos de login → Anônimo** e adicione o domínio de hospedagem aos domínios autorizados. No GitHub Pages, será `SEU-USUARIO.github.io`.
3. Crie um banco **Cloud Firestore**. Publique o conteúdo de `firestore.rules` na aba Regras. Não use regras abertas de teste.
4. A configuração em `firebase-config.js` vale para todos os visitantes. A opção **Configurações** na página substitui esses valores só naquele navegador.
5. Habilite faturamento Blaze e políticas **TTL** para o campo `expiresAt`, tipo timestamp, em cada grupo de coleções: `rooms`, `cards`, `cardPreviews`, `members`. A política da sala NÃO remove subcoleções; por isso os quatro grupos precisam de TTL.
6. Crie uma sala e teste o código em outro dispositivo. O criador recebe o papel de admin pelo UID anônimo. Não limpar os dados do navegador do admin: a sessão anônima é a identificação do administrador e não há recuperação de conta nesta versão.

A sala tem 24h desde a criação, sem renovação. As regras bloqueiam acesso após `expiresAt`; o TTL remove documentos depois, de forma assíncrona (em geral até 24h após expirar). Ativar TTL não é feito pela página. Sem essa política, os dados ficam no banco, embora as regras neguem acesso. Sem Firebase, o app é uma demonstração local, sem colaboração entre dispositivos. Não insira dados sensíveis na demo: localStorage não oferece isolamento entre pessoas que usam o mesmo perfil do navegador.

## GitHub Pages

Crie um repositório e envie o arquivos da raiz para a raiz. Em Settings → Pages, selecione Deploy from a branch, branch main, pasta `/ (root)`. Não envie credenciais administrativas. `firebase-config.js` contém só configuração pública e a proteção está nas regras. Não há backend próprio, Firebase Admin SDK ou segredo no código.

## Comportamentos

- A página inicial mostra apenas “Criar nova sala” e “Entrar em sala”. Não há sala, cards, participantes ou votos de exemplo; salas novas começam com zero cards e somente seu criador como participante. Salas existentes só são carregadas ao entrar com o código.

- Criar/entrar com código numérico de seis dígitos; a sala é acessível a quem souber o código e estiver autenticado anonimamente. Códigos não são senhas; para ambientes expostos considere App Check e controles de abuso.
- Cards privados: somente o autor lê, inclusive quando quem acessa é o admin. Todos veem marcadores desfocados dos outros cards, mas os textos não são enviados aos demais navegadores. A coleção `cardPreviews` contém apenas id, coluna, UID do autor e expiração. As consultas de conteúdo privado filtram pelo próprio autor para todos os papéis. Exportar e agrupar ficam bloqueados até a liberação. Cards de salas antigas ganham marcadores quando seus autores entrarem, ou quando o admin abrir uma sala já liberada. Publicar as regras novas é obrigatório; regras antigas continuam permitindo ao admin ler o texto diretamente no banco. Conteúdo que já foi revelado não pode ser apagado da memória ou de cópias de quem já o leu.
- Admin edita/cria até 12 colunas, libera cards e agrupa.
- Arrastar para outra coluna move. Soltar sobre card abre confirmação para agrupar. No celular ou teclado use o menu do card, selecione coluna ou “Agrupar com outro card”.
- Participantes não alteram nome da retro ou colunas. O autor edita, move e exclui apenas seus próprios cards individuais; admin pode moderar todos. Após agrupamento, só o admin pode editar, mover ou excluir o grupo, preservando as contribuições de outras pessoas. A proteção no servidor exige publicar `firestore.rules` no projeto Firebase.
- Um voto reversível por pessoa e card; agrupamento une votos por UID sem duplicá-los.
- Temporizador configurável (1 segundo a 3 horas), com presets, pausa e reinício. A duração escolhida é salva neste navegador. A contagem é local, não sincronizada; o conteúdo da sala sincroniza.
- Exportação Markdown. Importe/exporte ou guarde as conclusões antes do fim das 24h.

## Verificação

`node --check app.js`. Habilite Authentication Anônimo no console antes de usar salas reais. A sincronização e as regras precisam de validação no projeto, idealmente com emulador antes de uso público. O app não configura serviços ou faturação automaticamente.

## Atualização de privacidade

Após atualizar o site, publique novamente `firestore.rules` no Console Firebase → Firestore Database → Regras → Publicar. Adicione TTL de `expiresAt` ao grupo `cardPreviews`. A chave pública do app não permite publicar regras automaticamente. As restrições valem para administradores da sala; proprietários do projeto Firebase continuam tendo o acesso administrativo do próprio console.

## Testes de privacidade

Sem dependências: `npm test` testa a projeção segura, a ausência de texto privado no DOM/ARIA, as permissões do admin, a troca de consultas na liberação e o descarte de snapshots antigos.

Para as regras: `npm install` e `npm run test:rules` (Node 22+ e Java 21+). Os testes usam apenas o Firestore Emulator do projeto fictício `demo-retro-privacy`, sem alterar o projeto de produção. Verificam autor, admin, visitantes, consultas, metadados, gravações atômicas, liberação, votos, agrupamento e expiração.

## Atualizações e cache

Após editar arquivos, execute `npm run package` (Python 3). Esse comando atualiza as versões dos assets no HTML e na importação do módulo de privacidade, além do ZIP para download. Assim, a próxima atualização da página carrega os arquivos novos em vez de reutilizar o JavaScript antigo. Para recarregar imediatamente um documento já aberto, use Ctrl+Shift+R ou um link com parâmetro de versão.
