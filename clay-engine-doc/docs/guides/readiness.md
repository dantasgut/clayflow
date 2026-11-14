---
sidebar_position: 23
title: Prontidão
---

# Prontidão — saber quando o quadro sai completo (spec 034)

Uma cena nova não sai inteira no primeiro quadro: os pipelines compilam em segundo plano, a composição dos pontos de
cena se refaz quando entra uma luz ou um material, e uma entidade inserida leva um ou dois quadros até as reações dela
(envio, Flows novos) aparecerem. A **prontidão** do motor diz, a cada quadro, se ainda há trabalho pendente e qual.
Ela não bloqueia o quadro: quem precisa da imagem completa (uma medida, um vídeo, uma captura) espera por ela.

## `whenReady()`

```ts
const app = await Application.create({ canvas });
montarCena(app);
await app.whenReady();          // prazo padrão: 30 s
app.start();
```

`app.whenReady({ timeoutMs })` resolve quando um quadro gravado **depois da chamada** termina sem nada pendente: o que
acabou de ser inserido entra na conta.

- **Com o laço parado**, avança quadros vazios (`step(0)`, sem tempo de simulação), um a cada 16 ms, cedendo ao
  navegador entre eles e só quando a GPU tem espaço para mais um quadro (`readyForFrame()`, como o laço).
- **Com o laço rodando**, só observa os quadros dele.
- O tempo da simulação nunca é tocado.
- Vencido o prazo, rejeita com um `Error` que lista o que falta, um item por pipeline: `Flow/pipeline (motivo: binding)`.

## O que conta como pendente

A cada quadro, a reconciliação dos Flows ativos produz a lista do que falta (`PendingWork`):

| Motivo      | Significado                                                                                                   |
| ----------- | ------------------------------------------------------------------------------------------------------------- |
| `waiting`   | um binding do pipeline sem fonte na cena (`name` diz qual)                                                   |
| `verifying` | a conferência do compilador está em andamento                                                                 |
| `compiling` | a compilação está em andamento                                                                                |
| `swapping`  | o pipeline refeito com a composição nova da cena ainda não entrou no lugar do atual                           |
| `settling`  | entidades entraram ou saíram e as reações delas ainda não apareceram (os dois quadros seguintes; `flow` = `World`) |

O motor está pronto (`ready`) quando a lista está vazia; senão, `preparing`. O estado fica em
`app.resources.readiness` (`state`, `pending`, `revision`).

## Os eventos

```ts
app.events.on('enginePreparing', (e) => console.log('preparando', e.revision, e.pending));
app.events.on('engineReady', (e) => console.log('pronto', e.revision));
app.events.on('consumerMissing', (e) => console.warn(`${e.flow}/${e.pipeline}: '${e.name}' sem fonte`));
```

- `enginePreparing { revision, pending }` e `engineReady { revision }` saem só nas transições (e na primeira
  avaliação). A `revision` sobe a cada transição.
- `consumerMissing { flow, pipeline, name }`: um binding de um Flow ativo continua sem fonte depois de 120 quadros
  seguidos (2 s a 60 Hz, `CONSUMER_MISSING_FRAMES`). Uma fonte que chega por envio aparece em um ou dois quadros; uma que
  nunca chega é um consumidor sem fornecedor (falta o resolvedor ou o pool). O aviso sai uma vez por Flow, pipeline e
  nome; o pipeline segue esperando e o Flow não grava.

## O laço segura o tempo da cena

Enquanto a prontidão **segura o tempo** (`readiness.holdsTime`), o laço de quadros (`app.start()`) avança com tempo
zero: desenha, mas a simulação e o movimento da cena não andam com estágios pela metade. A colisão ainda compilando
deixaria a água atravessar as paredes. A marca de tempo segue, e o tempo da espera não é recuperado depois.

`holdsTime` vale enquanto há trabalho que termina sozinho (conferência, compilação, troca, a cena assentando) ou um
binding sem fonte que ainda não foi dado como ausente. Depois do `consumerMissing`, aquele binding deixa de segurar o
tempo: um consumidor sem fornecedor não congela a cena para sempre.

O `step()` manual não é afetado: quem avança por `step(dt)` (testes, gravação, pré-cálculo) decide o tempo. Para
começar a simulação com tudo pronto, chame `whenReady()` antes do primeiro `step(dt)`.

## Dicas

- Medidas e capturas: `await app.whenReady()` depois de montar a cena e depois de cada troca que recompila (um
  material novo, uma luz ou um ambiente que muda a composição dos pontos de cena, um efeito do pós). Os smokes e o gravador de vídeo fazem assim
  ([Vídeo](./video.md)).
- Compilações longas (a primeira vez de uma cena com água, vidro e luz global) podem passar dos 30 s em máquinas mais
  lentas: passe `timeoutMs` maior em vez de repetir a chamada.
- A lista de `enginePreparing` é a forma de achar um estágio que não sai: o motivo `waiting` com o nome do binding
  aponta o fornecedor que falta.
