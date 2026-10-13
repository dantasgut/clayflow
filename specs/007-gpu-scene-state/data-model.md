# Data Model: Estado de cena na GPU

**Spec**: [spec.md](./spec.md) · **Research**: [research.md](./research.md)

## Geometry (C3) — alterado (R1)

| Campo           | Tipo                         | Nota                                                                                         |
| --------------- | ---------------------------- | -------------------------------------------------------------------------------------------- |
| `contentKey`    | `string` (getter)            | paramétricas: `Classe:parâmetros`; genérica: `hash:` FNV-1a 64 dos bytes de vértice e índice |
| `data.vertices` | `Float32Array` (sob demanda) | paramétricas: gerado uma vez por chave num cache imutável da classe; não mais no construtor  |
| `data.indices`  | `Uint16Array \| Uint32Array` | idem                                                                                         |

Discriminador dos buffers (C2): `${desc.id}:${schema.name}:${contentKey}` — mesma spec para o mesmo conteúdo; posse
por spec na C1 (`retain`/`release`). Atribuir `data.vertices`/`data.indices` recalcula a chave (copy-on-write).

## EntitiesSlot (C2, `scene/flows/slots.ts`) — alterado (R2, R7)

```ts
slot.entities({
    all: readonly ResourceType[],
    record?: EntityRecordDeclaration,          // 006
    groups?: { key: (entry: EntityEntry) => string; instance: 'record' | readonly [ResourceType, string] },
    owns?: readonly (readonly [ResourceType, string])[],
});
```

`BoundEntities` ganha:

| Campo       | Tipo                   | Nota                                                                          |
| ----------- | ---------------------- | ----------------------------------------------------------------------------- |
| `groups`    | `readonly DrawGroup[]` | só grupos não vazios; ordem estável por criação do grupo                      |
| `instances` | `BoundPool`            | buffer `array<u32>` com os segmentos dos grupos; `generation` muda ao crescer |

`DrawGroup = { key: string; first: number; count: number; representative: EntityEntry }`.

Segmento: `{ base, capacity (2^k), count }`; remoção por troca com o último; realocação ao exceder; segmentos livres
por classe de tamanho.

## Pool (C2, `ResourceSystem`) — alterado (R5, R7)

| Campo novo       | Tipo                    | Nota                                                                   |
| ---------------- | ----------------------- | ---------------------------------------------------------------------- |
| `mirror`         | `ArrayBuffer`           | `capacity × stride`; só pools `'always'`                               |
| `slotOfResource` | `Map<Resource, number>` | localização O(1) no envio e na liberação                               |
| `dirtySlots`     | bitset (`Uint32Array`)  | slots sujos do quadro                                                  |
| `gpuOwned`       | bitset                  | slots de posse da GPU (declarados por `owns`); nunca escritos pela CPU |

Crescimento: buffer novo + `copy` na GPU dos `capacity × stride` antigos; espelho copiado.

## Eventos (C2) — alterado

| Evento            | Payload                                          | Nota                                                              |
| ----------------- | ------------------------------------------------ | ----------------------------------------------------------------- |
| `poolWritten`     | `{ poolKey, ranges: readonly [first, count][] }` | NOVO — um por pool por quadro; substitui `resourceReady` de pools |
| `resourceReady`   | inalterado                                       | só Resources individuais                                          |
| `entitiesChanged` | `{ slot, added, removed }`                       | um por conjunto por quadro (agregado em `framePrepare`, R6)       |

## Leitura sob demanda (C2) — novo (R8)

`world.read(resource, descId?) → Promise<Record<string, unknown> | undefined>`; `world.readAll(resources, descId?)`.
Pedidos do quadro agrupados por pool (faixas), copiados para staging em `frameRecording` e mapeados depois do envio.

## Camera (C3) — alterado (R10)

| Descritor  | Papel              | Política   | Schema                                                                                                            |
| ---------- | ------------------ | ---------- | ----------------------------------------------------------------------------------------------------------------- |
| `camera`   | `storage-ro`, pool | `'always'` | `CameraParams { projection: u32, fov: f32, orthoHeight: f32, near: f32, far: f32, aspect: f32, aspectMode: u32 }` |
| `matrices` | `storage-rw`, pool | `'never'`  | `CameraMatrices { view, projection, viewProjection: mat4x4f, position: vec4f }`                                   |

Entidade de câmera: `Camera` + `Transform` (obrigatório; erro na inserção sem ele) + controller opcional.
`CameraRecord { cameraSlot: u32, transformSlot: u32 }` (registro da C2).

## Input (C2) — movido (R10)

Resource singleton, `StructSchema('Input', {})`, sem descritores; API de consulta (`isKeyDown`, `pointerDelta`,
`wheelDelta`, …) e eventos (`keyDown`, `pointerMove`, `wheel`, …). Inserido por `Application.create`.

## Controllers (C4) — alterado (R10)

`OrbitController`, `FlyController`, `FpsController`: Resources sem descritores; `data` com a intenção do controle
(orbit: alvo, distância, ângulos); `tick(input: Input, dt: number, transform: Transform): void` muta só
`transform.data.position/rotation`.

## Parent (C3) — novo (R12)

Resource sem descritores, `data: { entity: EntityId }`. Privado do `TransformFlow`: a lista de elos
`TransformLink { child: u32, parent: u32 }` (slots), ordenada por nível — um trecho contíguo por nível ≥ 1 —, e o trecho
de cada nível em `TransformLevel { first, count }` (uma região por nível, offset dinâmico). Refeita só quando o conjunto
de filhos, os pais ou a posse da GPU mudam. (Implementação: a lista de elos substituiu o `hierarchy: array<u32>` por
slot do desenho inicial — mesma informação, sem buffer do tamanho do pool.)

## Light e ShadowMap (C3) — alterado (R11)

`Light`: inalterado (pool, lido pelo forward). `ShadowMap`: `params` (`bias`, `normalBias`, `size` — `'always'`) e
`shadowMatrix` (`lightViewProj: mat4x4f` — `'never'`), mesmo slot; textura `depth` inalterada.
`ShadowRecord { lightSlot: u32, shadowSlot: u32 }`.

## ForwardFrameParams (C4) — alterado

`cameraSlot: u32`, `lightSlot: u32` (sentinela `0xFFFFFFFF` = direção padrão), `shadowEnabled: f32`, `shadowSlot: u32`.
Escrito quando a câmera ativa, a luz ou a sombra mudam — não por quadro.

## Física (C3) — alterado (R7, R9)

| Peça              | Forma                                                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `PoseRecord`      | `{ bodySlot: u32, transformSlot: u32 }` — registro da C2; conjunto `[RigidBody, Transform]`, `owns: [[Transform, 'transform']]` |
| `ColliderProxy`   | `{ center: vec3f, radius: f32, kind: u32, slot: u32 }` — privado do LCP                                                         |
| `CandidatePair`   | `{ body: u32, slot: u32 }` por forma — listas privadas com contador e argumentos indiretos                                      |
| `SpatialHashGrid` | tabela `2^k` de células (contagem, início por prefix sum, índices) — generalização da busca de vizinhança                       |
| `maxPairsPerBody` | opção do `LCPFlow` (padrão 64)                                                                                                  |

Saem: staging de readback, mapa slot→entidade por quadro, `applyTransformsFromReadback`.
