---
sidebar_position: 22
title: Antisserrilhado
---

# Antisserrilhado — a amostra deslocada no pixel, o histórico e o corte de câmera (spec 034)

O antisserrilhado da cena vale para todos os passes: a geometria, as sombras, a refração traçada, a luz global de tela
e a névoa recebem a mesma posição da amostra dentro do pixel a cada quadro, e a resolução da apresentação acumula a
imagem no tempo. É uma peça da cena, guardada no renderizador (`app.defaults.renderer.antialiasing`, um
`TemporalAntialiasing`).

## Modos

| Modo         | O que faz                                                                                                                    |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `temporal`   | padrão: a amostra se desloca dentro do pixel a cada quadro; o histórico é reprojetado pelos vetores de movimento, com rejeição |
| `accumulate` | média uniforme de todos os quadros desde o último corte, sem rejeição: a imagem parada de referência, ou a captura de qualidade |
| `msaa`       | 4 amostras por pixel nas bordas da geometria (spec 008), sem deslocamento nem histórico                                      |
| `off`        | uma amostra no centro do pixel                                                                                               |

O modo se escolhe na criação da aplicação; `true` vale `'temporal'` e `false`, `'off'`:

```ts
import { Application } from 'clayflow/web';

const app = await Application.create({ canvas, antialias: 'temporal' }); // o padrão
```

Depois da criação, o modo muda entre `temporal`, `accumulate` e `off` pelo renderizador; vale no quadro seguinte e o
histórico recomeça:

```ts
app.defaults.renderer.antialiasing.mode = 'accumulate';
```

O `msaa` só vale na criação: ele muda o número de amostras dos alvos da cena (`FrameTargets`). A opção vale para a
cena inteira; com várias aplicações na mesma cena, a primeira define.

## Como funciona o temporal

- **A posição da amostra**: a sequência de Halton nas bases 2 e 3, centrada no pixel (cada eixo em [−½, ½)), repetida a
  cada 64 posições (`TemporalAntialiasingOptions.sequence`; até 1024). O estágio de câmera desloca a projeção
  (`CameraMatrices.jitter`) e guarda a vista-projeção sem o deslocamento, para a reprojeção. O padrão da penumbra das
  sombras gira e se desloca pela mesma sequência; o acúmulo faz a média.
- **Os vetores de movimento**: cada passe que desenha escreve o movimento do que o pixel mostra (`FrameTargets.motion`):
  a câmera, as instâncias, os sprites das partículas e o que a refração mostra (`RefractionMotionFlow`).
- **A resolução**: a primeira etapa do `PostFlow`, antes dos efeitos e da apresentação. Reprojeta o histórico pelo
  vetor de movimento (no fundo, pela câmera), lido com Catmull–Rom. A desoclusão (a distância à câmera guardada difere
  em mais de 5 %), o corte de câmera, o primeiro quadro e o ponto que sai da tela recomeçam o histórico. Parado, o
  detalhe menor que o pixel converge para a integral do pixel (memória de cerca de 64 quadros); perto de movimento, a
  caixa da variância da vizinhança 3 × 3 recorta o histórico (memória de cerca de 4 quadros). A luz direta que chega ao
  ponto, comparada à do quadro anterior, separa a sombra que passa sobre a superfície parada do detalhe fino. A máscara
  reativa (`FrameTargets.reactive`) recomeça o histórico onde o que o pixel mostra mudou sem que o vetor de movimento o
  leve até lá: o que se vê pelo vidro.

### O histórico

O histórico é uma série temporal da C2 (spec 037): três séries do tamanho do canvas, cada uma com a fatia do quadro
anterior e a do quadro atual. São a cor, o estado por pixel (a distância à câmera, o movimento e os quadros
acumulados) e a luz que chegava ao pixel. Não há cópia de paridade: a C2 alterna as fatias.

A cor fica em 32 bits por canal por padrão (`historyPrecision: 'full'`): o erro de 16 bits aparece na imagem parada.
`'full'` exige a feature `float32-filterable`, porque o histórico é lido filtrado; sem ela, o histórico fica em 16 bits
(`'half'`) com aviso. Mudar a precisão realoca a série e o histórico recomeça:

```ts
app.defaults.renderer.antialiasing.historyPrecision = 'half';
```

## O corte de câmera

Quando a imagem de um quadro não continua a do anterior (teletransporte, troca de plano, câmera nova), avise o motor
com `Camera.cut()`:

```ts
camera.cut(); // o próximo quadro descarta os históricos
cameraTransform.data.position = [0, 10, 40, 1];
```

No quadro do corte, o antisserrilhado temporal, a luz global de tela e a névoa recomeçam o histórico; o estágio de
câmera desliga a marca depois. No primeiro quadro de uma câmera vale o mesmo. No modo `accumulate`, o corte recomeça a
média.

## Na captura

Uma imagem de referência parada se faz em `accumulate`: a média de N quadros é a integral do pixel com N posições da
amostra. Os smokes de imagem (`refraction`, `materials`) medem assim. Em vídeo, o modo é o da cena
([Vídeo](./video.md)).

## Medidas

O smoke `antialiasing` mede a imagem apresentada contra a referência do próprio motor (o modo `accumulate` com 256
posições da amostra, câmera parada): o erro médio e o das bordas parado, o rastro de uma bola e de sprites que
atravessam a cena, a órbita da câmera em volta do vidro e a cobertura dos sprites. O custo da resolução entra no tempo
de cada perfil do renderizador ([Renderizador](./renderer.md)).
