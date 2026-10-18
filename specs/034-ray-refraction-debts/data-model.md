# Data Model: Refração pela estrutura de raios e as falhas antigas (034)

## Refração

### `Refraction` (Resource, C3 — `src/elements/raytrace/Refraction.ts`)

Recurso da cena que existe enquanto há material com transmissão ou água; inserido e retirado pelos estágios padrão por
evento (como a GI troca o hemisfério). Autoria opcional (vocabulário de domínio):

| Campo           | Tipo   | Padrão | Significado                                                          |
| --------------- | ------ | ------ | -------------------------------------------------------------------- |
| `maxInterfaces` | número | 6      | Interfaces seguidas pelo raio (entradas, saídas, reflexões internas) |
| `roughnessBlur` | bool   | true   | Desfoque da rugosidade pelo cone (R5)                                |

Descritores:

- `refraction_params` (uniform): `maxInterfaces`, tamanho da tela, contagem de pedidos (escrita pela GPU), tempo.
- `refraction_requests` (storage, `onDemand`): um registro por pixel pedido —
  `{ entry: vec4f (ponto, instância), normal: vec4f (normal, peso de transmissão), ior: vec4f (por canal, parede fina),
absorption: vec4f (cor, distância), extra: vec4f (rugosidade, pixel) }`.
- `refraction_list` (storage): índices compactos dos pedidos + argumentos do despacho indireto.
- `refraction_radiance` (textura `rgba16float`, canvas, `onDemand`): radiância transmitida por pixel (rgb) e distância do
  último acerto (a), lida pela composição e pelo desfoque.

Transições: sem transmissão → nada alocado; primeiro material com transmissão/água → `ensureAllocated` e o estágio
entra; último sai → o estágio sai (memória liberada).

### Ponto `ray_hit_material` (C3 — `src/elements/raytrace/`)

Renomeia e desacopla `gi_hit_material`: `fn ray_hit_material(index: u32, s: SurfaceSample, m: …, slot: u32) -> Closure`,
composto por cena a partir de `RayScene.materialFunctions`. `ray_hit_closure(hit: RayHit) -> Closure` monta o
`SurfaceSample` sem derivadas. A GI passa a usar os dois.

## Tempo de GPU

### `FrameGpuReading` (C1, existente)

`{ gpuTimeMs, gpuFrame, stagesNs }` — sem mudança de forma.

### `GpuProfilerSystem` (C1)

- Anel de `STAGING_RING = 4` stagings, cada um com o seu `PendingResolve`; um quadro resolve no próximo livre.
- `fresh`: leitura nova desde o último `takeFresh()`; `dropped`: quadros sem staging livre (contador exposto ao debug).

### `FrameStats` (C1, contrato)

`gpuTimeMs`, `gpuFrame`, `stagesNs` presentes no `frameComplete` só no evento em que a leitura é nova; ausentes nos
demais. `lastFrameStats()` mantém a última (consulta).

## Falhas herdadas

### `causes.md` (documento da spec)

Uma linha por falha: smoke, commit que a introduziu (bissecção), causa medida, correção, medida depois.
