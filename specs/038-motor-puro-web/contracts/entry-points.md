# Contrato: os pontos de entrada do clayflow (spec 038)

## `clayflow` (núcleo)

- Carrega em qualquer ambiente com WebGPU, sem DOM e sem `Deno` (verificado pelo lint e pelo teste no Deno).
- Exporta tudo que hoje é público e não é do navegador: recursos, Flows, `createScene`, os eventos, os tipos de GPU da
  C2, e os contratos `PresentationSurface` (tipo), `FrameClock` e `InputSource`.
- Não exporta `Application` (que fica nos pontos de entrada).

## `clayflow/web`

```ts
import { Application } from 'clayflow/web';
const app = await Application.create({ canvas, scene: createScene() }); // como hoje
```

- `Application.create` com as mesmas opções de hoje (canvas, `autoResize`, `antialias`, `canvasOptions`, `profiling`…):
  quem usa hoje só troca o import de `clayflow` para `clayflow/web`.
- Exporta também a entrada DOM, os controladores, `FontLoader`, `HeightmapLoader` e a UI.

## `clayflow/deno`

```ts
import { Application } from 'clayflow/deno';
// Desenho em textura (sem janela): cada quadro lido de volta.
const app = await Application.create({
  target: { width: 1280, height: 720 },
  scene: createScene(),
});
app.step(1 / 60);
const pixels = await app.read(); // { width, height, format, data }
// Janela nativa (SDL2):
const win = await Application.create({
  window: { title: 'clayflow', width: 1280, height: 720 },
  scene: createScene(),
});
win.run(); // o laço até a janela fechar
```

- Os limites pedidos ao dispositivo são os mesmos do web (o teto portátil nas ligações).
- Sem janela, o laço é manual (`step`); com janela, `run` usa o relógio do Deno.

## Erros

- Capacidade ausente no ambiente (formato, função opcional, SDL não encontrada): `engineError` com o nome do que falta,
  como no navegador; nunca falha silenciosa.

## clayflow-web (scripts)

| Script                                                                         | O que faz                                       |
| ------------------------------------------------------------------------------ | ----------------------------------------------- |
| `npm run dev`                                                                  | o app com o catálogo de cenas (`?scene=<nome>`) |
| `npm run video -- <cena>[,…] [--frames N] [--lossless] [--10bit] [--size LxA]` | grava pelo Chrome (o runner de hoje, movido)    |
| `deno task video <cena> [--frames N]`                                          | grava pelo Deno (textura → ffmpeg)              |
