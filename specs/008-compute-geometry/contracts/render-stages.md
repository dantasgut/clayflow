# Contrato — Estágios de render e geometria da GPU (C3/C4)

## `ParticleFlow` (C4, fase `forward`, depois do `ForwardFlow`)

- Slot: `slot.entities({ all: [ParticleBody, Material] })`; aceita `PointSpriteMaterial` (outros materiais: aviso
  único e corpo fora do desenho).
- Um pipeline `particle_sprite` sem vertex buffers; `draw.vertices(6, span)` por corpo com o bind do pool do schema e
  `ParticleDrawParams` por offset dinâmico.
- Alvo: `FrameTargets` com `loadOp: 'load'` (cor e profundidade); teste de profundidade ligado.
- Não projeta sombra.

## `SoftSurfaceFlow` (C3, fase `transform`, depois dos solvers)

- Slot: `slot.entities({ all: [SoftBody, SurfaceGeometry], owns: [[SurfaceGeometry, 'vertices']] })`.
- Kernels `soft_face_normals` e `soft_vertex_write` por corpo; sem leitura de volta.

## Forward e sombra

- Chave do grupo: `contentKey|pipeline|topologia|face`.
- Pipeline com a topologia do material; `cullMode` só em triângulos.
- Linhas: índice de arestas privado por geometria (`edges_from_triangles`), `draw.indexed`.
- Pontos: pipeline de sprite, `draw.vertices(6 · vertexCount, instâncias)`.
- Sem índices: `draw.vertices(vertexCount, instâncias)`; com contagem indireta: `draw.indirect`.
- Sombra: só materiais com `castsShadow`.

## Geometria escrita pela GPU

- `role: 'index'` com `upload: 'never'` exige `indexFormat`.
- `slot.entities({ owns })` aceita descritor individual: a C2 registra o escritor; geometria `'never'` sem escritor num
  grupo de draw → aviso único nomeando a entidade.
- `PointCloudGeometry({ maxPoints })`: `vertices` `'never'`; `activeCount` ou contagem indireta do escritor.
