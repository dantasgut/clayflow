# Pendências do motor (estado em 2026-11-12)

Reescrito na reconciliação da 034 (T071, SC-018), conferido contra o código e o histórico do `git` no branch
`feature/034-refracao-fisica`. Regras deste arquivo: nada aparece como resolvido sem o registro (hash) ou o arquivo que
o mostra, e nada que já foi feito aparece como pendente. As seções 1–5 são o que está aberto; a seção 6, o que fechou,
com a evidência; a seção 7 guarda as notas de fechamento das specs anteriores (histórico).

As fases citadas são as do [ROADMAP](ROADMAP.md); o estado das specs 034–040 está no §5.1 dele.

## 1. Simulação — na API, sem simular

| #   | Pendência                                         | Estado atual (evidência no código)                                                                                                                                                                                                                              | Fase     |
| --- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| P1  | FEM sem solve elástico                            | O `FEMFlow` (`elements/physics/flows/FEMFlow.ts`) roda só `fem_predict`, `fem_collide` e `fem_velocity_update`: integra a gravidade e colide (010). As funções de FEM estão em `wgslLib.fem`                                                                    | F5 (016) |
| P2  | `MeshCollider` não gera contatos — parcial        | Superfícies paramétricas colidem (010, `SurfaceCollider`); `rb_narrowphase_mesh_main` (`elements/gpu/wgsl/kernels/rb_narrowphase.wgsl`) ainda não emite contato com malha arbitrária ("por ora não gera contatos com mesh"), e os fluidos não colidem com ela   | F5 (015) |
| P4  | `JointConstraint` e `SpringConstraint` sem solver | Só existem em `elements/physics/constraints/`; nenhum Flow nem kernel os consome. Só a `DistanceConstraint` (XPBD) é resolvida                                                                                                                                  | F5 (015) |
| P5  | `XPBDRigidSchema` sem Flow                        | O schema existe (`elements/physics/bodies/schemas/XPBDRigidSchema.ts`); nenhum solver o simula                                                                                                                                                                  | F5 (015) |
| P6  | Emissores de partículas — parcial                 | `ComputeParticleEmitter` simulado na GPU desde a 009 (`EmitterFlow`); o `ScriptedParticleEmitter` (`elements/particles/ScriptedParticleEmitter.ts`) só declara o buffer, a simulação seria por callback na CPU; faltam ordenação, partículas suaves e flipbooks | F9 (025) |
| P7  | Sem acoplamento entre solvers                     | Cada solver reage aos colliders do `ColliderSet`, sem reação: o fluido não empurra o rígido, o rígido não interage com o macio, MPM e SPH/PBF não se veem. A fronteira sólida de Akinci da 034 (`7116382a`) é unilateral                                        | F5       |
| P8  | Corpo rígido só com esfera e caixa                | `RigidBody` aceita `shape: 'sphere' \| 'box'` (`elements/physics/bodies/RigidBody.ts`); sem cápsula, convexo ou SDF                                                                                                                                             | F5 (015) |
| P9  | Sem consultas espaciais                           | Não há raycast, shapecast nem controlador de personagem na API (a estrutura de raios da 033 é do render)                                                                                                                                                        | F5 (018) |

A água ganhou na 034 a fronteira sólida, a física das superfícies (`SurfacePhysics`, `Atmosphere`) e a tensão
contínua (CSF, `92bf686f`); o que falta dela está nas tarefas da 034 (§5) e nas specs 036 e 040.

## 2. Limites de escala

| #   | Limite                           | Estado atual (evidência no código)                                                                                                                                                                 | Fase     |
| --- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| E1  | XPBD resolve em uma única thread | `distance_solve_main` com `@workgroup_size(1)` percorre todas as restrições em laço (`elements/gpu/wgsl/kernels/distance_solve.wgsl`); o `GraphColorer` já existe para paralelizar                 | F5 (015) |
| E4  | Teto de partículas fixo          | A busca de vizinhos de SPH e PBF tem teto de 131 072 partículas (`NEIGHBOR_SEARCH_MAX_PARTICLES`, `elements/gpu/NeighborSearchPipeline.ts`); o pool acima do teto é erro na inserção (desde a 008) | F5       |

## 3. Grafos de nós (levantadas na 031)

