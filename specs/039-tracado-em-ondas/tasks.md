---
description: 'Tarefas da 039 refeita — água em tempo real com trabalho fixo por pixel'
---

# Tasks: 039 refeita

Já feito na primeira versão e mantido: a onda dos acertos (`RayWave`, `hitShade`, a separação por classe), o material
fora dos kernels de GI e cáusticas, o meio homogêneo por corpo, o `whenReady` com espaço na GPU.

**Regra da GPU**: uma execução por vez; conferir processos em `E`/`U`; parar a série se uma compilação ou espera passar
de ~2 min.

## Phase 1: Medição

- [x] T101 Tanque do motor anterior à 039 por estágio no `baseline.md` (133,6 ms; refração 92,5; cáusticas 22,8).
- [ ] T102 [US6] O app liga a medição por passe (`profiling`) e mostra a tabela por estágio; o mesmo no smoke do tanque.
      (2026-10-30: existe no bench `?p=passes` e no gravador; falta o painel do app.)

## Phase 2: US3 — a cadeia fixa por pixel (P1)

- [x] T103 [US3] `refraction_chain.wgsl`: o estado por pixel, os estágios câmera → reflexão → transmissão (até
      `REFRACTION_CHAIN`) → canais da dispersão → fim, sobre `refraction_node_at`; a radiância, o fim, o albedo e o
      movimento nos alvos atuais.
- [x] T104 [US3] `RefractionFlow`: os estágios com a onda de tamanho fixo (pixels da fila); sai a fila de caminhos, as
      folhas, a ordenação e `refraction_wave.wgsl`.
- [ ] T105 [US3] Testes de composição (despachos fixos, nenhuma função `material` no traçado, teto dos laços).
- [ ] T106 [US3] Smoke `refraction` com os critérios atuais e o custo da lente (≤ 3 ms); o tanque no app sem verde.
      (Emenda: o custo da lente vai à medida por perfil, SC-009; a lente está em 21,6 ms.)

## Phase 3: US2 — a malha da superfície (P1)

- [x] T107 [US2] `FluidSurfaceMesh` + `FluidSurfaceMeshFlow` + `field_mesh.wgsl` (tetraedros marchantes nos blocos
      ocupados, vértice de 8 bytes, desenho indireto, estouro por evento). (Feita dentro do `FluidField`: a malha e os
      argumentos são descritores dele, `FluidFieldFlow.mesh`; sem Resource próprio.)
- [x] T108 [US2] O pedido da água pelo raster da malha no lugar da marcha por pixel; a entrada da cadeia pelo alvo.
- [ ] T109 [US2] Smoke da superfície: vértices contra o nível zero; profundidade contra a marcha de referência.

## Phase 4: cáusticas e física

- [ ] T110 Cáusticas por kernel medidas; a transmitância analítica pelo meio homogêneo; meta ≤ 2 ms no tanque.
      (2026-10-30: medidas por kernel no `baseline.md`, 4,7 ms; a correção da linha reta pelo mapa da luz feita; a meta
      vai à medida por perfil, SC-009.)
- [ ] T111 [US5] Vizinhança do PBF por intervalos contíguos com reordenação; física ≤ 4 ms.

## Phase 5: Fechamento

- [ ] T112 O tanque por estágio no `baseline.md` (SC-001) e a comparação de imagem com o motor anterior (SC-003).
      (2026-10-30: o mapa por estágio e a SC-003 no quadro 400 registrados; o SC-001 substituído pela SC-009.)
- [ ] T113 Vídeo do tanque no Chrome; no Deno com aprovação (SC-006).
- [ ] T114 Gate completo: lint, tsc, testes, smokes.

## Emenda 2026-10-30 — o renderizador e o espaço de trabalho gerenciado

Ver a emenda na spec (US7–US9) e no plano (D7–D13). Cada fase termina com tsc, lint, testes e os smokes que ela toca;
a imagem do tanque no perfil alto contra as capturas atuais (piso de ruído).

### Phase 6: as peças da C2 (bloqueia o resto)

- [ ] T115 [US8] `GPUDescriptor.bufferShape` (buffer pela tela) e a recriação em `resizeCanvasTextures` em
      `src/scene/descriptors/GPUDescriptor.ts` e `src/scene/systems/ResourceSystem.ts`; testes de alocação e de
      redimensionamento.
- [ ] T116 [US8] `GPUDescriptor.readback` e o evento `bufferRead` (staging interno em anel, uma leitura em voo, entrega
      aos Flows com slot) em `ResourceSystem.ts`, `src/scene/flows/FlowTransitions.ts` e `FlowRuntime.ts`; testes.
- [ ] T117 [US8] `GPUDescriptor.regions` (uniforme por região com offset dinâmico, alinhamento do adaptador, envio só
      das regiões alteradas, reserva por redescrição) em `ResourceSystem.ts`; testes.
- [ ] T118 [US8] Redescrição que encolhe: liberar e realocar no tamanho menor sem estado preso; teste de vazamento
      (crescer, encolher, crescer de novo — o mesmo tamanho e o mesmo custo).

