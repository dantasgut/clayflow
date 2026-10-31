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
r.antialiasing.mode = 'temporal';     // 'temporal', 'accumulate', 'off'
r.temporalFilter.enabled = true;      // o filtro do sinal traçado
r.output.data.exposure = 1;           // a saída: exposição, mapeamento de tons, sdr/hdr
```

A refração de cada objeto é do **material** dele (o fechamento do grafo: transmissão, IOR, Abbe, absorção), como no
Blender; o renderizador guarda só os limites do traçado e o que o desenho pode gastar. `Refraction` e `Caustics` não
são de autoria: são os Resources que os estágios leem, mantidos pelo renderizador.

## Perfis

| Perfil   | Interfaces | Cáusticas     |
| -------- | ---------- | ------------- |
| `high`   | 16         | 65 536 fótons |
| `medium` | 4          | 16 384 fótons |
| `low`    | 4          | desligadas    |

O alto é o padrão de antes da 039 (a mesma imagem); o médio e o baixo vêm dos botões medidos no tanque
(`specs/039-tracado-em-ondas/baseline.md`, "Os botões de qualidade").

Trocar o perfil vale no quadro seguinte. O espaço de trabalho dos estágios cresce e encolhe com os valores — a C2
realoca nos dois sentidos ([Flows — Espaço de trabalho](./flows.md#espaço-de-trabalho-spec-039)). As medidas de tempo
e de imagem por perfil ficam em `specs/039-tracado-em-ondas/baseline.md` (SC-009).

## Cáusticas

As cáusticas entram na cena com o primeiro material transmissivo (a água, o vidro); sem transmissivo a luz global não
muda. `r.caustics.enabled = false` as desliga: a água deixa a luz passar em linha reta, com Fresnel e absorção.
