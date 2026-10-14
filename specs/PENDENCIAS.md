# Pendências do motor — simulação (levantamento 2026-10-12)

Levantamento feito no código após a spec 005 (`feature/005-shader-modules`, PR #37). Lista o que existe na API mas
não simula, os limites de escala e a pendência de verificação da 005. Cada item aponta a evidência no código e a fase
do [ROADMAP](ROADMAP.md) em que está previsto.

## 0. Verificações de desempenho pendentes (005 e 006)

| Item                                      | Estado                                                                                                                                                                                                                                                                                                                                                                                                                                 | Próximo passo                                                                                                                              |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| T084 da 005 e T068 da 006 — `bench:check` | Fechadas (2026-10-13, máquina livre, Chrome 155, baseline do perfil gravado do `b17d5d6`): CPU de todas as cenas caiu 31–90% (`instances/10k` −84%, meta −30%). O gate apontou só a GPU de `instances/10k-moving` (0,41 → 0,67 ms): no `b17d5d6` ela é bimodal (0,43 ou 0,94 ms na mesma build, estados de clock da T085 da 004) e o baseline pegou o modo baixo; o atual é estável em 0,67 ms, igual ao `10k` parado (0,92 → 0,66 ms) | Quando o baseline for regravado, medir a GPU de `10k-moving` com mais amostras ou descartar o modo baixo com critério declarado no harness |
| SC-010 da 006 — GPU de `instances/10k`    | Fechada na 007: 0,46 ms contra o alvo de 0,52 ms (era 0,66 ms com 10 001 draws). Por passe (1280×720): `ForwardFlow` 0,286 ms, `PostFlow.passthrough` 0,202 ms, `CameraFlow` 0,017 ms. A diferença para o Three (0,09 ms) vem do passthrough sem efeitos (ver G2 abaixo)                                                                                                                                                               |

## 1. Na API, sem simulação

| #   | Pendência                                         | Estado atual (evidência)                                                                                                                                     | Fase     |
| --- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| P1  | FEM sem solve elástico                            | `FEMFlow` roda só `fem_predict` e `fem_velocity_update` — integra gravidade (`elements/physics/shaders/fem.ts`). As funções de FEM já estão em `wgslLib.fem` | F5 (016) |
| P2  | `MeshCollider` não gera contatos                  | `rb_narrowphase_mesh_main` não emite contato (`elements/gpu/wgsl/kernels/rb_narrowphase.wgsl`); fluidos também não colidem com malha                         | F5 (015) |
| P3  | Campos de força ignorados                         | Só `GravityField` é consumido pelos solvers; `WindField`, `DragField`, `VortexField` e `BuoyancyField` alocam dados que nenhum Flow lê                       | F5 (016) |
| P4  | `JointConstraint` e `SpringConstraint` sem solver | Nenhum Flow nem kernel os consome; só `DistanceConstraint` (XPBD) é resolvida                                                                                | F5 (015) |
| P5  | `XPBDRigidSchema` sem Flow                        | Ausente de `DEFAULT_SOLVER_REGISTRATIONS` (`elements/physics/flows/defaultFlows.ts`); nenhum solver o simula                                                 | F5 (015) |
| P6  | Emissores de partículas sem simulação             | `ComputeParticleEmitter` e `ScriptedParticleEmitter` só declaram descritores (spawn, update e idade não existem); formas `Point`/`Sphere`/`Cone` sem uso     | F9 (025) |
| P7  | Sem acoplamento entre solvers                     | Cada solver reage só aos colliders do `ColliderSet`: fluido não empurra rígido, rígido não interage com macio, MPM e SPH/PBF não se veem                     | F5       |
| P8  | Corpo rígido só com esfera e caixa                | `RigidBody` aceita `shape: 'sphere' \| 'box'` (`elements/physics/bodies/RigidBody.ts`); sem cápsula, convexo ou SDF                                          | F5 (015) |
| P9  | Sem consultas espaciais                           | Não há raycast, shapecast nem character controller                                                                                                           | F5 (018) |
| P10 | Sem superfície de fluido                          | Fluidos desenhados como partículas (sprites lidos do pool, `ParticleFlow`, 008); sem superfície contínua (espaço de tela ou isosuperfície)                   | F5 (017) |

## 2. Limites de escala

| #   | Limite                                                        | Estado atual (evidência)                                                                                                                                                                                                                             | Fase     |
| --- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| E1  | XPBD resolve em uma única thread                              | `distance_solve_main` com `@workgroup_size(1)` percorre todas as restrições em laço (`elements/gpu/wgsl/kernels/distance_solve.wgsl`); `GraphColorer` já existe para paralelizar                                                                     | F5 (015) |
| E2  | ~~LCP sem broadphase~~ — resolvido na 007                     | Broadphase em grade hash na GPU (`SpatialHashGrid`), pares por substep e narrowphase indireta: pares testados 0,087% de N·M em `rigid-bodies/10k`, mesmo conjunto de contatos e trajetórias bit a bit                                                | F2 (007) |
| E3  | ~~Readback dos corpos rígidos por quadro~~ — resolvido na 007 | A pose é publicada na GPU direto no pool de `Transform` (posse da GPU, `rb_publish_pose`); a CPU lê sob demanda (`resources.read`); só contadores de diagnóstico são lidos, a cada 60 passos                                                         | F2 (007) |
| E4  | Teto de partículas fixo                                       | SPH e PBF alocam 65 536 partículas (`NEIGHBOR_SEARCH_MAX_PARTICLES`); desde a 008 o excedente é erro na inserção com o teto (antes estourava em silêncio)                                                                                            | F5       |
| E5  | ~~Render sem instancing~~ — resolvido na 007                  | Grupos de instâncias por (geometria, pipeline, orientação) mantidos pela C2; forward e sombra fazem um `draw.indexed` por grupo; geometria deduplicada por conteúdo (`instances/10k`: 2 draws). Vertex pulling e arena ficaram para a F7 (R4 da 007) | F2 (007) |

### Notas da 007

- SC-004 (`instances/10k-moving` ≤ 3 ms de CPU): atendida — 2,80 ms (era 199 ms; Three 1,38 ms).
- Memória da US7: 1 milhão de entidades com heap JS retido de 1,18 GB após a montagem e 1,31 GB após os quadros (meta
  1,5 GB); GPU = pools (200 MiB) + 16,9 MiB.

### Notas da 008

- Geometria gerada em compute (§4): resolvida — geometria escrita pela GPU (`PointCloudGeometry`, `SurfaceGeometry`),
  corpos de partículas desenhados lendo o pool, topologia do material respeitada.
- Defeito encontrado e corrigido: slot liberado de pool de partículas continuava simulado e entrava na busca de
  vizinhança (despacho de `[0, count)` sem teste de ocupação); agora há bitset de vivos na GPU (`pool_live`).
- Defeito encontrado e corrigido: a busca de vizinhança recriada pelo material (outra grade) repetia as specs da
  anterior e reaproveitava bind groups ligados a buffers destruídos (erro de validação a cada quadro); agora cada
  busca tem discriminador com geração.
- Busca de vizinhança otimizada (antecipado da F5/015): células ordenadas por índice, faixas contíguas e lista
  intercalada, sem vetor local por partícula — `particles/64k` 17 → 74 fps (GPU 60 → 13 ms); trajetórias de SPH e PBF
  regravadas (ordem dos vizinhos).
- MSAA 4× antecipado da F4/011.

### Pendências novas (levantadas na 007)

| #   | Pendência                                 | Estado atual (evidência)                                                                                                                                                                                                                                   | Fase |
| --- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| G1  | Clip z da câmera em [−1, 1]               | `camera_perspective`/`camera_orthographic` (`elements/gpu/wgsl/math/camera.wgsl`) mantêm a convenção dos controllers e do bench anteriores; o WebGPU usa z em [0, 1] (metade da precisão de profundidade perdida)                                          | F4   |
| G2  | Passthrough do pós sem efeitos            | Sem efeitos, o `PostFlow` ainda copia a cor dos `FrameTargets` para o canvas num passe de tela cheia (0,202 ms em `instances/10k`); o forward deveria desenhar direto no canvas                                                                            | F4   |
| G3  | p99 de `rigid-bodies/10k` (SC-005 da 007) | Débito aceito (2026-10-13): p99 5,53 ms, média 2,97 ms (1,86× contra a meta de 1,5×; 1,6× sem profiling). Os picos do readback (309 ms) acabaram; a razão vem da oscilação do laço do navegador em quadros de ~3 ms (o Three mostra 2,8× em cenas rápidas) | F10  |

## 3. Resolvidos na 006 (2026-10-12)

| Achado (A6 do levantamento da 006)                                                    | Correção                                                                                                      |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Readback do LCP mapeava slot → entidade quando a leitura resolvia, não quando copiava | Mapa slot → entidade capturado em `framePrepare` e a leitura iniciada em `frameRecorded` (`LCPFlow`)          |
| `TransformFlow` não recompunha quando a contagem caía por remoção                     | Remoção de entidade (`entitiesChanged`) volta a `stale` e recompõe                                            |
| `ColliderSet` omitia o pool de malha                                                  | Pool de malha no grupo de colliders (`collider_meshes`/`collider_mesh_owners`); contato com malha segue em P2 |
| Comentário do `XPBDFlow` dizia 1 substep padrão (o código usa 8)                      | Documentação corrigida                                                                                        |
| `ShadowMap.schema` não era lido por shader                                            | `forward.wgsl` e `shadow_depth.wgsl` leem `array<ShadowMap>` pelo slot do caster                              |
| Inserção em massa O(n²) com o forward pronto e nos solvers com colliders              | Só as entidades adicionadas são processadas; o `ColliderSet` é reconstruído uma vez por quadro                |
| Rebind do material com offset dinâmico a cada draw (R8) dobrava a GPU de `instances`  | Registro `Renderable` mantido pela C2 e material em pool de storage (Emenda 1, R16): GPU 1,07 → 0,66 ms       |
| Laço gastava RAFs sem desenhar com a GPU cheia (sem vsync, ~1/60 s de espera)         | Evento `frameRetired`: `GameLoop` e o bench esperam a vaga na GPU antes do RAF                                |
| Pool de storage arredondava o stride a 16 (≠ stride do `array<T>` em structs menores) | Stride do pool = stride do struct; `role: 'uniform'` em pool rejeitado (o pool uniforme saiu)                 |

## 4. Fora do escopo da 006

| Item                                                                                                                          | Fase     |
| ----------------------------------------------------------------------------------------------------------------------------- | -------- |
| Pools de Transform/Camera/Light/Material/Renderable produzidos e lidos pela GPU sem a CPU (o `Renderable` existe desde a 006) | F2 (007) |
| Instancing e vertex pulling (E5)                                                                                              | F2 (007) |
| Fim do readback da física (E3)                                                                                                | F2 (007) |
| Geometria gerada em compute                                                                                                   | ✅ 008   |
| Pontos de extensão matemáticos (métrica, espaços não euclidianos)                                                             | F3       |
| Lacunas de simulação P1–P10 e limites E1, E2, E4                                                                              | F5       |

## 5. Ordem do ROADMAP

F1 (004, 005, 006) concluída; F2 (007 — ponte compute↔render; 008 — geometria em compute) bloqueia o resto; F3, F4 e
F5 podem andar em paralelo depois. As pendências P1–P5, P7–P10, E1 e E4 são da F5; P6 da F9; G1 e G2 da F4; G3 (débito do p99 da 007) da F10, ao fim das fases programadas. E2, E3 e E5
foram resolvidas na 007 (F2); a geometria em compute, na 008 (F2 concluída).
