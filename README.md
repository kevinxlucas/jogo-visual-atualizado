# Jogo Visual

Aplicação web estática de treino visual com persistência local, dashboard, histórico, exportação e sincronização opcional com Google Sheets através de Google Apps Script.

## Como correr localmente

1. Abre uma consola nesta pasta:

```bash
cd /Users/kevinlucas/jogo-visual-atualizado
python3 -m http.server 8766 --bind 127.0.0.1
```

2. Abre no browser:

```text
http://127.0.0.1:8766/
```

Também pode ser publicada como app estática na Vercel, Netlify ou qualquer servidor HTTP.

## Ficheiros principais

- `index.html` — estrutura da app e navegação permanente.
- `styles.css` — layout responsivo, painéis, modal e dashboard.
- `app.js` — jogo p5 preservado + persistência IndexedDB + dashboard + histórico + exportação + sincronização.
- `config.js` — configuração local do URL `/exec` do Google Apps Script, sem credenciais.
- `google-apps-script/Code.gs` — código a copiar para o Google Apps Script.
- `manifest.webmanifest`, `favicon.svg`, `apple-touch-icon.svg`, `sw.js` — PWA básico, ícone/favicon e cache offline.
- `vendor/p5.min.js`, `vendor/p5.sound.min.js` — p5.js e p5.sound locais para funcionamento offline depois de carregado.

## Estado inicial corrigido

Ao abrir a aplicação:

- aparecem formas geométricas visíveis;
- não aparecem números como estado inicial;
- as formas estão paradas;
- o jogo não começa automaticamente;
- o movimento só inicia quando o utilizador carrega em `Jogar`/clique inicial e pode continuar a ser alternado com `M`;
- a lógica original do movimento foi preservada.

## Persistência local

A app usa IndexedDB com o nome obrigatório:

```text
Jogo Visual
```

Cada tentativa concluída gera um registo local com ID único. A app também guarda em `localStorage` um snapshot da tentativa em curso sempre que há nova pergunta/resposta/observação, para recuperar dados se a página fechar inesperadamente.

Estados de sincronização usados:

- `local_only`
- `pending_sync`
- `synced`
- `sync_error`

A app funciona sem internet. Se não houver ligação ou o Google Apps Script não estiver configurado, os dados continuam guardados localmente e ficam pendentes.

## Google Sheets / Google Apps Script

Solução escolhida: **Google Apps Script publicado como Web App**.

Motivo: é a opção mais simples para uma app estática, evita client secrets no browser e permite criar/reutilizar automaticamente a Google Sheets chamada `Jogo Visual` com permissões do utilizador que publica o script.

### Configurar

1. Vai a <https://script.google.com/>.
2. Cria um projeto novo chamado `Jogo Visual`.
3. Substitui o conteúdo de `Code.gs` pelo conteúdo de `google-apps-script/Code.gs` desta pasta.
4. Clica em **Deploy > New deployment**.
5. Tipo: **Web app**.
6. Execute as: **Me / Eu**.
7. Who has access: idealmente **Anyone with the link** ou a opção disponível que permita à app chamar o endpoint.
8. Autoriza permissões Google quando solicitado.
9. Copia o URL terminado em `/exec`.
10. Abre a app, entra no **Dashboard**, cola o URL no campo “URL /exec do Google Apps Script para sincronização” e clica **Guardar URL**.

### O que o script faz

- Procura uma Google Sheets chamada `Jogo Visual`.
- Se existir, reutiliza.
- Se não existir, cria automaticamente uma nova.
- Cria/normaliza a folha `Registos`.
- Garante os cabeçalhos exigidos.
- Antes de inserir, verifica se o `ID único da tentativa` já existe.
- Se já existir, não duplica.
- Permite listar dados remotos para atualizar o dashboard local.

## Exportação

Botão **Exportar Dados**:

- CSV: `jogo-visual-dados.csv`
- Excel: `.xls` HTML compatível com Excel/Numbers
- PDF: abre uma janela de impressão com tabela dos registos reais guardados

## Dashboard e gráficos

Os gráficos usam os registos reais guardados em IndexedDB e, quando configurado, dados importados/sincronizados do Google Sheets.

Gráficos incluídos:

1. Evolução da pontuação.
2. Evolução do nível máximo.
3. Evolução da autoavaliação.
4. Correlação entre autoavaliação e desempenho real.
5. Tempo médio de resposta.
6. Percentagem de acerto.

## Atalhos preservados

- `M` — alterna movimento.
- `F` — alterna formas/números.
- `T` — alterna modo com/sem tempo.
- `Q` — alterna divisões.
- `D` — alterna estilo.
- `C` — alterna movimento para o centro.
- `+`/`-` — tamanho.
- Setas — deslocam estímulo quando visível.
- `1`, `2`, `3`, `4` — respostas.
- `Espaço` — nova ronda depois dos resultados.

## Publicar na Vercel

A pasta é estática. Na Vercel, importa a pasta/repositório e deixa:

- Build command: vazio
- Output directory: `.`

Nenhuma credencial deve ser colocada no código.
