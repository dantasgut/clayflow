# Pendências do motor — simulação (levantamento 2026-10-12)

Levantamento feito no código após a spec 005 (`feature/005-shader-modules`, PR #37). Lista o que existe na API mas
não simula, os limites de escala e a pendência de verificação da 005. Cada item aponta a evidência no código e a fase
do [ROADMAP](ROADMAP.md) em que está previsto.

## 0. Verificação pendente da 005

| Item                 | Estado                                                                                                                                                                                                                                                                          | Próximo passo                                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| T084 — `bench:check` | REPROVADO numa rodada com carga externa (`completion_test` e `mediaanalysisd` a ~90–100% de CPU): timeout em `instances/10k-moving`, p99 de `unique-objects/1k`, p95/p99 de `rigid-bodies/10k`. Todas as médias melhoraram 13–46%; `instances/10k-moving` isolado: 272 × 304 ms | Repetir `npm run bench:check` com a máquina livre; se verde, `npm run bench:baseline` (melhorias acima da tolerância) |

## 1. Na API, sem simulação

| #   | Pendência                                         | Estado atual (evidência)                                                                                                                                     | Fase     |
| --- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| P1  | FEM sem solve elástico                            | `FEMFlow` roda só `fem_predict` e `fem_velocity_update` — integra gravidade (`elements/physics/shaders/fem.ts`). As funções de FEM já estão em `wgslLib.fem` | F5 (016) |
| P2  | `MeshCollider` não gera contatos                  | `rb_narrowphase_mesh_main` não emite contato (`elements/gpu/wgsl/kernels/rb_narrowphase.wgsl`); fluidos também não colidem com malha                         | F5 (015) |
| P3  | Campos de força ignorados                         | Só `GravityField` é consumido pelos solvers; `WindField`, `DragField`, `VortexField` e `BuoyancyField` alocam dados que nenhum Flow lê                       | F5 (016) |
| P4  | `JointConstraint` e `SpringConstraint` sem solver | Nenhum Flow nem kernel os consome; só `DistanceConstraint` (XPBD) é resolvida                                                                                | F5 (015) |
| P5  | `XPBDRigidSchema` sem Flow                        | Ausente de `DEFAULT_FLOW_FACTORIES` (`elements/physics/flows/defaultFlows.ts`); nenhum solver o simula                                                       | F5 (015) |
| P6  | Emissores de partículas sem simulação             | `ComputeParticleEmitter` e `ScriptedParticleEmitter` só declaram descritores (spawn, update e idade não existem); formas `Point`/`Sphere`/`Cone` sem uso     | F9 (025) |
| P7  | Sem acoplamento entre solvers                     | Cada solver reage só aos colliders do `ColliderSet`: fluido não empurra rígido, rígido não interage com macio, MPM e SPH/PBF não se veem                     | F5       |
| P8  | Corpo rígido só com esfera e caixa                | `RigidBody` aceita `shape: 'sphere' \| 'box'` (`elements/physics/bodies/RigidBody.ts`); sem cápsula, convexo ou SDF                                          | F5 (015) |
| P9  | Sem consultas espaciais                           | Não há raycast, shapecast nem character controller                                                                                                           | F5 (018) |
| P10 | Sem superfície de fluido                          | Fluidos são renderizados só como partículas                                                                                                                  | F5 (017) |

## 2. Limites de escala

| #   | Limite                                      | Estado atual (evidência)                                                                                                                                                         | Fase         |
| --- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| E1  | XPBD resolve em uma única thread            | `distance_solve_main` com `@workgroup_size(1)` percorre todas as restrições em laço (`elements/gpu/wgsl/kernels/distance_solve.wgsl`); `GraphColorer` já existe para paralelizar | F5 (015)     |
| E2  | LCP sem broadphase                          | Cada corpo testa todos os colliders (O(N·M)); `rigid-bodies/10k` ≈ 340 ms/quadro. A busca de vizinhança (spec 005) é a base prevista                                             | F5 (015)     |
| E3  | Readback dos corpos rígidos por quadro      | Pose lida de volta para a CPU com 1 quadro de atraso                                                                                                                             | F2           |
| E4  | Teto de partículas fixo                     | SPH e PBF alocam 65 536 partículas (`SPHFlow.ts:243`, `PBFFlow.ts:42`)                                                                                                           | F5           |
| E5  | Render sem instancing; forward por entidade | 1 draw por objeto; forward aloca buffers e bind groups por entidade                                                                                                              | F1 (006), F2 |

## 3. Ordem do ROADMAP

F1 (006 — slots de Flow, `consumes`, migração do forward) → F2 bloqueiam o resto; F3, F4 e F5 podem andar em
paralelo depois. As pendências P1–P5, P7–P10, E1, E2 e E4 são da F5; P6 da F9; E3 da F2; E5 da 006/F2.
