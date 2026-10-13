# Contrato — Estágios de apresentação nos slots

## `ForwardFlow` (C4)

| Slot          | Declaração                                                                                                               |
| ------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `camera`      | `slot.singleton(Camera.schema)`                                                                                          |
| `world`       | `slot.pool('WorldTransform')`                                                                                            |
| `renderables` | `slot.entities({ all: [Geometry, Material, Transform] })`                                                                |
| `lights`      | `slot.entities({ all: [Light.schema] })`                                                                                 |
| `shadowMap`   | `slot.texture(ShadowMap.schema, 'depth')` (opcional) + `slot.pool('ShadowMap')` (opcional)                               |
| `target`      | `slot.target({ schema: FrameTargets, descId: 'color', depth: { schema: FrameTargets, descId: 'depth' } })` ou `'canvas'` |

Pipelines: um por shader de material (`consumes: ['Camera', 'WorldTransform', <schema do material>, 'ShadowMap']`),
variantes `frontFace`. Privado: `ForwardFrameParams` (uniform, gravado uma vez por quadro), sampler de comparação,
textura de profundidade 1×1 quando não há sombra.

Por passe: grupos 0 (câmera), 1 (mundo) e 3 (sombra) definidos uma vez; por desenho: pipeline (se mudou), grupo 2 com
offset `materialSlot × stride` (se mudou), `vertex/index` da `Geometry` alocada pela C2, `draw.indexed(indexCount, 1,
0, 0, transformSlot)`.

Nenhum `core.create` por entidade; câmera e material não são escritos pelo forward (envio da C2 quando sujos).

## `ShadowFlow` (C4)

Slots: `caster` = `slot.singleton(ShadowMap.schema)` (a primeira `DirectionalLight` com `castShadow = 1` e seu
`ShadowMap`), `world`, `casters` = `slot.entities({ all: [Geometry, Transform] })`, `target` = textura `depth` do
`ShadowMap`. `listens: [Light.schema]`: em `resourceReady` da luz, grava `shadowMap.data.lightViewProj`.
Pipeline: `shadow_depth` com `consumes: ['ShadowMap', 'WorldTransform']`: a matriz vem do pool `ShadowMap`
(`array<ShadowMap>`) no slot do caster; `ShadowDepthParams` passa a levar só esse slot (`casterSlot`, uniform privado
gravado quando o caster muda).

## `PostFlow` (C4)

Slots: `scene` = `slot.texture(FrameTargets, 'color')`, `target` = `'canvas'`. Privados: pingue-pongue (recriados na
transição `canvasReconfigured`), params por efeito, sampler. `bindForwardFlow` sai.

## `UIFlow`, `DebugFlow`, `TransformFlow`

UI: `target: 'canvas'` (load), privados como hoje (quadros, atlas). Debug: sem slots. Transform: `slot.pool('Transform')`,
`slot.pool('WorldTransform')`; redespacha em `resourceReady(Transform)` e `entitiesChanged`.

## `Application` / `registerPresentationDefaults`

Insere `FrameTargets` no World; registra as factories de apresentação; devolve as instâncias (`defaults.post`,
`defaults.forward`…). Remove `setRenderToOffscreen` (o forward desenha em `FrameTargets.color` quando há pós; sem pós,
em `'canvas'`).
