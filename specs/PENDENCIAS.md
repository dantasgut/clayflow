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

| #   | Pendência                                         | Estado atual (evidência)                                                                                                                                                                                                          | Fase     |
| --- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| P1  | FEM sem solve elástico                            | `FEMFlow` roda só `fem_predict` e `fem_velocity_update` — integra gravidade (`elements/physics/shaders/fem.ts`). As funções de FEM já estão em `wgslLib.fem`                                                                      | F5 (016) |
| P2  | `MeshCollider` não gera contatos — parcial        | 010: superfícies paramétricas colidem (`SurfaceCollider`: altura ou distância com sinal, todos os solvers e emissores); `rb_narrowphase_mesh_main` ainda não emite contato com malha arbitrária, e os fluidos não colidem com ela | F5 (015) |
| P3  | ~~Campos de força ignorados~~ — resolvida na 009  | Ponto `field`: os seis solvers e os emissores somam gravidade pontual, vento, vórtice, arrasto, empuxo e as `FieldFunction` do usuário (sem torque no rígido)                                                                     | F3 (009) |
| P4  | `JointConstraint` e `SpringConstraint` sem solver | Nenhum Flow nem kernel os consome; só `DistanceConstraint` (XPBD) é resolvida                                                                                                                                                     | F5 (015) |
| P5  | `XPBDRigidSchema` sem Flow                        | Ausente de `DEFAULT_SOLVER_REGISTRATIONS` (`elements/physics/flows/defaultFlows.ts`); nenhum solver o simula                                                                                                                      | F5 (015) |
| P6  | Emissores de partículas sem simulação — parcial   | 009: `ComputeParticleEmitter` simulado na GPU (`EmitterFlow`: criação por forma ou `EmitFunction`, campos, vida, nuvem de pontos); faltam o `ScriptedParticleEmitter` (CPU), ordenação, soft particles e flipbooks                | F9 (025) |
| P7  | Sem acoplamento entre solvers                     | Cada solver reage só aos colliders do `ColliderSet`: fluido não empurra rígido, rígido não interage com macio, MPM e SPH/PBF não se veem                                                                                          | F5       |
| P8  | Corpo rígido só com esfera e caixa                | `RigidBody` aceita `shape: 'sphere' \| 'box'` (`elements/physics/bodies/RigidBody.ts`); sem cápsula, convexo ou SDF                                                                                                               | F5 (015) |
| P9  | Sem consultas espaciais                           | Não há raycast, shapecast nem character controller                                                                                                                                                                                | F5 (018) |
| P10 | ~~Sem superfície de fluido~~ — resolvida na 017   | `FluidSurfaceMaterial`: água contínua em espaço de tela (`FluidSurfaceFlow`, `WaterFlow`) com cáusticas (`CausticsFlow`); a água por altura fica na 029                                                                           | F5 (017) |

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

### Notas da 009

- Pontos de extensão: `transform`, `camera`, `surface`, `space`, `field`, `material`, `emit` — funções WGSL do usuário
  como Resources, compostas no lugar da pronta, validadas na criação e conferidas pelo compilador; sem funções, as
  fixtures continuam bit a bit.
- Limites: `space` deforma só as `ParametricSurface`, nas coordenadas locais (cena inteira, luz e sombra na 019);
  projeção não linear da câmera é por vértice (triângulos grandes não se curvam) e só no forward de triângulos (os
  sprites e o arame seguem a `viewProjection`); a função `material` só vale com `StandardMaterial`, e o modelo de luz
  usa só a cor base e a emissão (Cook-Torrance na 011); campo no rígido sem torque; empuxo só em corpos com densidade
  (fluidos de partículas e MPM).
- Guardas de não finitos: infinitos são descartados; NaN depende do compilador (matemática rápida pode não
  preservá-lo).
- Funções de cena (`field`, `space`) recompilam os estágios que as usam a cada mudança do conjunto ou do código;
  composição que não compila num kernel volta ao pronto daquele kernel.

### Notas da 010

- Superfícies paramétricas completas: colisor derivado da superfície (`SurfaceCollider`, altura ou distância com
  sinal, construído na GPU por passo fixo — mesmo estado a 30/60/144 Hz), geometria diferencial no material
  (`SurfaceSample.metric`/`curvature`/`principal`), malha adaptativa sem frestas com desenho indireto e normais da
  `ParametricGeometry` de CPU por derivadas. Sem superfícies colidíveis, todas as fixtures bit a bit.
