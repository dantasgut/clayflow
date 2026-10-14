# Contrato: estágios da água

## API pública nova

```ts
import { FluidBody, FluidSurfaceMaterial } from 'clayflow';

world.insert(
  new FluidBody({ algorithm: 'SPH', position }).add(
    new FluidSurfaceMaterial({
      color: [0.1, 0.45, 0.6, 1],
      absorption: [0.45, 0.09, 0.06, 0],
      ior: 1.333,
      caustics: true,
    }),
  ),
);
```

- `FluidSurfaceMaterial(options?)` — todos os campos do [data-model](../data-model.md) opcionais; `caustics` booleano.
- `WaterSurface({ lightSize? })` — inserido pelos estágios padrão; apps com pipeline próprio o inserem.
- Estágios exportados: `FluidSurfaceFlow` (opção `view: 'camera' | 'light'`), `CausticsFlow`, `WaterFlow`;
  `PresentationDefaults` ganha `fluidSurface`, `fluidLightSurface`, `caustics`, `water`.
- `ResourceDirectory.ensureAllocated(resource, descId)` passa a alocar descritores de textura também; devolve a spec
  alocada (`AnyBufferSpec | TextureSpec | undefined`).

## `FluidSurfaceFlow` (C4)

- Slots: `camera` (singleton), `cameras` (pool `CameraMatrices`), `shadowMatrices` (pool, opcional), `caster` (o
  `ShadowMap` da luz que projeta sombra, opcional), `bodies` (`ParticleBody` + `FluidSurfaceMaterial`), `water`
  (`WaterSurface`, singleton), `target` (profundidade da cena, só na vista da câmera).
- Vista `camera` (fase `forward`, −60): passe das esferas → `depthRaw`, `material`, `depthStencil`; passe da espessura
  → `thickness`; suavização compute → `depth`. Descarta fragmentos atrás da profundidade da cena.
- Vista `light` (fase `shadow`, −10): passe das esferas com a `ShadowMatrix` do caster → `lightDepthRaw`,
  `lightMaterial`; suavização → `lightDepth`. Sem caster: não grava.
- Um desenho por corpo (`draw.vertices(6, N)`), como o `ParticleFlow`; pools religados quando crescem.
- Sem corpos: não grava nada.

## `CausticsFlow` (C4)

- Fase `shadow`, −20 (depois do `ShadowFlow` e da vista da luz).
- Lê `lightDepth`, `lightMaterial`, `ShadowMap.depth`, `ShadowMatrix`, pool `FluidSurfaceMaterial`; escreve `photons`
  (limpa → deposita) e `caustics` (resolve + borrão).
- Só grava quando há água e caster; publica no `ForwardFlow` (por slot do `WaterSurface`) se as cáusticas estão
  ligadas — o forward usa `causticsEnabled = 1` só então.

## `WaterFlow` (C4)

- Fase `forward`, −70. Copia `color` → `background`; desenha um triângulo de tela cheia nos alvos da cena (`samples` com
  resolução em `color`, ou `color` sem MSAA; `depth` com teste `less` e escrita via `frag_depth`).
- Lê `depth`, `thickness`, `material`, `background`, profundidade da cena, pools `CameraMatrices`, `Light`, `ShadowMap`,
  `ShadowMatrix`, `FluidSurfaceMaterial`, mapa de sombra.
- Só grava quando o produtor da vista da câmera desenhou neste quadro.

## `ForwardFlow` (mudança)

- Grupo 3 ganha `caustic_map` (`texture_2d<f32>`) e `water_light_depth` (`texture_2d<f32>`), com manequins 1×1.
- `ForwardFrameParams.causticsEnabled` (`f32`): 0 → fator 1 exato; 1 → fator do mapa abaixo da água na vista da luz.
- Imagens sem água idênticas às de hoje.

## `ParticleFlow` (mudança)

- Ignora, sem aviso, corpos com `FluidSurfaceMaterial`; o aviso de material não desenhado continua para os demais.