| #   | Pendência                                   | Estado atual (evidência no código)                                                                                                                                                                                                                                                   | Fase     |
| --- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| N1  | Alias por alvo em grafos de ponto fundidos  | `compileSetGraph.ts` (`scene/graph/`) nomeia o struct por `paramsAlias` do alvo e o recurso por `<fn>_params`: um kernel com duas entradas de ponto do mesmo alvo daria `symbol-conflict`. Hoje cada kernel da biblioteca tem uma entrada de ponto; falta o sufixo por entrada       | F8 (032) |
| N2  | Alvo de saída que aparece depois da criação | O `GraphFlow` acha a `GraphGeometry` da entidade só ao começar a acompanhá-la (`track`): uma geometria acrescentada depois (`World.attach`) só é vista quando a entidade entra de novo no conjunto do slot. Sem alvo, `set.meshOutput`/`set.pointsOutput` não gravam nada, sem aviso | F8 (032) |
| N3  | Limite das contagens da GPU é pré-condição  | Contagens decididas na GPU não voltam à CPU: os nós limitam pela capacidade do plano (o excedente é descartado ou contado, como o `overflow` da `Compaction`); uma contagem acima da capacidade dá resultado truncado, sem erro                                                      | F8 (032) |
| N6  | Tipos de porta da biblioteca não exportados | `MESH`, `POINTS`, `U32S`, `MeshTriangleSchema`, `SetPointSchema` (`elements/nodes/set/schemas.ts`) não saem pelo pacote: um nó de conjunto escrito fora do motor precisa do caminho interno                                                                                          | F8 (032) |

## 4. Medida e imagem

| #   | Pendência                                            | Estado atual                                                                                                                                                                                                                                                                  | Onde          |
| --- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| H3  | p95 do quadro de `particles/64k-water` cruza o vsync | Aberta; a 039 mediu o campo e a física por estágio (`specs/039-tracado-em-ondas/baseline.md`) e descartou a vizinhança por intervalos, sem ganho                                                                                                                              | 034 T068      |
| G3  | p99 de `rigid-bodies/10k` (SC-005 da 007)            | Débito aceito em 2026-10-13 (p99 5,53 ms, média 2,97 ms: 1,86× contra a meta de 1,5×); aberta                                                                                                                                                                                 | 034 T068      |
| H6  | Raios dos acertos sem derivadas de tela — parcial    | Fechada para os nós da biblioteca, filtrados pelo footprint do pixel e do cone (`5a7823ff`, 034 T016–T019); as funções `material` do usuário que leem `dpdx`/`fwidth` crus seguem valendo pelas constantes nos acertos, documentadas como só de fragmento (`RaySceneFlow.ts`) | F4 (012)      |
| B1  | GPU de `instances/10k-moving` no baseline            | O gate da 006 apontou a GPU de `10k-moving` por um baseline bimodal (0,43 ou 0,94 ms na mesma build, `b2e1693e`); falta medir com mais amostras ou descartar o modo baixo com critério declarado no harness — sem registro de solução nas regravações seguintes               | 034 T064/T076 |

## 5. Tarefas abertas nas specs

| Spec             | O que segue aberto                                                                                                                                                                                                                                                                                                                                                                                                              | Destino              |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| 001              | T029 **bloqueada**: a cena de referência do app (`WebGPUCanvas.tsx`) saiu na 038 (claflow-web `3586df0`) sem ser reescrita com a fachada; o "comportamento idêntico" só se confere contra ela (histórico do app, `511de38`)                                                                                                                                                                                                     | sem destino definido |
| 011              | US5 — a biblioteca de 23 materiais (T090–T094) — e US6 — a comparação com o Three.js (T095–T100) inteiras; T003 (inventário dos smokes no README), T079 (madeira envernizada no `nodeGraphs`), T106 (`node-graphs.md` com os grupos de material), T107 (ordem dos passes no `architecture_resource_loaders.md`), T108 (ROADMAP e README), T112 (vídeos da galeria e da comparação). 9 feitas e 9 substituídas na reconciliação  | 035 (não criada)     |
| 034              | T059 (`giNoise` e a GI), T060c (texturas virtuais), T060d (desenho conduzido pela GPU, a F7/020 antecipada), T060e (custo da luz global no desenho), T060f (campo dos fluidos por páginas), T062 (fixtures), T064 e T076 (`bench:check`), T066d (a água que molha), T066e (tensão superficial e a poça), T067e (espalhamento no meio), T068 (H3, G3), T071 (esta reconciliação), T075 (smokes 3× e `npm run ci`), T077 (vídeos) | 034                  |
| 038              | T027 e T029 no app; a retirada do gravador antigo e de `videoScenes.ts` do motor (T030–T033); o Deno no motor — testes, naga (T035, T037, T038, T042); guias (T036, T046); o gravador pelo Deno para o catálogo e a gravação enviada (T043, T044); a janela nativa conferida (T045); JSDoc e gate (T047, T048). 6 feitas na reconciliação (T021–T026, no app)                                                                   | 038                  |
| 036 (não criada) | O solver da água: δ-SPH/DFSPH e os itens O7 e O8                                                                                                                                                                                                                                                                                                                                                                                | 036                  |
| 040 (não criada) | Absorção, evaporação e escoamento da água como dinâmicas próprias, a compactação das partículas mortas, a massa por partícula; a divisão de partículas (034 T066b)                                                                                                                                                                                                                                                              | 040                  |