- XPBD, FEM e emissores passaram a colidir com os colliders (antes não colidiam com nada).
- Limites: `Transform` animado por função entra no colisor com um quadro de atraso (o mundo vem do quadro anterior);
  escala não uniforme aproxima a distância pela menor escala; até 16 superfícies colidíveis por estágio (inícios dos
  campos no uniforme de contagens); a superfície não recebe impulso (unilateral); corpos mais rápidos que a grade
  podem atravessar, como com paredes finas; dobras no modo altura ficam com a altura máxima; quadros com mais passos
  que as cópias do colisor (`steps`, padrão 4) repetem a última.
- Limite de 10 storage buffers por estágio no perfil de referência: os donos de caixa e esfera do grupo de colliders
  viraram um mapa só.
- Folga de contato padrão 0: uma folga de 1 cm deixava os corpos pairando sobre a superfície e se apertando entre si
  (pilha mista de esferas e caixas explodia no vale).
- Malha adaptativa: sem `indirect-first-instance`, nível máximo (evento `adaptiveUnavailable`); costura dos domínios
  periódicos com a precisão de sen/cos de 2π (sub-micrométrica).
- A cena do lago mostrou que, sem coesão, respingos passam por cima da borda do terreno (fisicamente coerente); com a
  água de referência (030) o lago assenta.
- Defeito encontrado e corrigido (feedback do usuário: "respingos parecem artificiais"): o forward decidia se um ponto
  está sob a água pelo texel mais próximo da profundidade da água vista pela luz — cada gota isolada marcava o chão com
  o quadrado do seu texel. Agora a cobertura é interpolada entre os 4 texels (como o PCF da sombra); dentro da água o
  resultado é o de antes, as bordas ficam suaves (fixtures `fluidSurface-*` regravadas: só pixels de borda da água).
- Domínio aberto (feedback do usuário: "se o objetivo é testar o terreno, precisamos de parede?"): os limites do domínio
  do `ParticleMaterial` eram paredes (chão e lados mínimos, com adesão; bordas da grade no MPM) — respingos ficavam
  presos no ar. `ParticleMaterial({ bounds: 'open' })`: a caixa só limita o cálculo; nada colide nem adere aos planos
  do domínio, e a partícula que sai por baixo ou pelos lados é retirada (parada muito abaixo da cena, fora da grade de
  vizinhos, do enquadramento da água e da imagem). Padrão `'walls'`: as cenas de antes, bit a bit.
- Hidrodinâmica do respingo (feedback do usuário: "a hidrodinâmica do espirro e as gotas escorrendo estão imprecisas";
  "não quero apenas renderização"): a água de referência da 030 (coesão 3, adesão 8, adimensionais) é ~250–350× mais
  grudenta que a água real a 2,5 cm. `ParticleMaterial({ surfaceTension, contactAngle })` deriva coesão = γ/(ρ s² g),
  adesão = coesão·(1 + cos θ) e o arrasto tangencial na parede μ/(ρ s²); `ParticleMaterial.WATER` traz os valores da
  água. O detalhe menor que o espaçamento vem das partículas secundárias (`DiffuseParticles`, Ihmsen et al. 2012):
  spray balístico com arrasto do ar, espuma levada pela superfície, bolhas com empuxo. Limite: a geração lê o estado do
  fluido no fim do quadro, então a quantidade de spray depende um pouco da taxa de quadros (a dinâmica do fluido não).

### Notas da 030

- Coesão (tensão superficial de Akinci) e adesão às fronteiras no SPH e no PBF, pelo `ParticleMaterial`
  (`cohesion`, `adhesion`, `xsph`); com zero, trajetórias idênticas bit a bit. Viscosidade do MPM fluido resolvida
  (fixtures `particles-mpm-fluid`, `fluidSurface-mpm` e a trajetória MPM fluido regravadas).
- A adesão age sobre a fronteira genérica `ColliderHit` (domínio e colliders plano/caixa/esfera). Limites: sem reação
  no corpo rígido (acoplamento, P7 — F5/015–016); colliders de malha não recebem adesão até gerarem contato (P2); a
  fronteira é tratada como localmente plana na escala do suporte (cantos vivos aproximados).
