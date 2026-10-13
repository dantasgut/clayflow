# Contrato — Forward, sombra, câmera e luz (C3/C4)

## `ForwardFlow` (C4)

| Slot          | Declaração                                                                                                                           |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `cameras`     | `slot.pool('Camera')` (descritor `matrices`)                                                                                         |
| `world`       | `slot.pool('WorldTransform')`                                                                                                        |
| `lights`      | `slot.pool('Light')`                                                                                                                 |
| `renderables` | `slot.entities({ all: [Geometry, Material, Transform], record: renderableRecord, groups: { key: forwardKey, instance: 'record' } })` |
| `shadowMap`   | como na 006 (textura `depth` + pool `ShadowMap`, opcionais)                                                                          |
| `target`      | como na 006                                                                                                                          |

`forwardKey(entry) = ${geometry.contentKey}|${material.schema.name}|${frontFace(transform.scale)}`.

Por passe: grupos 0 (câmeras + params do quadro), 1 (mundo + `Renderable` + instâncias) e 3 (luz + sombra) uma vez;
por grupo de draw: pipeline e grupo 2 (material) se mudaram, `vertex/index` da geometria do grupo,
`draw.indexed(indexCount, group.count, 0, 0, group.first)`. Shader: `let r = renderables[instances[instance_index]]`.
`ForwardFrameParams { cameraSlot, lightSlot, shadowEnabled, shadowSlot }` escrito quando muda.

## `ShadowFlow` (C4)

`casters = slot.entities({ all: [Geometry, Transform], groups: { key: shadowKey, instance: [Transform, 'world'] } })`,
`shadowKey = ${contentKey}|${frontFace}`. Por grupo: `draw.indexed(indexCount, count, 0, 0, first)`;
`worlds[instances[instance_index]]`. A matriz vem de `shadowMatrix` no pool `ShadowMap` (R11); `listens` sai.

## `CameraFlow` (C3, fase `transform`, prioridade abaixo do `TransformFlow`)

`views = slot.entities({ all: [Camera, Transform], record: cameraRecord })`; kernel `camera_compose` (um thread por
registro): `view = inverse_rigid(world[transformSlot])`, `projection = perspective|orthographic(params)`,
`viewProjection`, `position`. Roda quando `poolWritten` de `Camera`/`Transform` ou `entitiesChanged`.

## `ShadowMatrixFlow` (C3, fase `transform`, depois do `CameraFlow`)

`casters = slot.entities({ all: [DirectionalLight, ShadowMap], record: shadowRecord })`; kernel `shadow_matrix`:
ortográfica ±10 com olho a 10 m na direção da luz (a matemática atual do `ShadowFlow`), em `shadowMatrix`.

## `TransformFlow` (C3) — alterado

Sem `Parent`: um passe sobre o pool (como hoje), disparado por `poolWritten` de `Transform`. Com `Parent`: nível 0 e
um despacho por nível ≥ 1 sobre a lista do nível (R12).

## Controllers e `Input` (C4/C2)

`InteractionSystem` em `frameTick`: para cada controller no World, `controller.tick(input, dt, transformDaEntidade)`.
`Application` reage a `canvasReconfigured` escrevendo `aspect` nas câmeras `aspectMode: 'canvas'`.
