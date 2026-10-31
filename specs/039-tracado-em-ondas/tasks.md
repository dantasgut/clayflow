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

### Phase 6: a peça da C2 e o que falta expor (bloqueia o resto)

Revisão de 2026-10-31: o pool do corpo com descritores de trabalho, os descritores próprios com `reserve`, a
redescrição que encolhe e a leitura sob demanda já existem (plan D8); só o uniforme por região é peça nova.

- [x] T115 [US8] `GPUDescriptor.regions` (uniforme por região com offset dinâmico, alinhamento do adaptador, envio só
      das regiões alteradas, reserva por redescrição, fonte com `dynamic: { stride }`) em
      `src/scene/descriptors/GPUDescriptor.ts` e `src/scene/systems/ResourceSystem.ts`; testes.
- [x] T116 [US8] `read` no `ResourceDirectory` (`src/scene/contracts/ResourceDirectory.ts`) para os Flows; medir a
      leitura a cada quadro e, se o staging por leitura pesar, reaproveitá-lo dentro do `read`; testes. (Exposto e testado; a medida por quadro sai na T128, com a fila da
      refração como primeiro leitor.)
- [x] T117 [US8] Teste do trabalho por entidade: descritor de pool `upload: 'never'`, `allocation: 'onDemand'` no mesmo
      slot do `body`, crescendo com o pool e reaproveitando faixas (o caso que o PBF vai usar).
- [x] T118 [US8] Teste de vazamento da redescrição: crescer, encolher, crescer de novo um descritor próprio com `count`
      — o mesmo tamanho e as ligações refeitas (`reallocateOwn`).

- [x] T118a [US8] O Resource de trabalho do Flow: `slot.work(fábrica)` e `BoundWork` em `src/scene/flows/slots.ts`; a
      inserção em `ensureFlowAllocated` e a remoção em `releaseFlow` (`src/scene/systems/flowBinding/`); a resolução pela
      identidade e o fornecedor `{ slot: 'work', descriptor }` (com `regions`, a fonte com offset dinâmico); testes
      (uma instância por `bodyType`, remoção sem vazamento, redescrição religando o Flow).
- [x] T118b A documentação e os diagramas de arquitetura (`clay-engine-doc/docs/guides/flows.md`,
      `architecture_resource_loaders.md`, `physics_flows.md`, `dev_workflow.md`, `node-graphs.md`).

### Phase 7: os auxiliares como provedores de descritores

- [x] T119 [US8] `PerStepUniforms` e `FrameUniforms` sobre as regiões da T115 em `src/elements/gpu/compute/`.
- [x] T120 [P] [US8] `RayWave` (`src/elements/raytrace/RayWave.ts`): `descriptors(prefix, capacidade, classes)` e
      `attach`; sem `core.create`.
- [x] T121 [P] [US8] `PrefixSum`, `RadixSort`, `Compaction`, `Reduce`, `CountToArgs`, `SpatialHashGrid`, `GraphColorer`
      em `src/elements/gpu/compute/`.
- [x] T122 [P] [US8] `ColliderSet` (`src/elements/physics/colliders/ColliderSet.ts`: os donos como descritores de pool
      dos colisores) e `NeighborSearchPipeline` (`src/elements/gpu/NeighborSearchPipeline.ts`: os arrays por partícula
      como descritores de pool do corpo, as células como descritores próprios do `ParticlePhysics`).
- [x] T123 [P] [US8] `UiGpuPipeline` (`src/presentation/ui/`) e `SetNodeKernels` (`src/elements/nodes/set/`).

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

- [x] T128 [US8] `RefractionFlow` → `RefractionWork`: cadeia, dispersão adiada, cabeçalho, argumentos, blocos,
      carimbos (`reserve` pelo alvo), a onda; a contagem da fila por `read` (sai o `measureQueue` com staging próprio). Feito no `RefractionWork` do Flow (b34bd5f4); a fila lida pelo `read` da C2.
- [x] T129 [US8] `CausticsFlow` → `CausticsWork`: alvos, capazes, fótons, fila, argumentos, a onda; a capacidade pela
      configuração nos dois sentidos (os dois defeitos medidos somem: teste do custo depois de 262 144 e de 0 → 65 536). Feito no `CausticsWork` do Flow (b34bd5f4): os fótons realocam nos dois sentidos; a medida dos dois defeitos fica para a Phase 10.