- A coesão age entre todos os corpos do mesmo solver (o material é um por cena); entre solvers, não (P7).
- Sem coesão, o PBF sem gravidade se dispersa (o termo anti-aglomeração `s_corr` só repele) — comportamento anterior,
  mantido.

### Notas da 017

- Superfície de fluido (P10): resolvida — água contínua a partir das partículas, com óptica e cáusticas num estágio que
  consome uma superfície genérica (a 029 reusa). `particles/64k-water`: +1,6 ms de GPU sobre os sprites; barragem de
  36 864 partículas com água e cáusticas: 9,3 ms de GPU por quadro em 1280×720.
- Defeito encontrado e corrigido: o PBF rodava 1 substep fixo e explodia abaixo de 5 cm de espaçamento; agora o passo
  estável vem do material (`pbfStableDt`), sem mudar as trajetórias de 5 cm.
- Defeito encontrado e corrigido (feedback do usuário: "água grossa"): a viscosidade do SPH entrava na aceleração sem
  ÷ρ_i — ~1000× a do material (mel no lugar de água); trajetória de SPH e imagem `particles-sph` regravadas. O MPM
  recebia `viscosity` mas nenhum kernel a lia — resolvido na 030 (tensão viscosa pela matriz afim do APIC).
- Ondulações capilares procedurais no material de água: a rede fina das cáusticas (a simulação a 2,5 cm só faz ondas
  grandes).
- Capacidade nova da C2: `World.attach`/`detach` recompõem entidades vivas (troca de material sem recriar o corpo).
- Limites: só a luz direcional que projeta sombra gera cáusticas (spot e pontuais quando tiverem sombra, F4/013); a
  reflexão usa a cor refletida do material (IBL na F4); água atrás de água soma à espessura, sem refração própria.

### Notas da 031

- Contrato de shader estruturado: recursos declarados pelos módulos (`wgslResource`), ligações atribuídas pela
  montagem (nenhum `@group/@binding` à mão: `manual-binding`), globais implícitos rejeitados
  (`unresolved-reference`), ligação pela identidade do recurso (sem `consumes` nem nomes em texto), gravação por
  `groupsOf`/`bindTo` (sem índices de grupo nos estágios), limites do device conferidos, constantes com fonte única
  (`sharedConstant`), instanciação por token no lugar de regex, pontos de cena com contribuições (a sombra e a água
  chegam ao forward por `light_visibility`/`light_transmission`), registros tipados por forma no lugar do registro de
  bits da 009. Fixtures de imagem e trajetória sem regravar.
- Grafos de nós: de ponto (fundidos numa função, hospedados nas funções da 009 por `{ graph }`/`setGraph`) e de
  conjunto (`SetGraph` + `GraphFlow`, contagens na GPU, `GraphGeometry`), sub-grafos, serialização e registro.

### Pendências novas (levantadas na 031)

