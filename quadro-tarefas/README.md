# Minhas Tarefas

Aplicativo web gamificado para o controle de tarefas e poupança familiar.

## Visão geral

O projeto é um frontend estático em HTML e JavaScript vanilla, estilizado com Tailwind CSS via CDN. Ele usa Supabase para:

- autenticação de usuários (familias);
- armazenamento e sincronização do estado da família;
- permissões via Row Level Security.

O fluxo principal é:

1. `index.html`: tela de login / registro da família;
2. `tela1.html`: painel de tarefas para as crianças;
3. `tela2.html`: painel de administração para os pais.

## Estrutura de arquivos

- `index.html`: acesso ao app, login, cadastro e escolha entre visão de criança e visão dos pais.
- `tela1.html`: board de tarefas, mostrando tarefas disponíveis, em andamento, pendentes e concluídas.
- `tela2.html`: painel dos pais com gerenciamento de crianças, tarefas, resgates e gráficos.
- `supabase-client.js`: cliente Supabase com URL e chave `anon` pública.
- `cofrinho-data.js`: estado principal do app, persistência local e sincronização Supabase.
- `manifest.json`: configuração PWA para instalação como app.
- `supabase-setup.sql`: script de criação da tabela `family_state` no Supabase.
- `vercel.json`: configuração de deploy para Vercel.

## Funcionalidades

### Cadastro e autenticação

- Registro com e-mail e senha.
- Login com e-mail e senha.
- Autenticação via `supabase.auth`.
- Redirecionamento para tela principal após login.

### Board das crianças (`tela1.html`)

- Menu de tarefas disponíveis.
- Mover tarefas para "Fazendo".
- Enviar tarefas para "Check dos Pais".
- Visualizar tarefas concluídas.
- Ver saldo do cofrinho e metas familiares.
- Sincronização em tempo real entre telas e dispositivos usando Supabase Realtime.

### Painel dos pais (`tela2.html`)

- Cadastro e edição de crianças.
- Monitoramento do saldo total da família.
- Gráficos de estatísticas de tarefas.
- Aprovação ou rejeição de tarefas pendentes.
- Resgates do cofrinho com histórico e filtro.
- Criação de novas tarefas e surpresas rápidas.
- Exportação de histórico (CSV).

## Como o estado funciona

O estado da aplicação é mantido em `localStorage` com a chave:

- `cofrinhoMagico_v2`

Se o usuário estiver autenticado, o app também sincroniza o estado com a tabela Supabase `public.family_state`:

- `family_id` = `auth.users.id`
- `data` = JSON com todo o estado da família
- `updated_at` = timestamp de atualização

A sincronização funciona em duas direções:

- leitura inicial ao abrir o app;
- gravação automática ao mudar o estado local;
- Realtime para atualizar todas as sessões conectadas.

## Supabase

### Script de inicialização

Execute `supabase-setup.sql` no SQL Editor do seu projeto Supabase.

Esse script cria a tabela `public.family_state` e aplica Row Level Security (RLS) para que cada família veja apenas seu próprio estado.

### Políticas

- `Families can read own state`
- `Families can insert own state`
- `Families can update own state`

### Configuração de URLs

No Supabase, configure em Authentication > URL Configuration:

- Site URL
- Redirect URLs

Exemplo de Redirect URL:

```text
https://seu-projeto.vercel.app/**
```

## Deploy

### Vercel

Este projeto está pronto para ser publicado na Vercel.

Opções:

1. Deploy a partir da pasta `quadro-tarefas`.
2. Deploy a partir da raiz `d:\homework` com o `vercel.json` do diretório `quadro-tarefas`.

Configurações no Vercel:

- Build command: vazio
- Output directory: vazio
- `vercel.json` já configura `cleanUrls`, `trailingSlash=false` e headers de segurança.

## Desenvolvimento local

Rode o app com um servidor estático para evitar problemas de `file://`:

```bash
cd quadro-tarefas
npx serve .
```

## Observações de segurança

- `supabase-client.js` contém a chave `anon`, que é apropriada para apps frontend.
- Nunca exponha ou publique a chave `service_role` no frontend.

## Personalização

O estado inicial define:

- duas crianças (Tabitha e Hinata);
- catálogo inicial de tarefas com frequências `diario` e `extra`;
- metas familiares e bônus semanais.

Você pode ajustar esses valores em `cofrinho-data.js` ou via painel dos pais.
