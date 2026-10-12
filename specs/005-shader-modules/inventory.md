# Inventário de WGSL e de matemática em CPU — spec 005

## WGSL do legado (23 arquivos)

Os 23 arquivos sem uso (research A5) foram portados do legado sem adaptação. A matemática reaproveitável foi extraída
para os módulos da `wgslLib`; as cascas de kernel foram removidas porque dependiam de estruturas que não existem mais
ou eram seriais. Nenhum `.wgsl` ficou órfão (`src/elements/__tests__/wgslInventory.test.ts`) e nenhuma função existe em
dois arquivos (`wgslSymbols.test.ts`). Quem reescreve cada estágio: F2 (ponte simulação → render, Camera com
matrizes) ou F5 (FEM elástico com colisão, colisão e solve paralelo do XPBD, shape matching, solver do
`XPBDRigidSchema`).

| Arquivo                              | Extraído para                                                      | Motivo da remoção                                                                                                                    | Estágio reescrito em                           |
| ------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| `kernels/rb_solve.wgsl`              | — (impulso e atrito já em `lcp`)                                   | serial: laço numa thread sobre todos os contatos; substituído pelo solve Jacobi do LCP (004)                                         | —                                              |
| `kernels/rb_solve_velocity.wgsl`     | — (`coulomb_clamp`, `combine_mu` em `lcp`)                         | serial (uma thread); substituído por `rb_solve_lcp`                                                                                  | —                                              |
| `kernels/rb_velocity_recovery.wgsl`  | — (`quat_delta_omega` em `quat`)                                   | casca do solver posicional de corpo rígido (XPBD), que não existe; o LCP resolve em velocidade e não recupera velocidade de posições | F5 (solver do `XPBDRigidSchema`)               |
| `kernels/rb_substep_update.wgsl`     | — (integração de orientação em `quat`)                             | casca do mesmo solver posicional (atualização de posição por substep)                                                                | F5 (solver do `XPBDRigidSchema`)               |
| `kernels/rb_update_colliders.wgsl`   | —                                                                  | collider único: escrevia no `ColliderDesc` de 160 B, substituído pelo `ColliderSet` tipado (não compilava)                           | —                                              |
| `kernels/rb_sync_transform.wgsl`     | — (`quat_to_mat4` em `mat`)                                        | UBO por objeto: escrevia matrizes num UBO por entidade; a pose vai ao `Transform` e `transform_compose`                              | F2 (ponte simulação → render na GPU)           |
| `kernels/collision.wgsl`             | — (SDF em `sdf`, push-out em `collider_set`)                       | collider único (`ColliderDesc`, não compilava); colisão de partículas agora em `collider_set`                                        | F5 (colisão do XPBD)                           |
| `kernels/fem_solve.wgsl`             | `fem` (`compute_Ds`, `compute_F`, `compute_J`, gradientes, Δλ)     | casca: dependia de `FEMElement` e `ColorRange` escritos à mão e de coloração em CPU                                                  | F5 (FEM elástico, com `GraphColorer`)          |
| `kernels/fem_collision.wgsl`         | — (SDF em `sdf`)                                                   | collider único (`ColliderDesc`, não compilava)                                                                                       | F5 (FEM com colisão, sobre `collider_set`)     |
| `kernels/fem_vertex_write.wgsl`      | —                                                                  | vertex intercalado fixo de 8 floats; render lê os pools por `vertexLayout`                                                           | F2 (ponte pool de partículas → geometria)      |
| `kernels/mpm_vertex_write.wgsl`      | —                                                                  | vertex intercalado fixo de 8 floats                                                                                                  | F2 (ponte pool de partículas → geometria)      |
| `kernels/vertex_write.wgsl`          | —                                                                  | vertex intercalado fixo de 8 floats                                                                                                  | F2 (ponte pool de partículas → geometria)      |
| `kernels/distance_solve_color.wgsl`  | — (Δλ em `xpbd`)                                                   | casca: `ColorRange` à mão e cores calculadas em CPU (`GraphColorSolver`, removido)                                                   | F5 (solve paralelo do XPBD com `GraphColorer`) |
| `kernels/distance_solve_jacobi.wgsl` | ponto fixo → `fixed_point`                                         | duplicado: constante e conversão próprias de ponto fixo (`JACOBI_FIXED_SCALE`)                                                       | F5 (solve paralelo do XPBD)                    |
| `kernels/jacobi_apply.wgsl`          | ponto fixo → `fixed_point`                                         | duplicado: mesma constante de ponto fixo; aplicação junto do solve Jacobi                                                            | F5 (solve paralelo do XPBD)                    |
| `kernels/shape_match_transform.wgsl` | decomposição polar → `mat` (`polar_decomp_quaternion`)             | corpo único (estado de um corpo só) e serial (centro de massa e `A_pq` numa thread)                                                  | F5 (shape matching, com `Reduce`)              |
| `kernels/shape_correct.wgsl`         | —                                                                  | casca do shape matching (aplicação das posições alvo)                                                                                | F5 (shape matching)                            |
| `math/linalg.wgsl` (legado)          | `linalg` (det, inversa, transposta, produto) — arquivo substituído | duplicado: `mat3_*` em três arquivos                                                                                                 | —                                              |
| `math/fem_kinematics.wgsl`           | `fem`                                                              | substituído (fundido com `fem_xpbd` no módulo `fem`)                                                                                 | —                                              |
| `math/fem_xpbd.wgsl`                 | `fem`                                                              | substituído (fundido no módulo `fem`)                                                                                                | —                                              |
| `math/shape_matching.wgsl`           | `mat` (polar), `linalg` (det, transposta, produto)                 | duplicado: cópias de `mat3_*` e da decomposição polar                                                                                | —                                              |
| `structs/contact_manifold.wgsl`      | `RBContactSchema` (gerado)                                         | substituído: structs vêm dos schemas (US2)                                                                                           | —                                              |
| `structs/fem_element.wgsl`           | —                                                                  | substituído: struct à mão sem consumidor; o elemento FEM terá schema quando o estágio existir                                        | F5 (FEM elástico)                              |