| #   | Pendência                                                  | Estado atual (evidência)                                                                                                                                                                                                                                                                                                                                                                                                                            | Fase     |
| --- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| N1  | Alias por alvo em grafos de ponto fundidos                 | `fusePoint` (`scene/graph/compileSetGraph.ts`) emite `alias <paramsAlias do alvo> = <struct>` e o recurso `<fn>_params` pelo alvo e pela entrada: um kernel com duas entradas de ponto do mesmo alvo (ou dois grafos fundidos com o mesmo alias) daria `symbol-conflict`. Hoje cada kernel da biblioteca tem uma entrada de ponto; falta o sufixo por entrada (instanciação por token)                                                              | F8 (032) |
| N2  | Alvo de saída que aparece depois da criação                | O `GraphFlow` acha o alvo (`GraphGeometry`) da entidade só ao começar a acompanhá-la (`track`), e os nós de saída leem `ctx.target` em `create`: uma geometria acrescentada depois (`World.attach`) só é vista quando a entidade entra de novo no conjunto do slot (`entitiesChanged` com ela em `added`) — `setGraph` e valores novos reconstroem com o alvo já guardado. Sem alvo, `set.meshOutput`/`set.pointsOutput` não gravam nada, sem aviso | F8 (032) |
| N3  | Limite das contagens da GPU é pré-condição                 | Contagens decididas na GPU não voltam à CPU, então não são conferidas: os nós limitam pela capacidade do plano (o excedente é descartado ou contado, como o `overflow` da `Compaction`); `Compaction` estável exige contagem ≤ `inputCapacity`; a `GraphGeometry` é dimensionada pelo usuário (vértices além da capacidade não são copiados). Uma contagem acima da capacidade não gera erro, só resultado truncado                                 | F8 (032) |
| N4  | ~~Sprites de corpos de partículas fora dos pontos de luz~~ | **Resolvida na 031**: `particle_sprite` lê a luz pelo ponto de cena `scene_any_light_direction` (primeira luz viva, contribuição de toda `Light`); o `ParticleFlow` não conhece o pool de luzes                                                                                                                                                                                                                                                     | ✅ 031   |
| N5  | ~~"Produzido no quadro" ainda privado da água~~            | **Resolvida na 031**: estado genérico da C2 — o produtor marca `ctx.produced(resource, descId, …)` (um produtor por descritor) e os leitores consultam `ResourceDirectory.isProduced`; a água usa `WaterSurface.producedDescriptor`                                                                                                                                                                                                                 | ✅ 031   |
| N6  | Tipos de porta da biblioteca não exportados                | `MESH`, `POINTS`, `U32S`, `MeshTriangleSchema`, `SetPointSchema` (`elements/nodes/set/schemas.ts`) não saem pelo pacote: um nó de conjunto escrito fora do motor precisa do caminho interno para ligar nas portas da biblioteca                                                                                                                                                                                                                     | F8 (032) |
| N7  | ~~Comentários de código com a forma antiga~~               | **Resolvida na 031**: doc-comments atualizados para recursos declarados e fornecedores; o campo morto `FlowBindingErrorDetails.consumes` saiu                                                                                                                                                                                                                                                                                                       | ✅ 031   |
| N8  | ~~Profundidade de projeção na convenção do OpenGL~~        | **Resolvida na 031**: `camera_perspective` e `camera_orthographic` (`math/camera.wgsl`) mapeiam `near` a 0 e `far` a 1, a convenção do WebGPU (antes [-1, 1]: o que ficava entre `near` e cerca de 2× `near` sumia na perspectiva, e a metade de perto de [near, far] na ortográfica). A água e a sombra leem a profundidade pela matriz e não mudaram; fixtures de imagem regravadas com justificativa                                             | —        |

### Notas da 033

- Estrutura de raios na GPU (`RayScene` + `RaySceneFlow`): malhas, superfícies, grafos, corpos moles e as esferas dos
  sprites pelo mesmo `ray_scene_hit`; os volumes pelos pontos de cena `ray_volume_hit`/`ray_volume_transmittance`.
- Céu físico (`Sky`), luz rebatida por sondas de tela e do mundo, cáusticas por fótons (`GlobalIllumination`), névoa
  em froxels (`FogVolume`) e a água como superfície contínua por campo de distância (`FluidField`); o hemisfério sai
  com a GI. A C2 ganhou o `canvasDivisor`, o `ensurePool`, a composição das funções de ponto por entidade num kernel
  e o realocamento dos descritores próprios no `redescribe`.
- Orçamento: GI 3,7 ms a 1280 × 720 no bench `global-illumination` (o `switch` com índice dinâmico em `gi_cascade`
  derrubava a ocupação; passe de profundidade no `ForwardFlow`). Névoa 0,70 ms; água a 64 mil 2,3 ms.

### Pendências novas (levantadas na 033)

