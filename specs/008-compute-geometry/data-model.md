# Data Model: Geometria em compute

**Spec**: [spec.md](./spec.md) · **Pesquisa**: [research.md](./research.md)

## Faixa de pool (C2)

| Campo   | Tipo     | Regra                                                                                     |
| ------- | -------- | ----------------------------------------------------------------------------------------- |
| `first` | `number` | Primeiro slot; estável enquanto o Resource está no World (sem compactação)                |
| `span`  | `number` | Número de slots (`count` do descritor, ≥ 1)                                               |
| `pool`  | `string` | Chave do pool (`schema.name`); um Resource pode ter faixas em vários pools (uma por pool) |

- Alocação: first-fit na lista de intervalos livres; senão o fim, com crescimento por dobra.
- Liberação: intervalo devolvido e coalescido com vizinhos livres; bits de vivo zerados na GPU (R2).
- Invariante: slots `[first, first + span)` têm o mesmo ocupante; nenhuma faixa viva se sobrepõe a outra.

## Bitset de vivos (C2, R2)

`pool:<schema>:live` — `array<u32>`, bit `i` = slot `i` ocupado. Escrito por delta no mesmo quadro da alocação ou
liberação. Exposto em `BoundPool.live`; WGSL `pool_live(i)`.

## Referência de slot (C2, R3)

`FieldType.slotRef(target)` — WGSL `u32`. Valor no dado: `{ body: Entity, index: number }` ou `index` (alvo `self`).
Resolvido no empacotamento: `first(body, poolDoAlvo) + index`. Reempacotado quando a faixa do alvo é alocada.
Erros: corpo ausente do World, `index ≥ span`, pool do alvo diferente do declarado.

## Corpo de partículas (C3)

`ParticleBody` (base de `FluidBody`, `SoftBody`) — `Entity<ParticleBodyData>`:

| Campo            | Tipo                                      | Regra                                                                                  |
| ---------------- | ----------------------------------------- | -------------------------------------------------------------------------------------- |
| `count`          | `number`                                  | N ≥ 1; derivado de `position.length / 4` (ou `/ 3`)                                    |
| `body`           | SoA `{ [campo do schema]: Float32Array }` | Campos do schema do algoritmo; ausentes recebem o padrão de hoje por partícula         |
| `algorithm`      | `string`                                  | Escolhe o schema (como hoje)                                                           |
| `edges` (Soft)   | SoA `{ a, b: Uint32Array; restLength }`   | Índices locais `< N`; vira a faixa no pool de restrições (`DistanceConstraint.schema`) |
| `surface` (Soft) | `{ triangles: Uint32Array; uvs? }`        | Índices locais `< N`; cria `SurfaceGeometry` como parte                                |

Validação na criação: arrays com N consistente (erro nomeia campo e tamanhos), `N > 0`, índices válidos, schema com
campo `pos: vec4f` (para o render). Na inserção: teto do algoritmo (R10).

## Geometria escrita pela GPU (C3)

| Geometria            | `vertices`                                     | `indices`                                  | Escritor           |
| -------------------- | ---------------------------------------------- | ------------------------------------------ | ------------------ |
| `SurfaceGeometry`    | `vertex`, `'never'`, layout 32 B, `count: N`   | `index`, `'initial'`, `uint32`, triângulos | `SoftSurfaceFlow`  |
| `PointCloudGeometry` | `vertex`, `'never'`, layout 32 B, `count: max` | —                                          | estágio do usuário |

Sem `contentKey` (fora da dedup). `activeCount` (CPU) ou buffer indireto do escritor para a contagem desenhada.

## Material (C3)

| Campo         | Tipo                                             | Regra                                    |
| ------------- | ------------------------------------------------ | ---------------------------------------- |
| `topology`    | `'triangle-list' \| 'line-list' \| 'point-list'` | Do descritor de pipeline                 |
| `castsShadow` | `boolean`                                        | Padrão: `true` só para triângulos; opção |

`PointSpriteMaterial`: struct WGSL próprio `PointSpriteMaterial { color: vec4f, radius: f32, … }`.

## Parâmetros de desenho de corpo (C4)

`ParticleDrawParams { first: u32, stride_vec4: u32, pos_offset_vec4: u32, material: u32 }` — um por corpo, numa
lista com offset dinâmico; escrito quando a faixa ou o material mudam.

## Estados e eventos

- Corpo inserido → faixa alocada (`poolWritten` da faixa, bits de vivo) → restrições com `slotRef` para ele
  reempacotadas → `ParticleFlow` acrescenta o draw.
- Corpo removido → faixa liberada (bits de vivo zerados) → draw removido; restrições que o referenciam: erro se ainda
  no World (devem sair antes ou junto).
- Pool cresce → `poolReallocated` → bind groups do `ParticleFlow` e dos solvers trocados (já existente).