As specs 002–010, 017, 030, 031, 033, 037 e 039 não têm caixa aberta. As quebras de API para quem usa o motor estão
em `specs/034-refracao-fisica/api-pendencias.md`.

## 6. Fechadas, com a evidência

| #                     | O que era                                                                                                                      | Como fechou (evidência)                                                                                                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 005 T084, 006 T068    | `bench:check` com a máquina livre                                                                                              | Chrome 155, baseline gravado do `b17d5d6` (`b2e1693e`): CPU de todas as cenas 31–90 % abaixo (`instances/10k` −84 %, meta −30 %); só a GPU de `10k-moving` apontada, por baseline bimodal (B1 acima) |
| SC-010 da 006         | GPU de `instances/10k` ≤ 0,52 ms                                                                                               | 0,46 ms na 007, um desenho por grupo de instâncias (`06e65161`; `specs/007-gpu-scene-state/tasks.md` T028, T056)                                                                                     |
| P3                    | Campos de força ignorados                                                                                                      | 009: ponto `field` nos seis solvers e nos emissores (gravidade pontual, vento, vórtice, arrasto, empuxo, `FieldFunction`; sem torque no rígido)                                                      |
| P10                   | Sem superfície de fluido                                                                                                       | 017 (`fefbbe4f`); na 034 a água passou a ser vista só pela refração traçada, com a aparência do grafo (`7116382a`)                                                                                   |
| E2, E3, E5            | LCP sem broadphase; readback dos rígidos por quadro; render sem instancing                                                     | 007: grade hash na GPU (`8a1f9359`); pose publicada na GPU no pool de `Transform`; grupos de instâncias com um desenho por grupo (`06e65161`)                                                        |
| N4, N5, N7, N8 (= G1) | Sprites fora dos pontos de luz; "produzido no quadro" privado; comentários antigos; clip z                                     | 031 (PR #46, `7fa2e12b`): `scene_any_light_direction`, `ctx.produced`/`isProduced`, doc-comments, profundidade [0, 1] do WebGPU                                                                      |
| G2                    | Passthrough do pós sem efeitos                                                                                                 | 034 T033 (`cb177eb7`): sem efeitos, a resolução temporal apresenta direto no canvas                                                                                                                  |
| H1                    | Tempo de GPU por quadro no Apple repetia leituras velhas                                                                       | 034 T010–T013 (`7af61cf4`): anel de leituras, uma entrega por quadro (`gpuFrameTimed`), escopos por fase e por Flow                                                                                  |
| H2                    | Consumidor ausente caía em silêncio                                                                                            | 034 T004–T009 (`9ef9ed5f`): evento `consumerMissing` e a prontidão (`whenReady`)                                                                                                                     |
| H4, H5                | Fixtures e checagens divergentes desde a 011; cáusticas agitadas 1,29×                                                         | Fixtures regravadas contra a saída do `develop` na 033 (`661e29c6`, `specs/033-global-illumination/fixtures.md`); as seis checagens e H4/H5 fechadas na 034 T070 (`15e667ac`, `38515df6`)            |
| R1 (011)              | Refração com o fundo pixelado (cópia da tela)                                                                                  | 034: refração pela estrutura de raios, sem cópia da tela (`c5eb3cb3`; a lente e a dispersão na 034 T047)                                                                                             |
| Achados da 006 (A6)   | Readback do LCP, `TransformFlow` na remoção, pool de malha no `ColliderSet`, rebind por draw, RAFs sem desenho, stride do pool | Corrigidos na 006 (`c1030d89` e os registros da Emenda 1; `specs/006-flow-slots/tasks.md`)                                                                                                           |

## 7. Notas de fechamento das specs anteriores (histórico)

Cada nota descreve o motor no fechamento da spec; onde uma spec seguinte mudou o que a nota diz, isso vem marcado
como **superado**.

### 007

- SC-004 (`instances/10k-moving` ≤ 3 ms de CPU): atendida — 2,80 ms (era 199 ms; Three 1,38 ms).
- Memória da US7: 1 milhão de entidades com heap JS retido de 1,18 GB após a montagem e 1,31 GB após os quadros (meta
  1,5 GB); GPU = pools (200 MiB) + 16,9 MiB.

### 008

- Geometria gerada em compute: geometria escrita pela GPU (`PointCloudGeometry`, `SurfaceGeometry`), corpos de
  partículas desenhados lendo o pool.
- Defeitos corrigidos: slot liberado de pool de partículas continuava simulado (agora bitset de vivos, `pool_live`); a
  busca de vizinhança recriada reaproveitava bind groups de buffers destruídos (agora discriminador com geração).
- Busca de vizinhança otimizada (antecipada da F5/015): `particles/64k` 17 → 74 fps. MSAA 4× antecipado da F4/011.

### 009

- Pontos de extensão `transform`, `camera`, `surface`, `space`, `field`, `material`, `emit`: funções WGSL do usuário
  como Resources, compostas no lugar da pronta, validadas na criação.
- Limites: `space` deforma só as `ParametricSurface`, nas coordenadas locais (cena inteira na 019); projeção não linear
  da câmera por vértice e só no forward de triângulos; campo no rígido sem torque; empuxo só em corpos com densidade.
  **Superado na 011**: a função `material` com `StandardMaterial` só e o modelo de luz só com a cor base e a emissão —
  a 011 trouxe o fechamento de espalhamento (Cook-Torrance, `4046c88e`).
- Guardas de não finitos: infinitos descartados; NaN depende do compilador.

### 010

- Superfícies paramétricas completas: colisor derivado da superfície (altura ou distância com sinal, por passo fixo),
  geometria diferencial no material, malha adaptativa sem frestas com desenho indireto. XPBD, FEM e emissores passaram a
  colidir com os colliders.
- Limites: `Transform` animado entra no colisor com um quadro de atraso; escala não uniforme aproximada pela menor
  escala; até 16 superfícies colidíveis por estágio; a superfície não recebe impulso; corpos mais rápidos que a grade
  podem atravessar; dobras no modo altura ficam com a altura máxima.
- Domínio aberto: `ParticleMaterial({ bounds: 'open' })`. Hidrodinâmica do respingo: `surfaceTension` e
  `contactAngle` derivam coesão, adesão e arrasto; partículas secundárias (`DiffuseParticles`).
  **Superado na 034**: a cobertura da água vista pela luz no forward (o `WaterFlow` e a composição por cópia da tela
  saíram, `7116382a`).

### 030

- Coesão (Akinci) e adesão às fronteiras no SPH e no PBF, pelo `ParticleMaterial`; viscosidade do MPM fluido.
- Limites: sem reação no corpo rígido (P7); a fronteira tratada como localmente plana na escala do suporte; a coesão
  age só dentro do mesmo solver (P7).

### 017

- Superfície de fluido contínua a partir das partículas, com óptica e cáusticas; PBF com o passo estável do material
  (`pbfStableDt`); viscosidade do SPH corrigida (÷ρ_i); `World.attach`/`detach` recompõem entidades vivas.
- **Superado na 033 e na 034**: a água por espaço de tela (`FluidSurfaceMaterial`, `WaterFlow`, `CausticsFlow` por
  splat) deu lugar ao campo de distância (033) e à água vista pela refração traçada, com a aparência do grafo e as
  cáusticas por fótons (034, `7116382a`, `2f710aff`); as ondulações procedurais viraram o nó `surface.ripple`
  (`2bc003f6`); a reflexão do ambiente vem do `EnvironmentMap` e do céu.

### 031

- Contrato de shader estruturado (recursos declarados pelos módulos, ligações atribuídas pela montagem, globais
  implícitos rejeitados, constantes com fonte única, pontos de cena com contribuições) e grafos de nós de ponto e de
  conjunto, com sub-grafos, serialização e registro. Pendências abertas: N1–N3 e N6 (§3).

### 033

- Estrutura de raios na GPU (`RayScene` + `RaySceneFlow`), céu físico, luz rebatida por sondas, névoa em froxels e a
  água como superfície contínua por campo de distância (`FluidField`). Orçamento no fechamento: GI 3,7 ms a
  1280 × 720; névoa 0,70 ms; água a 64 mil 2,3 ms. Na 034 a medida passou a ser por perfil do `Renderer` (039 SC-009);
  o estado da GI é o da 034 T059.
