# Inventário de WGSL e de matemática em CPU — spec 005

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
