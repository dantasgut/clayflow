---
sidebar_position: 20
title: Apresentação
---

# Apresentação — da luz da cena à tela (specs 011, 034 e 039)

A cena é desenhada em luz linear, em ponto flutuante de 16 bits por canal (`rgba16float`): nada é cortado em [0, 1]
antes da apresentação. O último passo do quadro leva essa luz à tela: a resolução temporal, os efeitos e a
**apresentação** (exposição, mapeamento de tons, codificação sRGB e pontilhamento). A configuração fica no renderizador
da cena, `app.defaults.renderer` ([Renderizador](./renderer.md)); a saída é a parte `output` dele.

## A saída: `renderer.output`

```ts
const out = app.defaults.renderer.output.data;
out.exposure = 1;          // EV, como numa câmera: 0 = ×1, +1 dobra a luz
out.operator = 'agx';      // 'agx' (padrão), 'aces', 'neutral', 'linear'
out.dither = true;         // pontilhamento de ±1 nível de código na saída de 8 bits, contra faixas
out.output = 'sdr';        // 'sdr' (padrão) ou 'hdr'
```

Mudar `data` vale no quadro seguinte, sem recompilar.

### Exposição

A exposição é em EV: cada unidade dobra (ou, negativa, divide por dois) a luz antes do mapeamento. Com as luzes em
unidades físicas, a exposição é o que leva uma cena de sol (perto de 100 000 lux) e uma de interior ao mesmo brilho na
tela. Para manter a imagem ao trocar a escala das luzes por um fator k, compense com `exposure = −log2(k)`.

### Mapeamento de tons

| Operador  | O que faz                                                                                    |
| --------- | -------------------------------------------------------------------------------------------- |
| `agx`     | padrão: o AgX do Blender 4, que preserva a matiz em realces saturados                         |
| `aces`    | a curva ACES no ajuste de Hill                                                               |
| `neutral` | Khronos PBR Neutral: identidade até cerca de 0,76, compressão só nos realces                 |
| `linear`  | sem compressão, para depuração                                                               |

### Saída HDR

Com `output: 'hdr'`, num navegador e numa tela que suportam, o canvas passa a `rgba16float` com mapeamento de tons
estendido: os valores acima do branco de referência chegam à tela (a exposição vale; o operador não comprime). A troca
reconfigura o canvas no quadro em que é pedida. Sem suporte, a saída cai em `sdr` e a cena emite `presentationFallback`
uma vez, com o motivo:

```ts
app.events.on('presentationFallback', (e) => console.warn(`saída ${e.requested} indisponível: ${e.reason}`));
```

O canvas também pode ser pedido em HDR na criação (`canvasOptions: { format: 'rgba16float', toneMapping: 'extended' }`);
`app.core.canvasOutput` diz o que valeu.

## O caminho do pós-processamento

O `PostFlow` lê a cor HDR da cena (`FrameTargets.color`) e faz, em ordem:

1. **A resolução temporal**, nos modos `temporal` e `accumulate` ([Antisserrilhado](./antialiasing.md)).
2. **Os efeitos ligados** (`app.defaults.post.addEffect(...)`), em pingue-pongue `rgba16float`
   ([Pós-processamento](./post_processing.md)).
3. **A apresentação** no canvas: exposição, mapeamento de tons, sRGB e pontilhamento.

Com MSAA e sem efeitos, a apresentação lê a cor multiamostrada e mapeia cada amostra antes da média: as bordas de alto
contraste ficam suaves.

## Perfis do renderizador

O perfil preenche de uma vez os valores de custo do desenho; os ajustes feitos depois valem por cima, e o que a autoria
fixou num recurso (a `GlobalIllumination`, o `shadow` de uma luz) vale sobre os dois.

```ts
app.defaults.renderer.profile = 'medium'; // 'high' (padrão), 'medium', 'low'
```

| Perfil   | Interfaces | Cáusticas     | Traçado em xadrez | Luz global (qualidade) | Froxels        | Mapa de sombra (lado de um nível) | Penumbra |
| -------- | ---------- | ------------- | ----------------- | ---------------------- | -------------- | --------------------------------- | -------- |
| `high`   | 16         | 65 536 fótons | não               | alta                   | 160 × 90 × 128 | 4096                              | 9        |
| `medium` | 4          | 16 384 fótons | sim               | média                  | 128 × 72 × 96  | 2048                              | 4        |
| `low`    | 4          | 8 192 fótons  | sim               | baixa                  | 96 × 54 × 64   | 1024                              | 4        |

As cáusticas ficam ligadas em todos os perfis. A qualidade da luz global é a da `GlobalIllumination` (raios por sonda,
fração das sondas do mundo por quadro, raios, ladrilho e fração das sondas de tela;
[Iluminação global](./global_illumination.md)). Trocar o perfil vale no quadro seguinte; o espaço de trabalho dos
estágios cresce e encolhe com os valores. Os tempos por perfil estão em `specs/039-tracado-em-ondas/baseline.md`.

## A ordem dos passes

A ordem do quadro vem das fases (`physics → transform → shadow → forward → post → ui`) e, dentro de cada fase, da
prioridade (maior primeiro). Os estágios padrão:

| Fase        | Estágios, na ordem                                                                                                                                                    |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `physics`   | o histórico de movimento, primeiro; os solvers e as medidas de energia (com um `EnergyMeter`); as partículas secundárias dos fluidos; os emissores                    |
| `transform` | tabelas do sombreamento físico; as matrizes de mundo; a câmera; a matriz de sombra; as superfícies dos corpos moles; as superfícies paramétricas; os grafos de conjunto e o campo dos fluidos; o céu; a estrutura de raios |
| `shadow`    | as páginas do mapa de sombra; as sondas da luz global; as cáusticas; a névoa                                                                                          |
| `forward`   | o desenho principal (opacos e o pedido dos transmissivos); os sprites das partículas; o pedido das páginas de sombra; o pedido da refração pelos volumes; a refração traçada; o filtro do sinal traçado; a composição da refração; o movimento da refração; a depuração |
| `post`      | a resolução temporal, os efeitos e a apresentação                                                                                                                     |
| `ui`        | a interface sobre o canvas                                                                                                                                             |

Duas mudanças em relação à 011: a refração é traçada e composta na fase `forward`, depois dos opacos e antes da
resolução, sem cópia da cor da cena; e as páginas de sombra pedidas pela profundidade de um quadro são desenhadas na
fase `shadow` do quadro seguinte. Quem registra estágios próprios escolhe fase e prioridade
([Flows](./flows.md)).