| #   | Pendência                                             | Estado atual (evidência)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Fase     |
| --- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| H1  | ~~Tempo de GPU por quadro no Apple~~                  | **Resolvida na 034**: a leitura de GPU é entregue uma vez por quadro medido (anel de 4 stagings, `gpuFrame`, `droppedFrames`) e os smokes esperam a GPU antes de cada quadro medido (`untilReady`) — a média contava a mesma leitura várias vezes e a fila crescia; nada específico do Metal. Com a medida correta o `fluidSurface` fica em 16,0 ms (orçamento 16,7)                                                                                                                                         | F10      |
| H2  | Resolvedor de consumidor ausente cai em silêncio      | Quando falta o resolvedor de um consumidor na C2, o estágio fica com o pronto sem aviso (achado ao ligar a névoa)                                                                                                                                                                                                                                                                                                                                                                                            | F10      |
| H3  | p95 do quadro de `particles/64k-water` cruza o vsync  | A água por campo custa ~2,2 ms acima dos sprites; o p95 passa a cruzar 16,7 ms em parte dos quadros (a 017 já ficava a 1 ms dele)                                                                                                                                                                                                                                                                                                                                                                            | F5       |
| H4  | ~~Fixtures e checagens divergentes desde a 011~~      | **Resolvida na 034** (bissecção: `5ef1dd4`, o HDR da 011): a cor de limpeza padrão era a cor de tela de antes da 011 escrita como radiância (5× mais clara) — agora convertida para linear; as checagens de `extensionPoints`, `softSurface`, `nodeGraphs` e `parametricSurfaces` liam a tela com limiares da saída sem codificação e passam a medir sem depender da apresentação (ver `specs/034-ray-refraction-debts/causes.md`)                                                                           | F4       |
| H5  | ~~Cáusticas agitadas da 017~~                         | **Resolvida na 034**: medidas na radiância (a apresentação comprimia as razões); a água parada variava pelo ruído de poucos voxels na normal do campo (bissecção: `7c8aa06`) — filtro binomial de φ depois do redistanciamento. Agitada 2,24×/0,55×, parada 3,8 %                                                                                                                                                                                                                                            | F5       |
| H6  | Raios dos acertos sem texturas por derivada           | Nos acertos da estrutura de raios as funções `material` que leem `dpdx`/`fwidth` valem pelas constantes (o compute não tem derivada de tela)                                                                                                                                                                                                                                                                                                                                                                 | F4 (012) |
| H7  | Água por campo a 64 000 partículas acima do orçamento | Com a medida correta (034) o `develop` já gastava 10,2 ms com a água no `fluidField`/`timing` (campo ~5,0, marcha da câmera ~4,7, vista da luz ~0,8; o critério da 033 era ≤ 2,5 ms e nunca foi cumprido — a medição quebrada mostrava 2,97); a refração traçada da 034 soma ~5,6 ms (quadro ~25 ms). Na marcha, não mudaram o custo: 1 leitura por passo, passo mínimo maior, começo pelos blocos ocupados, grade densa no lugar da tabela, pular blocos sem superfície. Investigação na RTX 4090 (usuário) | F5       |

### Pendências novas (levantadas na 007)

| #   | Pendência                                 | Estado atual (evidência)                                                                                                                                                                                                                                   | Fase |
| --- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| G1  | ~~Clip z da câmera em [−1, 1]~~           | **Resolvida na 031** (a mesma que a N8)                                                                                                                                                                                                                    | —    |
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
| Lacunas de simulação P1–P9 e limites E1, E2, E4                                                                               | F5       |

## 5. Ordem do ROADMAP

F1 (004, 005, 006) concluída; F2 (007 — ponte compute↔render; 008 — geometria em compute) bloqueia o resto; F3, F4 e
F5 podem andar em paralelo depois. A F3b (031 — contrato de shader estruturado e grafos de nós) é a fundação da F4, da F5 e
da F8; N1–N3 e N6 vão com a 032; N4, N5, N7 e N8 foram resolvidas na 031. As pendências P1–P5, P7–P9, E1 e E4 são da F5 (P10 resolvida na 017); P6 da F9; G1 resolvida na 031 (a N8); G2 da F4; G3 (débito do p99 da 007) da F10, ao fim das fases programadas. E2, E3 e E5
foram resolvidas na 007 (F2); a geometria em compute, na 008 (F2 concluída).

- ~~**R1 (011) — refração com o fundo pixelado**~~ — **resolvida na 034**: a refração pela estrutura de raios (vidro e água), nítida em qualquer ampliação, com antisserrilhado e dispersão adaptativa (ver `docs/guides/refraction.md`). Texto original: o vidro lê a cópia da cena
  na resolução da tela; quando a refração amplia (esfera como lente), aparecem os pixels e os degraus das bordas. O
  usuário pediu imagem lisa. Decisão (2026-10-17): a correção usa a estrutura de raios da 033 — o raio refratado acha a
  superfície de trás e recalcula o material dela (nítido em qualquer ampliação), com a leitura lisa da cópia (bicúbica,
  sem blocos) e o deslocamento pela profundidade da cena. Primeira tarefa depois do fechamento da 033.
