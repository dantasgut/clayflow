# Data Model: Superfícies paramétricas completas

## C3 — colisão

| Entidade                    | Campos                                                                                                                                                         | Regras                                                                                                                                       |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `SurfaceCollider`           | `mode` (`'height'` \| `'distance'`), `resolution` (altura: `[nx, nz]`, padrão 128²; distância: `[n, n, n]`, padrão 64³), `margin` (folga, m), `band` (células) | Anexado à entidade com `ParametricSurface`; sem ela, nada (aviso). Mudar modo/resolução realoca o campo                                      |
| `SurfaceColliderSchema`     | `mode`, `nx`, `ny`, `nz`, `first` (slot do campo), `copies`, `copy_stride`, `margin`, `transform_slot`                                                         | Pool `collider` do tipo `surface`; escrito pela CPU nas transições                                                                           |
| `SurfaceColliderCellSchema` | `value: f32`                                                                                                                                                   | Pool `field`, `count = copies × (HEADER + células)`; cabeçalho (GPU): caixa local mín./máx., célula, inversa do mundo, matriz normal, escala |
| `ColliderSetCountsSchema`   | + `surface_count`                                                                                                                                              | Acréscimo; zero ⇒ laço vazio                                                                                                                 |
| `collider_step`             | `u32` por `ColliderSet`                                                                                                                                        | Zerado no `framePrepare`; +1 no fim de cada passo do solver (só com superfícies)                                                             |
| `SurfaceColliderFlow`       | fase `physics`, prioridade 20                                                                                                                                  | Constrói as cópias do passo; uma cópia e só ao mudar sem animação                                                                            |

**Estados do campo**: `stale` (entrou, mudou função/parâmetros/modo/resolução) → construído; `animated` ou espaço ou
`TransformFunction` → reconstruído a cada passo (cópia k); rejeição da função → mantém o último campo válido.

## C3 — geometria diferencial e malha adaptativa

| Entidade                     | Campos                                                                                                        | Regras                                                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `ParametricSurface` (+)      | `differential?: boolean`, `adaptive?: AdaptiveOptions`                                                        | `adaptive` liga `differential`; uniforme continua o padrão                                                 |
| `AdaptiveOptions`            | `patches [P, Q]` (padrão 16²), `maxLevel` (padrão 4), `budget` (triângulos), `tolerance` (m), `pixels` (alvo) | `P·Q ≤ 4096`; `maxLevel ≤ 6`; buffers dimensionados pelo orçamento                                         |
| `SurfaceDiffSchema`          | `metric` (E, F, G, –), `second` (L, M, N, –), `curvature` (K, H, k₁, k₂), `principal` (xyz, válido)           | Pool `diff`, `count` = vértices (uniforme) ou capacidade (adaptativa); só com `differential`               |
| `SurfaceFunction` (+)        | pontos opcionais `surface_duu`, `surface_duv`, `surface_dvv`                                                  | Analíticas só com as três; com espaço na cena, numéricas do mapa composto                                  |
| `SurfaceSample` (+)          | `metric: vec3f`, `curvature: vec4f`, `principal: vec3f`                                                       | Acréscimos no fim; zeros sem dado diferencial                                                              |
| `RenderableSchema` (+)       | `diff_first: u32`                                                                                             | `0xffffffff` sem dado; o forward escolhe a variante `forward_diff` pelo grupo                              |
| Registro de desenho          | `indexCount`, `vertexCount`, `edgeCount` (GPU)                                                                | Descritor `indirect` da superfície adaptativa; os passes compõem os seus argumentos com o `first` do grupo |
| Evento `adaptiveUnavailable` | `resource`, `reason`                                                                                          | Sem `indirect-first-instance`: desenha a grade uniforme de mesma precisão máxima                           |

## C4

| Entidade                      | Mudança                                                                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `ForwardFlow`                 | Ramo `indexedIndirect` para grupos com geometria indireta; argumentos por grupo preenchidos por kernel; variante `forward_diff` |
| `ShadowFlow`                  | Ramo `indexedIndirect` (mesmos argumentos compostos pelo passe)                                                                 |
| `Application`/`DeviceOptions` | Pede `indirect-first-instance` quando o adaptador tem                                                                           |

## C3 — geometria de CPU

| Entidade             | Mudança                                                                                      |
| -------------------- | -------------------------------------------------------------------------------------------- |
| `ParametricGeometry` | Normal por diferenças centrais da função (`h = 1e-4`, recuo em bordas/polos), lado da frente |