### Phase 7: os auxiliares como provedores de descritores

- [ ] T119 [US8] `PerStepUniforms` e `FrameUniforms` sobre as regiões da T117 em `src/elements/gpu/compute/`.
- [ ] T120 [P] [US8] `RayWave` (`src/elements/raytrace/RayWave.ts`): `descriptors(prefix, capacidade, classes)` e
      `attach`; sem `core.create`.
- [ ] T121 [P] [US8] `PrefixSum`, `RadixSort`, `Compaction`, `Reduce`, `CountToArgs`, `SpatialHashGrid`, `GraphColorer`
      em `src/elements/gpu/compute/`.
- [ ] T122 [P] [US8] `ColliderSet` (`src/elements/physics/colliders/ColliderSet.ts`) e `NeighborSearchPipeline`
      (`src/elements/gpu/NeighborSearchPipeline.ts`).
- [ ] T123 [P] [US8] `UiGpuPipeline` (`src/presentation/ui/`) e `SetNodeKernels` (`src/elements/nodes/set/`).

### Phase 8: o `Renderer` (US7)

- [ ] T124 [US7] `src/elements/render/Renderer.ts` (fachada, perfis, validação, o dado `settings`), testes de unidade.
- [ ] T125 [US7] `RefractionWork` e `CausticsWork` no lugar de `Refraction` e `Caustics` (sem autoria; o dado vem do
      `Renderer`); os Flows e os shaders leem o mesmo layout.
- [ ] T126 [US7] Os estágios padrão (`src/presentation/flows/defaults.ts`): `app.defaults.renderer` com os componentes
      (`ToneMapping`, `TemporalAntialiasing`, `TemporalFilter`, `RefractionWork`, `CausticsWork`, `FrameTargets`); a
      inserção das cáusticas pela presença de transmissivo pelo renderizador.
- [ ] T127 [US7] O app (`../claflow-web`): as cenas e o painel pelo `Renderer` e pelo perfil (`waterScene.ts` dos dois
      repositórios: o teto de 8 vira o perfil alto).

### Phase 9: o espaço de trabalho do desenho (US8)

- [ ] T128 [US8] `RefractionFlow` → `RefractionWork`: cadeia, dispersão adiada, cabeçalho, argumentos, blocos,
      carimbos, a onda; a contagem da fila por `bufferRead` (sai o `measureQueue` com staging próprio).
- [ ] T129 [US8] `CausticsFlow` → `CausticsWork`: alvos, capazes, fótons, fila, argumentos, a onda; a capacidade pela
      configuração nos dois sentidos (os dois defeitos medidos somem: teste do custo depois de 262 144 e de 0 → 65 536).
- [ ] T130 [US8] `ProbeFlow` → `GlobalIllumination` (o trabalho de tela pelo `bufferShape`).
- [ ] T131 [US8] `FluidFieldFlow` → `FluidField` e `RaySceneFlow` → `RayScene`.
- [ ] T132 [US8] `PostFlow` → `FrameTargets`; `ForwardFlow`, `ShadowFlow`, `ParticleFlow`, `UIFlow` → os donos da D10.
- [ ] T133 [US8] Smokes do desenho com os critérios atuais; o tanque no perfil alto contra as capturas atuais.

### Phase 10: a Opção B e os perfis (US9)

- [ ] T134 [US9] B3 no `CausticsFlow` (no passo da física ou na mudança da cena; a média pelo perfil); medido.
- [ ] T135 [US9] B1 no `RefractionFlow` e no `refraction_chain.wgsl` (rodadas por quadro, vagas que continuam, carimbo
      de nascimento); medido com a câmera parada e girando.
- [ ] T136 [US9] B2 no `RefractionFlow` (xadrez pelos carimbos, rejeição do histórico); medido.
- [ ] T137 [US9] Os perfis com as peças que passam a SC-010; a tabela por perfil no `baseline.md` (SC-009); o que não
      fechar vai ao usuário com a medida.

### Phase 11: o espaço de trabalho da simulação e da cena (US8)

- [ ] T138 [P] [US8] `LCPFlow` (contatos, pares, proxies; os contadores por `bufferRead`).
- [ ] T139 [P] [US8] `PBFFlow`, `SPHFlow`, `DiffuseFlow` (com a `NeighborSearchPipeline` da T122) e `MPMFlow`.
- [ ] T140 [P] [US8] `EmitterFlow`, `SurfaceColliderFlow`, `SoftSurfaceFlow`, os Flows de FEM e XPBD.
- [ ] T141 [P] [US8] `TransformFlow`, `CameraFlow`, `ShadowMatrixFlow`, `SurfaceFlow`, `GraphFlow`/nós de conjunto.
- [ ] T142 [US8] Smokes de física com os critérios atuais.

### Phase 12: fechamento da emenda

- [ ] T143 [US8] A regra de lint contra `core.create` em `src/elements/**` e `src/presentation/**` e o teste que conta
      os sites (SC-007).
- [ ] T144 Vídeo do tanque em cada perfil no Chrome (SC-011).
- [ ] T145 Gate completo (lint, tsc, testes, smokes) — junto com a T114.
