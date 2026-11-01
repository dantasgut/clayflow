---
sidebar_position: 17
title: Renderizador
---

# Renderizador — a configuração do desenho (spec 039)

A configuração do desenho de uma cena fica num lugar só: o `Renderer` (C3), que a apresentação estende com a saída
(`SceneRenderer`, C4). Os estágios padrão inserem um por cena, em `app.defaults.renderer`.

```typescript
const r = app.defaults.renderer;
r.profile = 'medium';                 // perfil de qualidade: 'high' (padrão), 'medium', 'low'
r.lightPaths.transmission = 8;        // por cima do perfil: interfaces de transmissão por caminho (1–32)
r.lightPaths.refraction = true;       // a refração traçada ligada
r.caustics.photons = 32_768;          // fótons por quadro; enabled, cellSize
r.tracing.checkerboard = true;        // metade dos blocos 2×2 por quadro (−4 a −5 ms; 1,6 % nas bordas, parado)
r.antialiasing.mode = 'temporal';     // 'temporal', 'accumulate', 'off'
r.temporalFilter.enabled = true;      // o filtro do sinal traçado
r.output.data.exposure = 1;           // a saída: exposição, mapeamento de tons, sdr/hdr
```

A refração de cada objeto é do **material** dele (o fechamento do grafo: transmissão, IOR, Abbe, absorção), como no
Blender; o renderizador guarda só os limites do traçado e o que o desenho pode gastar. `Refraction` e `Caustics` não
são de autoria: são os Resources que os estágios leem, mantidos pelo renderizador.

## Perfis

| Perfil   | Interfaces | Cáusticas     | Traçado em xadrez |
| -------- | ---------- | ------------- | ----------------- |
| `high`   | 16         | 65 536 fótons | não               |
| `medium` | 4          | 16 384 fótons | sim               |
| `low`    | 4          | 8 192 fótons  | sim               |

O alto é o padrão de antes da 039 (a mesma imagem); o médio e o baixo vêm dos botões medidos no tanque
(`specs/039-tracado-em-ondas/baseline.md`, "Os botões de qualidade").

Trocar o perfil vale no quadro seguinte. O espaço de trabalho dos estágios cresce e encolhe com os valores — a C2
realoca nos dois sentidos ([Flows — Espaço de trabalho](./flows.md#espaço-de-trabalho-spec-039)). As medidas de tempo
e de imagem por perfil ficam em `specs/039-tracado-em-ondas/baseline.md` (SC-009).

## Cáusticas

As cáusticas entram na cena com o primeiro material transmissivo (a água, o vidro); sem transmissivo a luz global não
muda. `r.caustics.enabled = false` as desliga: a água deixa a luz passar em linha reta, com Fresnel e absorção.

## A onda dos acertos (para quem traça raios)

Quem traça raios no motor (a refração, a luz global, os fótons das cáusticas) não avalia o material nem a luz dentro
do laço de traçado. Cada rodada passa por estágios, cada um num kernel próprio:

1. **Acerto**: quem traça grava o acerto de cada raio na onda (`RayWave`, `ray_wave_put_surface`), no índice do raio,
   com o que precisar guardar dele (a carga `payload` e a etiqueta `ray_wave_tag`).
2. **Material**: um kernel por função `material` da cena avalia o fechamento nos acertos daquela classe (`hitShade`).
3. **Luz** (spec 034, T078): um kernel lê o fechamento e calcula a luz no acerto. São a luz direta com raio de sombra,
   a emissão e os contribuintes da luz da cena (as cáusticas, a transmissão das sombras, a luz indireta da GI). Ele
   grava o resultado num buffer do espaço de trabalho do Flow, ou na carga do registro. Na GI é o
   `gi_wave_direct_main`, que grava a luz direta e os fatores da luz rebatida do fechamento. Na refração é o
   `refraction_chain_light_main`, que grava a luz do ponto opaco, com o mesmo sorteio da continuação.
4. **Continuação**: quem traça lê o que os estágios gravaram, soma os rebatimentos ou segue o caminho. Esse kernel não
   liga as luzes, nem a estrutura de raios para a luz, nem os contribuintes, e a GI não lê nem o fechamento.

A divisão mantém cada kernel dentro do que o adaptador concede por estágio, mesmo quando a cena acrescenta
contribuintes. O teste `src/elements/lighting/__tests__/waveLight.test.ts` garante que a continuação não volte a ligar
a luz. Quem escreve um traçado novo segue os mesmos estágios.
