# Jade Study

Nome do projeto: 中文学习 — Meu Sistema de Estudo de Mandarim

Descrição geral: Quero um app web responsivo (mobile-first) de estudo de mandarim personalizado. O app deve ter autenticação simples (login com e-mail), salvar progresso no banco de dados, e ter três modos de estudo principais.

IDENTIDADE VISUAL

Tema escuro elegante

Cores: vermelho #c8102e, dourado #ffd700, fundo #1a0a0a, creme #fdf6ec

Tipografia: Noto Serif SC para ideogramas, Lora para textos em português

Estética: sofisticada, cultural, como um caderno de estudos premium

MÓDULO 1 — FLASHCARDS COM PROGRESSO REAL

Baralho com todos os cards embaralhados

Frente: ideograma grande + categoria no canto

Verso: pinyin + significado em português

Ao virar o card, aparecem dois botões: "Acertei ✓" e "Errei ✗"

O sistema registra acertos e erros por card no banco de dados

Cada sessão passa por TODOS os cards antes de repetir — sem pular nenhum

Cards com mais erros aparecem com mais frequência nas próximas sessões (spaced repetition simples)

Barra de progresso mostrando quantos cards faltam na sessão atual

Botão "Recomeçar sessão" que reinicia o baralho embaralhado

MÓDULO 2 — MODO CONVERSA COM IA

Chat integrado com Claude API (claude-sonnet-4-20250514)

A IA assume o papel de professora chamada 小红 (Xiǎo Hóng)

Ela conversa em português MAS insere os ideogramas aprendidos naturalmente nas frases

Ela usa APENAS o vocabulário que o usuário já aprendeu (lista fornecida no system prompt)

Ela corrige erros gentilmente, elogia acertos, e sugere como formar frases simples

Ela adapta a dificuldade: começa com frases curtíssimas e vai aumentando conforme o usuário evolui

Exemplos de atividades que ela pode propor:

"Como você diria 'Eu tenho sede' em mandarim?"

"Tente me contar o que você fez ontem usando os ideogramas que você sabe"

"Vou te dar uma frase em mandarim, me diz o que significa: 你好吗？"

System prompt da IA deve incluir a lista completa de vocabulário aprendido

MÓDULO 3 — CURIOSIDADES DA CHINA

Seção com cards de curiosidades sobre cultura, sociedade e história da China

Cada curiosidade tem: título, texto curto (3-5 linhas), e um ideograma relacionado ao tema

Exemplos de temas: Festival da Lua, significado do vermelho na cultura chinesa, origem dos radicais, o que significa 福, culinária regional, o sistema de escrita

As curiosidades são geradas pela Claude API — sempre frescas, nunca repetidas

Botão "Nova curiosidade" para carregar outra

VOCABULÁRIO COMPLETO DO USUÁRIO (incluir toda a lista de ideogramas, pinyin e significados — cole a lista que está no HTML que já temos)

FUNCIONALIDADES GERAIS

Login/cadastro com e-mail e senha

Progresso salvo por usuário no banco (Supabase)

Dashboard inicial mostrando: total de cards, % de acerto geral, sequência de dias estudando (streak)

Design responsivo — funciona bem no celular e no computador

Animação de virada de card (flip 3D)

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://dragon-scroll-study.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/a0f3a2ff-d827-4310-82a6-b50ebbc1c742).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