- [x] T130 [US8] `ProbeFlow` → `GlobalIllumination` (o trabalho de tela por `reserve` pelo alvo). Feito no `ProbeWork` do Flow, não no `GlobalIllumination`: o trabalho é da instância do estágio (b34bd5f4).
- [x] T131 [US8] `FluidFieldFlow` → `FluidField` e `RaySceneFlow` → `RayScene`. Feito no `FieldWork` e no `RaySceneWork` dos Flows; os cabeçalhos das hierarquias vão à faixa do `RayScene` por `writeNow` (b34bd5f4).
- [x] T132 [US8] `PostFlow` → `FrameTargets`; `ForwardFlow`, `ShadowFlow`, `ParticleFlow`, `UIFlow` → os donos da D10. Feito nos Resources de trabalho dos Flows (`PostWork`, `ForwardWork`, `ShadowWork`, `ParticleWork`, `UIWork`); o atlas da fonte é textura com conteúdo da CPU pela C2 (b34bd5f4).
- [ ] T133 [US8] Smokes do desenho com os critérios atuais; o tanque no perfil alto contra as capturas atuais.

### Phase 10: a Opção B e os perfis (US9)

- [ ] T134 [US9] B3 no `CausticsFlow` (no passo da física ou na mudança da cena; a média pelo perfil); medido.
- [ ] T135 [US9] B1 no `RefractionFlow` e no `refraction_chain.wgsl` (rodadas por quadro, vagas que continuam, carimbo
      de nascimento); medido com a câmera parada e girando.
- [ ] T136 [US9] B2 no `RefractionFlow` (xadrez pelos carimbos, rejeição do histórico); medido.
- [ ] T137 [US9] Os perfis com as peças que passam a SC-010; a tabela por perfil no `baseline.md` (SC-009); o que não
      fechar vai ao usuário com a medida.

### Phase 11: o espaço de trabalho da simulação e da cena (US8)

Pelos pools dos corpos e pelos descritores próprios com `reserve` (plan D12), sem peça nova.

- [x] T138 [P] [US8] `LCPFlow`: os proxies no pool do corpo; pares, contatos, contadores e argumentos como descritores
      próprios com `reserve`; os contadores por `read`. Os proxies ficaram no `LCPWork` pela capacidade: indexam caixas seguidas de esferas (dois pools de colisor), não as entidades de um pool; contadores pelo `read` (b34bd5f4).
- [x] T139 [P] [US8] `PBFFlow`, `SPHFlow`: `delta`, `normal`, `boundary` como descritores de pool do `ParticleBody`
      (saem os tamanhos fixos de `NEIGHBOR_SEARCH_MAX_PARTICLES`); `DiffuseFlow` (com a `NeighborSearchPipeline` da
      T122); `MPMFlow` com a grade no Resource do domínio.
- [x] T140 [P] [US8] `EmitterFlow`, `SurfaceColliderFlow`, `SoftSurfaceFlow` (faces e SDF no Resource do corpo ou do
      colisor, `onDemand`), os Flows de FEM e XPBD. O trabalho por entidade das superfícies macias e dos colisores de superfície ficou como parte do trabalho do Flow, uma por entidade, tirada com `drop` quando ela sai (b34bd5f4).
- [x] T141 [P] [US8] `TransformFlow`, `CameraFlow` (elos e listas no pool do `Transform` e da câmera),
      `ShadowMatrixFlow`, `SurfaceFlow`, `GraphFlow`/nós de conjunto. Os elos, pares e listas por função são listas globais compactadas montadas na CPU: descritores do trabalho pela capacidade, não pools por `Transform`/câmera (b34bd5f4).
- [ ] T142 [US8] Smokes de física com os critérios atuais.

### Phase 12: fechamento da emenda

- [ ] T143 [US8] A regra de lint contra `core.create` em `src/elements/**` e `src/presentation/**` e o teste que conta
      os sites (SC-007).
- [ ] T144 Vídeo do tanque em cada perfil no Chrome (SC-011).
- [ ] T145 Gate completo (lint, tsc, testes, smokes) — junto com a T114.