## CPU

Auditoria da matemática repetida em TypeScript (FR-017). Nada foi removido fora do escopo da 005: os pontos abaixo
pertencem a estágios que a 006 (migração do forward e da sombra) e a F2 (Camera com matrizes calculadas por Flow,
ponte simulação → render) reescrevem.

| Onde                                                              | O que se repete                                                          | Destino                                                                                                                                                       |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/presentation/input/controllers/{Orbit,Fly,Fps}Controller.ts` | `lookAtMatrix`, `perspectiveMatrix` e `multiplyMatrices` — três cópias   | F2: o controller passa a mexer só no `Transform` da câmera; view/projeção vêm de um Flow sobre `Camera` + `WorldTransform` (a `Camera` hoje não tem matrizes) |
| `src/presentation/flows/ShadowFlow.ts`                            | `lookAt`, `ortho` e `mul` — quarta cópia, para a view-projeção da luz    | 006: a sombra migra para o forward por slots; a matriz da luz sai da mesma origem que a da câmera (F2)                                                        |
| `src/presentation/flows/{ForwardFlow,ShadowFlow}.ts`              | `isMirrored`, `alignUp`, `padTo4`/`padTo4Bytes` — duas cópias            | 006: migração do forward e da sombra                                                                                                                          |
| `src/elements/physics/flows/LCPFlow.ts` (leitura das poses)       | normalização de quaternion em CPU ao copiar a pose para o `Transform`    | F2: ponte simulação → render na GPU (o pool de corpos alimenta o `WorldTransform` sem leitura)                                                                |
| `src/elements/particles/shapes/{Sphere,Cone}EmitterShape.ts`      | amostragem de direções na esfera e no cone (ocorrência única, sem cópia) | módulo `sampling` (fase posterior, fora do escopo)                                                                                                            |

Resolvido antes desta auditoria: a reescrita de `quat_to_mat4` em TS no `LCPFlow` (citada no ROADMAP) não existe mais —
a pose vai para o `Transform` e a matriz é composta na GPU por `transform_compose` (que requer `mat`).

Referências independentes de propósito (oráculos de teste, não duplicação): `quatCols` em
`src/__smokes__/transforms.ts`, `cameraMatrices` do bench, `src/__smokes__/support/noiseReference.ts` e as funções de
referência do smoke `shaderLibrary`.
