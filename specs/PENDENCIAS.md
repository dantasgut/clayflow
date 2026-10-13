# Pendências do motor — simulação (levantamento 2026-10-12)

Levantamento feito no código após a spec 005 (`feature/005-shader-modules`, PR #37). Lista o que existe na API mas
não simula, os limites de escala e a pendência de verificação da 005. Cada item aponta a evidência no código e a fase
do [ROADMAP](ROADMAP.md) em que está previsto.

## 0. Verificações de desempenho pendentes (005 e 006)

| Item                                      | Estado                                                                                                                                                                                                                                                                                                                                                                                                                                 | Próximo passo                                                                                                                              |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| T084 da 005 e T068 da 006 — `bench:check` | Fechadas (2026-10-13, máquina livre, Chrome 155, baseline do perfil gravado do `b17d5d6`): CPU de todas as cenas caiu 31–90% (`instances/10k` −84%, meta −30%). O gate apontou só a GPU de `instances/10k-moving` (0,41 → 0,67 ms): no `b17d5d6` ela é bimodal (0,43 ou 0,94 ms na mesma build, estados de clock da T085 da 004) e o baseline pegou o modo baixo; o atual é estável em 0,67 ms, igual ao `10k` parado (0,92 → 0,66 ms) | Quando o baseline for regravado, medir a GPU de `10k-moving` com mais amostras ou descartar o modo baixo com critério declarado no harness |
| SC-010 da 006 — GPU de `instances/10k`    | 0,66 ms contra o alvo de 0,52 ms (A/B do `b437e47`). A diferença de ~0,12 ms não vem de binds nem do shader (material no vértice, posição na luz no vértice, sem a indireção `renderables → worlds` e formato de índice testados)                                                                                                                                                                                                      | Spec seguinte (paridade com o Three.js)                                                                                                    |

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
| P10 | Sem superfície de fluido                          | Fluidos são renderizados só como partículas                                                                                                                  | F5 (017) |

## 2. Limites de escala

| #   | Limite                                 | Estado atual (evidência)                                                                                                                                                                                                                                                                                 | Fase     |
| --- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| E1  | XPBD resolve em uma única thread       | `distance_solve_main` com `@workgroup_size(1)` percorre todas as restrições em laço (`elements/gpu/wgsl/kernels/distance_solve.wgsl`); `GraphColorer` já existe para paralelizar                                                                                                                         | F5 (015) |
| E2  | LCP sem broadphase                     | Cada corpo testa todos os colliders (O(N·M)); `rigid-bodies/10k` ≈ 340 ms/quadro. A busca de vizinhança (spec 005) é a base prevista                                                                                                                                                                     | F5 (015) |
| E3  | Readback dos corpos rígidos por quadro | Pose lida de volta para a CPU com 1 quadro de atraso                                                                                                                                                                                                                                                     | F2       |
| E4  | Teto de partículas fixo                | SPH e PBF alocam 65 536 partículas (`SPHFlow.ts:243`, `PBFFlow.ts:42`)                                                                                                                                                                                                                                   | F5       |
| E5  | Render sem instancing                  | 1 draw por objeto. A alocação por entidade do forward saiu na 006 (câmera, mundo e material pelos slots; nenhum objeto de GPU por entidade) e o bind por draw também (registro `Renderable` mantido pela C2, Emenda 1); falta agrupar os draws por (geometria, pipeline) com instancing / vertex pulling | F2 (007) |

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
| Geometria gerada em compute                                                                                                   | F2 (008) |
| Pontos de extensão matemáticos (métrica, espaços não euclidianos)                                                             | F3       |
| Lacunas de simulação P1–P10 e limites E1, E2, E4                                                                              | F5       |

## 5. Ordem do ROADMAP

F1 (004, 005, 006) concluída; F2 (007 — ponte compute↔render; 008 — geometria em compute) bloqueia o resto; F3, F4 e
F5 podem andar em paralelo depois. As pendências P1–P5, P7–P10, E1, E2 e E4 são da F5; P6 da F9; E3 e E5 da F2.
