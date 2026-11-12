---
sidebar_position: 24
title: Vídeo
---

# Vídeo — gravar quadro a quadro, lido direto da GPU (specs 034 e 038)

O motor não grava vídeo: ele dá as peças para quem grava. O gravador é uma ferramenta do app **clayflow-web** (o
repositório `claflow-web`, spec 038), que monta as cenas do catálogo dele e escreve os quadros no ffmpeg. Este guia
mostra o lado do motor — o passo fixo, a prontidão e a leitura do quadro apresentado — e o uso do gravador do app.

## O lado do motor

Três peças fazem uma gravação determinística, sem perda antes do codificador:

1. **A leitura do quadro** — `app.core.readCanvas()` copia a textura apresentada para um buffer de leitura e devolve
   os pixels (`CanvasPixels`: `width`, `height`, `format`, `bytesPerPixel` e `data`, linha a linha, de cima para baixo,
   sem preenchimento). Exige o canvas configurado com `canvasOptions.capture: true`, que dá à textura do canvas o uso de
   cópia. Deve ser chamada na mesma tarefa do quadro: a textura do canvas só vale até a tarefa ceder.
2. **A prontidão** — `await app.whenReady()` antes do primeiro quadro: nada de quadros com estágios compilando
   ([Prontidão](./readiness.md)).
3. **O passo fixo** — sem o laço (`app.start()` não é chamado), cada quadro avança por `app.step(1 / 60)`: o mesmo
   caminho do laço, com o tempo decidido por quem grava, não pelo relógio. O vídeo sai a 60 quadros por segundo
   qualquer que seja o tempo que a GPU leve.

```ts
import { Application, createScene } from 'clayflow/web';

const canvas = document.createElement('canvas');
canvas.width = 1280;
canvas.height = 720;
document.body.appendChild(canvas);

const app = await Application.create({
    canvas,
    scene: createScene(),
    autoResize: false,                 // o tamanho do vídeo é o do canvas
    canvasOptions: { capture: true },  // a leitura do quadro apresentado
});
montarCena(app);
await app.whenReady({ timeoutMs: 120_000 });

for (let i = 0; i < 300; i++) {
    animar(i);                         // a câmera, os objetos: por índice de quadro
    app.step(1 / 60);
    const pixels = await app.core.readCanvas(); // na mesma tarefa do quadro
    await entregar(i, pixels);         // ao codificador
}
app.dispose();
```

- **10 bits**: com `canvasOptions.format: 'rgba16float'`, o canvas fica em meia precisão e o mapeamento de tons não
  quantiza em 8 bits antes do codificador (`format` dos pixels é `rgba16float`, 8 bytes por pixel). Nos formatos de 8
  bits, `bgra8unorm` ou `rgba8unorm`, 4 bytes por pixel.
- **O antisserrilhado** é o da cena. O temporal acumula entre os quadros do passo fixo como no laço; para uma imagem
  parada de referência, `accumulate` ([Antisserrilhado](./antialiasing.md)).
- **O tempo da GPU** de cada quadro sai no evento `gpuFrameTimed` com `profiling: 'frame'` na criação: diz quantos
  quadros por segundo a cena teria em tempo real.
- **No Deno** (`clayflow/deno`), o `Application` com `target: { width, height }` desenha numa textura, sem tela; a
  leitura já vem ligada e o quadro sai por `app.read()`, logo depois de cada `step`.

## O gravador do clayflow-web

No repositório `claflow-web`, ao lado do motor:

```bash
npm run video -- <cena>[,<cena>…] [--frames N] [--out pasta] [--lossless] [--10bit] [--size 1280x720] \
                 [--timeout s] [--aa off|temporal|msaa|accumulate] [--profile high|medium|low]
```

- A página do gravador (`src/recorder/page.ts`) monta a cena do catálogo (`src/scenes/catalog.ts`: `lente`,
  `dispersao`, `ondulacao`, `agua`, `molhar`, `causticasvidro`, `causticas`, `natureza`, `cornell`, `dia`, `nevoa`,
  `pano`, `sprites` e outras), espera o motor pronto e lê cada quadro por `readCanvas`, sem canvas 2D nem JPEG. O
  runner (`runner/video.ts`, pelo Chrome com WebGPU) escreve os pixels no ffmpeg.
- Saídas por cena: `<cena>.mp4` (H.264 High, 4:2:0, CRF 8, 60 FPS); com `--10bit`, `<cena>-10bit.mp4` (HEVC Main10,
  SDR BT.709, a partir do canvas em `rgba16float`); com `--lossless`, `<cena>-lossless.mkv` (FFV1, os quadros exatos).
  Com `--profile`, o perfil do renderizador vale antes da cena e o nome do arquivo ganha `-<perfil>`.
- Conferência: cada quadro do vídeo é comparado com o exato (FFV1, sempre gravado; apagado sem `--lossless`): brilho
  ≥ 50 dB e RGB ≥ 45 dB de PSNR. Saída 0 quando todas gravaram e passaram, 1 quando alguma falhou e 3 em erro de
  ambiente. Navegador e ffmpeg têm prazo e são encerrados em qualquer saída.
- Pelo Deno: `deno task video [quadros] [largura altura] [saída]` grava a cena do tanque pela textura
  (`deno/video.ts`), com prazo por quadro.

O motor ainda tem o gravador antigo dos smokes (`npm run video` neste repositório, cenas de
`src/__smokes__/videoScenes.ts`), com as mesmas opções sem `--profile`; a retirada dele é a T030 da 038.
