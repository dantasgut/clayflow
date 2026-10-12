# Research: Núcleo de shaders

**Spec**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Data**: 2026-10-11

Levantamento do código em `develop` após a 004 (`bee40f7`). Achados (A) descrevem o estado atual; decisões (R)
fixam a abordagem, com alternativas rejeitadas.

---

## Achados

### A1 — Composição de WGSL por colagem

Todo shader é um `.wgsl` inteiro ou um array de imports `?raw` unido por `'\n'` / `+ '\n' +`:
`NeighborSearchPipeline.ts:268-270,315,398,428,457`, `SPHFlow.ts:73-113,209-245`, `PBFFlow.ts:80-135,232-282`,
`MPMFlow.ts:83-110,158-230` (base definida **duas vezes**, idêntica), `FEMFlow.ts:72-129`, `XPBDFlow.ts:78-171`,
`LCPFlow.ts:40-101` (6 constantes de módulo), `TransformFlow.ts:25-31`. Materiais, sombra, pós e UI passam o arquivo
cru (`StandardMaterial.ts:40`, `ShadowFlow.ts:303`, `PostFlow.ts:141`, `UiGpuPipeline.ts:150`). Cada Flow monta o
mesmo texto duas vezes (em `getPipelineDescriptors()` e na criação dos kernels). Não há substituição de marcadores
nem constantes injetadas; `override` constants existem no contrato (`ComputePipelineSpec.constants`) e ninguém usa.
O único portador de WGSL na C1 é `ShaderModuleSpec.source` (`core/contracts/specs/ShaderModuleSpec.ts:9`); a
identidade é o hash memorizado da 004 (`specHash.ts`, `{"$spec":hash}` para specs aninhadas).

### A2 — Structs duplicados TS↔WGSL e offsets à mão

- 22 arquivos em `wgsl/structs/`; 10 espelham um `StructSchema` (com o comentário "casa byte-a-byte"), 12 **não têm
  schema** (`SimParams`, `FEMSimParams`, `MPMSimParams`, `SPHSimParams`, `PBFSimParams`, `RBSimParams`, `NsSimParams`,
  `NsScanLevel`, `RBContact`, `RBContactCounter`/`RBWarmEntry`/`RBBodyDelta`/`RBBodyCorrection`, `MPMGridNode`, além
  dos órfãos `ContactManifold` e `FEMElement`).
- Structs fora de `structs/`: `forward.wgsl` redefine `Camera`, `WorldTransform`, `StandardMaterial` (espelhos de
  schemas) e `ShadowParams` (96 B, sem schema); `shadow_depth.wgsl` redefine `WorldTransform` e um **outro**
  `ShadowParams`; `ShadowMap.ts` tem um schema que não corresponde a nenhum dos dois; `NarrowphaseParams` e
  `TransformParams` vivem dentro de kernels.
- Offsets à mão: os seis `*_BYTE_SIZE` dos Flows de física (XPBD aloca 64 para 48 reais, FEM 96 para 80), os
  `fillParams` com índices numéricos (`u32[13] = contact_stamp`, `u32[15] = 16` no SPH/PBF…), tamanhos de `RBContact`
  e dos structs atômicos no `LCPFlow.ts:106-116`, leitura de volta por `LCP_BODY_STRIDE_F32 = 40`, `NsSimParams`,
  `NsScanLevel`, `TransformParams`, `ShadowParams` do forward e da sombra, `EffectParams`, `ScreenParams`, `UiQuad`.
  Camera e Material no forward já usam `schema.pack` (bom).
- `StructSchema`: layout equivalente ao de storage para os tipos atuais; **sem** regras de uniform (stride de array e
  alinhamento de struct aninhado em 16), sem arrays, structs aninhados, atômicos; `toWGSL()` emite `u16`/`i16`
  (inválidos em WGSL), não aceita nome WGSL distinto do nome do pool (os schemas de corpo se chamam `LCPSchema`,
  `SPHSchema`… — o struct precisa se chamar `RigidBody`, `SPHParticle`…) e só é chamado em testes. `u16`/`i16` não
  são usados por nenhum schema do código.

### A3 — Matemática duplicada

- `mat3_det`/`mat3_transpose`/`mat3_mul` em `math/mat.wgsl`, `math/linalg.wgsl` e `math/shape_matching.wgsl`;
  `mat3_inverse`/`mat3_from_cols` em `mat` e `linalg`.
- `W_poly6` em 3 kernels PBF e `grad_W_spiky` em 3, fora de `sph_kernels.wgsl`. As cópias são **idênticas**, exceto
  por comentários (verificado por diff) — a consolidação é bit a bit.
- `ColorRange` com dois layouts (`fem_solve`, `distance_solve_color`); `JACOBI_FIXED_SCALE` em dois kernels; o
  acumulador em ponto fixo do Jacobi (escala 1e6) repete o do LCP (2²⁰, `rb_to_fixed`/`rb_from_fixed`).
- Não existe nenhuma função de cor ou iluminação: `forward.wgsl:92` faz Lambert inline
  (`0.18 + n·l × 0.82 × sombra`), `effects.wgsl` faz exposição e gama inline nos pontos de entrada. Não há ruído.
- A duplicação TS↔WGSL de `quat_to_mat4` citada no roadmap não existe mais (a 003 compõe o `Transform` na GPU); a
  matemática de câmera e sombra em CPU (`FpsController`, `FlyController`, `OrbitController`, `ShadowFlow`) pertence à
  composição de câmera e à migração do forward/sombra (006/F2).

### A4 — Algoritmos paralelos embutidos

- Soma de prefixos em vários níveis (Hillis–Steele por grupo de 256 + subida/topo/descida) embutida na busca de
  vizinhança: `ns_scan_local`, `ns_scan_groups`, `ns_scan_combine`, orquestrada em `NeighborSearchPipeline.ts:227-300`.
- Alocação atômica com excedente embutida na narrowphase (`rb_narrowphase.wgsl:134-142`); acumulação em ponto fixo
  embutida no solve e na correção do LCP (`rb_solve_lcp.wgsl:44-49,185-192`, `rb_contact_accumulate.wgsl:16-23`,
  `rb_lcp_commit.wgsl:38-40`).
- Coloração de grafo só em CPU, gulosa e serial (`elements/gpu/GraphColorSolver.ts`), exportada e sem consumidor.
- Não há ordenação nem redução na GPU.

### A5 — WGSL do legado sem uso (23 arquivos)

Kernels `rb_solve`, `rb_solve_velocity`, `rb_velocity_recovery`, `rb_substep_update`, `rb_update_colliders`,
`rb_sync_transform`, `collision`, `fem_solve`, `fem_collision`, `fem_vertex_write`, `mpm_vertex_write`,
`vertex_write`, `distance_solve_color`, `distance_solve_jacobi`, `jacobi_apply`, `shape_match_transform`,
`shape_correct`; math `linalg`, `fem_kinematics`, `fem_xpbd`, `shape_matching`; structs `contact_manifold`,
`fem_element`. Portados sem adaptação (a única mudança foi o índice linear da 004). Dependem do `ColliderDesc` único de
160 B que não existe mais (`rb_update_colliders`, `fem_collision`, `collision` — não compilam), do UBO por objeto
(`rb_sync_transform`), de vertex intercalado de 8 floats (`*_vertex_write`) e de estado de um corpo só
(`shape_match_transform`); `rb_solve`, `rb_solve_velocity` e `shape_match_transform` são laços numa thread. Achados
colaterais: o `XPBDRigidSchema` é exportado e nenhum Flow o consome (sem solver rígido XPBD); o XPBD não colide com
colliders; o FEM só integra gravidade.

### A6 — Documento de arquitetura (D5)

Linhas de `clay-engine-doc/docs/guides/architecture_resource_loaders.md` (5 469 linhas):

| #   | Inconsistência                      | Onde                                                                                    | Código hoje                                                                                       |
| --- | ----------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 1   | Modelo de transição de estado       | L1415, L1445 × L1641, L1793, L1817-1818, L2222, L3116-3140, L3519 (L1828 correto)       | `Resource.state` enum; só `ResourceSystem.transition()` muda, valida e lança                      |
| 2   | Exemplos com API antiga por `id`    | L1122-1124, L1770-1785, L2023, L2045-2051, L2061, L924-951                              | `create(spec): spec`; identidade = hash da spec + `discriminator`; `id` de descritor é nome local |
| 3   | `pack` listado após remoção         | L2081, L3884 (removido em L2021, L2041, L2219, L5445)                                   | `Resource` sem `pack`; só `Schema.pack`                                                           |
| 4   | "Dev não escreve Flows" × público   | L3733-3735 × L1553, L2229, L2537, L2757                                                 | `Flow`/`FlowRegistry` exportados                                                                  |
| 5   | `register(factory)` × instância     | L1538-1540, L2117, L2229, L2307, L4638-4652                                             | `register(flow)`, `override(bodyType, flow)`                                                      |
| 6   | `add(stage,{before/after})` × ordem | L2232 × L1554, L1578, L2306, L3162, L4379, L4947                                        | fases fixas → `priority` desc → registro; `resolve` devolve o último registrado                   |
| 7   | `Scene.add` → `this` × `EntityId`   | L1403, L2282, L2326, L3973-3977 × L4100-4101 (e `SceneHandle` em L2226)                 | `Entity.add(): this` só anexa filho; `Scene.addEntity(): EntityId` insere                         |
| 8   | Pool `Renderable` não definido      | L4260, L4540, L4567; ausente da tabela de pools L1983-2008 (que também omite Transform) | `Renderable` é interface privada do `ForwardFlow`                                                 |
| 9   | Material `individual` × pool key    | L1328, L1985 × L2613 (as linhas do roadmap estão desatualizadas)                        | materiais individuais, UBO por entidade no forward                                                |
| 10  | Ponte partículas → geometria        | L2207, L2720, L2940-2972, L1993-1998                                                    | `PointCloudGeometry` e emissores isolados, sem pipeline nem ligação                               |

Seção de shaders: L2063-2065 ("`{{struct:X}}` substituído pelo `LayoutInferencer` a partir de `consumes`")
contradiz L2798-2803 ("não há `WgslComposer`; `shaderSource` carrega o fonte completo"); L2775-2796 fala em
`#include` ou concatenação; L3776-3778 usa `RB_PROLOGUE + predictWGSL`.

### A7 — Física que nunca rodou (gravação das fixtures, 2026-10-11)

Ao gravar `trajectories`, as cenas de SPH, PBF e MPM terminaram com as posições iniciais exatas, e a corrente XPBD
caiu em queda livre (y ≈ −68 m depois de 4 s). Causas:

- `sph_collision.wgsl`, `pbf_collision.wgsl` e `mpm_grid_update.wgsl` declaram `array<ColliderDesc>` — o struct único
  de 160 B do legado, substituído pelos pools tipados (`PlaneCollider`, `BoxCollider`, `SphereCollider`,
  `MeshCollider`). A compilação falha (`unresolved type 'ColliderDesc'`), o pipeline fica inválido e o WebGPU invalida
  o command buffer inteiro do quadro: **nenhum passe do fluido executa**. O erro só aparece como `engineError`
  (com `captureErrors`), que nenhum smoke escutava. A correção da 004 ("SPH/PBF nunca simulavam") tratou os buffers da
  vizinhança e não percebeu isto, porque nada conferia movimento.
- `DEFAULT_FLOW_FACTORIES` cria `new XPBDFlow(c, w, r)` sem `constraintPoolKey`; o kernel de distância nunca é criado.
- Os mapas `collider → corpo dono` só existem dentro do `LCPFlow` (`rebuildBodyOwners`), então nenhum outro estágio
  consegue saber a pose de um collider dinâmico.

### A8 — Solvers de fluido incoerentes (depois de corrigir a colisão, 2026-10-11)

Com a colisão corrigida (R17), os fluidos executam pela primeira vez:

- **PBF** (`pbf_density_lambda`, `pbf_position_correct`): densidade ρ = Σ W com massa 1 implícita contra ρ₀ = 1000 e
  h = 0,1 — ρ estimada na ordem de 10⁹, C = ρ/ρ₀ − 1 enorme, λ explode, NaN em todas as partículas.
- **SPH** (`sph_density`, `sph_forces`): spline cúbica com suporte 2h = 0,2, mas a busca de vizinhança usa células de
  0,1 (núcleo truncado à metade do suporte); massa fixa 0,01 kg (coerente só com espaçamento ≈ 2,2 cm, que a
  fachada não permite informar); rigidez k₀ = 1000, γ = 7 ⇒ velocidade do som ≈ 2,6 m/s, no limite do CFL com
  1 substep. Resultado caótico (7 m de desvio entre execuções).
- **MPM**: massa e volume por partícula lidos de `pos.w`/`vel.w`, que o `FluidBody` deixa em 0 (o fluido não se
  move); `F` zerado na fachada (deveria ser identidade); `material_id` sempre 0 (o "fluido" é simulado como sólido
  elástico); μ = λ = 10³ fixos; 1 substep de 1/60 s sem verificação de estabilidade.
- Não existe parâmetro de material para partículas: cada Flow tem constantes fixas e a fachada não expõe densidade,
  espaçamento nem rigidez.

### A9 — Defeitos encontrados ao fazer os fluidos e o XPBD funcionarem (2026-10-11)

Com o smoke `trajectories` conferindo critérios físicos (T086/T099), a depuração encontrou, além de A7/A8:

- **MPM — origem da grade ignorada**: `mpm_p2g`/`mpm_g2p` calculavam o índice de grade por `pos · inv_dx`, sem
  subtrair `grid_origin`, mas reconstruíam a posição do nó somando a origem: com origem ≠ 0 o deslocamento
  partícula → nó era de metros e o J explodia (10²³) já no primeiro passo.
- **MPM — fronteira de collider na grade**: impor a condição só nos nós dentro do collider não segura paredes de
  ~2 células (dentro da parede a face mais próxima passa a ser a de fora e a normal inverte) — o fluido atravessava
  paredes e chão. Decisão: condição de deslizamento nos nós a até uma célula da superfície, e salvaguarda das partículas
  com raio 0 (projetar com raio maior move partículas sem atualizar o J e compacta o fluido). Limitação de
  resolução: a fronteira efetiva fica a até uma célula da superfície do collider.
- **PBF — expoente do `s_corr` gravado como inteiro** num campo `f32` (`u32[8] = 4`): lido como denormal 5,6·10⁻⁴⁵,
  zerado pela GPU ⇒ `pow(0, 0)` = NaN em todo vizinho fora do suporte.
- **PBF — XSPH e vorticidade sem m/ρ₀**: a correção de velocidade ficava ~8000× forte (19 600 m/s no 1º passo).
- **PBF — restrição bilateral**: na superfície livre ρ < ρ₀ fazia λ atrair partículas (aglomeração e jatos de 11 m/s).
  Decisão: C = max(ρ/ρ₀ − 1, 0) (unilateral, prática padrão).
- **PBF — colisão fora do laço do solver**: projeções de densidade empurravam partículas para dentro das paredes e a
  colisão única depois do laço convertia o deslocamento em velocidade. Decisão: colisão dentro do laço.
- **PBF — corrida de dados**: `position_correct`, `xsph` e `vorticity` gravavam a posição/velocidade da própria
  partícula no mesmo passe em que os vizinhos as liam (resultado não determinístico). Decisão: correções num buffer de
  deltas, aplicadas em passes próprios; ω num passe, confinamento + XSPH no seguinte.
- **Vizinhança não determinística**: a ordem dos vizinhos vinha do espalhamento por contador atômico nas células;
  as somas dos solvers mudavam entre execuções (SPH: 1,2 m de desvio). Decisão: `ns_find` grava a lista de vizinhos de
  cada partícula ordenada por índice (vetor local de até 128; `MAX_NEIGHBORS` validado) — SPH e PBF bit a bit.
- **Colisão de partícula com raio 0**: as partículas assentavam exatamente na superfície e, com paredes apoiadas no
  chão, escapavam pela fronteira comum (distância 0, sem contato). Decisão: partícula de SPH/PBF colide como esfera de
  raio s/2.
- **XPBD — predição de partícula fixa**: `predict` pulava partículas com massa infinita sem copiar `pos` para
  `pred`, e as restrições liam `pred` na origem (o 1º elo media 1,45 m após um passo) — mesmo defeito do `pos_pred`
  do LCP na 004. Decisão: partícula fixa recebe `pred = pos` no kernel, e a fachada inicia `pred` com a posição.
- **XPBD — convergência**: 1 substep × 4 iterações de Gauss-Seidel deixava a corrente de 31 elos esticar 20–45%.
  Decisão: padrão de 8 substeps × 1 iteração ("Small Steps", Macklin 2019) — estiramento ≤ 3%.

Resultado (T092): as sete cenas passam nos critérios físicos e são determinísticas bit a bit entre execuções.

---

## Decisões

### R1 — Módulo WGSL como valor imutável com dependências por referência

**Decisão**: `WgslModule` é um objeto congelado `{ name, source, requires, structs }` criado por `wgslModule({...})`
na C2 (`scene/shaders/`). `requires` lista **referências** a outros módulos (não nomes), e `structs` lista os
`StructSchema` cujos structs o módulo usa. Não há registro global: a montagem percorre o grafo a partir do módulo de
entrada. O `name` é usado nas mensagens e para detectar dois módulos distintos com o mesmo nome no mesmo grafo.

**Por quê**: referências são verificadas pelo compilador TS, sobrevivem à minificação (FR de build), são detectáveis
pelo `knip` quando mortas e não exigem estado global (várias `Application` na mesma página — smoke `multiApp`). Um
registro por nome exigiria ordem de registro, isolamento por app e erros só em tempo de execução.

**Alternativas rejeitadas**: registro global por nome (estado global, ordem de import, minificação); `#include` por
texto pré-processado (parser próprio, erros tardios); ferramenta de build (`wgsl-linker`, naga) — dependência nova e
fora da regra de deps mínimas.

**Ajuste na spec**: FR-001 passa a dizer "dependências por referência a outros módulos (o nome identifica o módulo nas
mensagens)" — mesma garantia, verificada pelo tipo.

### R2 — Montagem: ordem topológica, deduplicação e detecção de símbolos

**Decisão**: `composeWgsl(entry)` faz DFS pós-ordem determinística (ordem de `requires` preservada), incluindo cada
módulo uma vez; ciclo → `WgslCycleError` com o caminho (`A → B → A`). Um varredor léxico (sem parser completo)
remove comentários (`//`, `/* */` aninhados) e extrai os símbolos de nível superior: `fn`, `struct`, `const`,
`override`, `alias`, `var` (privado, workgroup e com `@group/@binding`). Símbolo definido por dois módulos →
`WgslSymbolConflictError` (símbolo + módulos). Os structs dos schemas declarados (R4) são emitidos uma vez cada, no
início, em ordem de primeira declaração. O resultado é memorizado por módulo de entrada (`WeakMap`) e devolvido como o
**mesmo** objeto `ShaderModuleSpec` congelado — o hash da 004 é calculado uma vez e a deduplicação de pipelines é
preservada.

**Por quê**: WGSL não exige declaração antes do uso no escopo de módulo, então a ordem serve só ao determinismo e à
leitura. Um varredor de nível superior é suficiente para detectar conflitos (corpo de função não precisa ser
entendido) e é testável em CPU.

**Alternativas rejeitadas**: deduplicar por texto idêntico (esconderia redefinições divergentes); renomear símbolos
automaticamente (mangling quebra depuração e o contrato de nomes de entry point).

### R3 — Validação de referências substituída

**Decisão**: `validateWgslReferences` (regex de funções não definidas, `scene/flows/validateWgslReferences.ts`) passa
a rodar sobre o resultado da montagem, com a lista de símbolos que o varredor já extraiu; a cópia de
`createComputeKernel` em `GpuEngineCore.compute()` (usada só pelo smoke `limits`) é removida e o smoke passa a usar
`createComputeKernel`. `ComputeKernelOptions.shaderSource: string` é substituído por `shader: WgslModule` nos
contratos de C2 (`createComputeKernel`, `PipelineDescriptor`), de modo que nenhum estágio entregue texto montado à
mão (FR-004/SC-001). A C1 continua recebendo só `ShaderModuleSpec.source` (C1 não conhece módulos).

### R4 — Structs gerados do `StructSchema`

**Decisão**:

- `StructSchema` ganha `wgslName` (padrão: `name`) — corpos usam `wgslName: 'RigidBody'`, `'SPHParticle'`… com o pool
  key inalterado.
- Novos tipos de campo: `FieldType.atomicU32`/`atomicI32` (4 B, só storage), arrays de tamanho fixo
  (`FieldType.array(elem, n)`), struct aninhado (`FieldType.struct(schema)`) e array de tamanho em execução como
  último campo (`FieldType.runtimeArray(elem)`, só storage).
- `addressSpace: 'storage' | 'uniform'` (padrão `storage`). Em `uniform`, stride de array e alinhamento/tamanho de
  struct aninhado arredondados para 16; atômicos e array em execução → erro na criação. O mesmo layout alimenta
  `pack`, `offsetOf` e `toWGSL`, então empacotamento e WGSL concordam por construção.
- `toWGSL()` gera tipos WGSL válidos (forma curta `vec3f`, `mat4x4f`, `atomic<u32>`, `array<T, N>`), com o
  `wgslName`. `u16`/`i16` saem do `FieldType` (nenhum schema os usa; o `vertexLayout` já os rejeita) — o enum fica só
  com tipos representáveis em WGSL host-shareable.
- Marcadores `{{struct:Nome}}` no fonte de um módulo declaram uso explícito: a montagem exige que `Nome` seja o
  `wgslName` de um schema em `structs` do próprio módulo ou de uma dependência (senão `WgslStructMarkerError`), remove
  o marcador e garante que o struct seja emitido uma vez. O struct também é emitido sem marcador se o schema estiver em
  `structs` (o marcador é a forma documentada da refundação; `structs` é a forma tipada).
- `packInto(view, byteOffset, data)` empacota sem alocar (usado pelo `PerStepUniforms`); `pack` passa a usá-lo.

**Fora da geração**: structs de entrada/saída de estágio (`VsIn`/`VsOut` com `@location`/`@builtin`) e structs
locais de função (com `bool`) não são dados de buffer: ficam no módulo de entrada que os usa, sujeitos à detecção de
conflito.

**Alternativas rejeitadas**: gerar TS a partir de WGSL (inverte a fonte única definida pela refundação: o schema é a
fonte); manter os arquivos e checar consistência em teste (continua duplicado).

### R5 — Schemas para todo dado interno

**Decisão**: cada struct sem schema (A2) ganha um `StructSchema` ao lado do seu dono — parâmetros de simulação em
`elements/physics/schemas/params/` (`SimParamsSchema`, `FEMSimParamsSchema`, `MPMSimParamsSchema`,
`SPHSimParamsSchema`, `PBFSimParamsSchema`, `RBSimParamsSchema`, `NarrowphaseParamsSchema`), contatos e estado do LCP
(`RBContactSchema`, `RBContactCounterSchema`, `RBWarmEntrySchema`, `RBBodyDeltaSchema`, `RBBodyCorrectionSchema`),
`MPMGridNodeSchema`, busca de vizinhança (`NsSimParamsSchema`, `NsScanLevelSchema` — este vira o parâmetro genérico
de nível da soma de prefixos, R8), `TransformParamsSchema`, e na apresentação `ForwardShadowParamsSchema`,
`ShadowDepthParamsSchema`, `EffectParamsSchema`, `ScreenParamsSchema`, `UiQuadSchema`. `PerStepUniforms` recebe o
schema (não `byteSize`) e expõe `write(i, data)` via `packInto`; os `fillParams` passam a montar objetos de campos
nomeados. Leitura de volta usa `schema.offsetOf`. Valores mágicos embutidos (`particle_stride_f32 = 16`,
`s_corr_n = 4`, `fixed_scale = 1e7`, `mu/lambda = 1e3` do MPM) viram campos nomeados com constantes documentadas no
schema/Flow — sem mudar os valores (trajetória bit a bit).

O `ShadowMap.ts` (schema que não corresponde ao WGSL) é alinhado ao struct que a sombra realmente usa; a unificação dos
dois `ShadowParams` com o `ShadowMap` como Resource é da 006.

### R6 — Organização dos módulos

**Decisão**:

- `scene/shaders/` (C2): `WgslModule`, `wgslModule()`, `composeWgsl()`, varredor de símbolos, erros. C3/C4 importam por
  `scene/` (Princípio I).
- `elements/gpu/shaders/` (C3): os módulos de base como arquivos TS que importam o `.wgsl` (`?raw`) e declaram
  `requires`/`structs` — `quat`, `linalg` (álgebra 3×3/4×4: det, inversa, transposta, produto, Frobenius,
  decomposição polar — absorve `math/linalg.wgsl` e as 3×3 de `shape_matching`), `mat` (construção de matrizes: de
  quaternion, de colunas, TRS, inversa rígida; requer `linalg`), `sdf`, `sph_kernels` (ganha `W_poly6`,
  `grad_W_spiky`), `mpm_weights`, `xpbd`, `lcp` (absorve `contact_math` e `impulse`), `fem` (de `fem_kinematics` +
  `fem_xpbd`), `noise`, `color`, `brdf` — os 12 da spec —, mais os módulos de suporte dos kernels genéricos
  `fixed_point` e `atomic_alloc` (R10) e as operações de redução (R11).
- Kernels de estágio viram módulos de entrada ao lado do seu Flow (`elements/physics/shaders/lcp.ts`…), e os shaders de
  render/pós/UI viram módulos de entrada em C3/C4 (`material/shaders/forward.ts`, `presentation/flows/shaders/*.ts`).
- Os `.wgsl` continuam arquivos (realce de sintaxe e diffs legíveis); cada um é importado por exatamente um módulo TS.

### R7 — `color`, `brdf`, `noise`

**Decisão**: `brdf` recebe `lambert_diffuse(n, l)` e `ambient_term` com os coeficientes atuais do forward e
`sample_shadow_pcf` (hoje `sample_shadow` no `forward.wgsl:66`); `color` recebe `tonemap_exposure(c, e)` e
`gamma_encode(c, g)` extraídos de `fs_tonemap` e `fs_color_grading`, e `luminance` (Rec. 709), usada pelo SSAO/FXAA
atuais se a expressão já existir inline — sem mudar a imagem (FR-041: comparação de pixels antes/depois no smoke de
render). PBR completo é da F4. `noise`: hash PCG de 32 bits (`pcg_hash`, `hash2`, `hash3`), ruído de valor 2D/3D e
gradiente (Perlin) 2D/3D com interpolação quíntica, valores de referência calculados em CPU pela mesma fórmula
(teste unitário de referência em TS + smoke GPU comparando dentro de 1e-6).

### R8 — Soma de prefixos genérica

**Decisão**: `PrefixSum` (C3, `elements/gpu/compute/PrefixSum.ts`) generaliza o scan da 004: níveis
`n_{l+1} = ⌈n_l / 256⌉`, subida (`scan_local`), topo num grupo (`scan_top`), descida (`scan_combine`), exclusiva e
inclusiva (inclusiva = exclusiva + elemento, aplicada na descida do nível 0), u32. API:
`new PrefixSum(core, { discriminator, capacity })`, `record(frame, { src, dst, count, mode })`; buffers de níveis
alocados pela capacidade; `count` em uniform por nível (`ScanLevelSchema`). A busca de vizinhança passa a usá-lo e os
`ns_scan_*` desaparecem.

**Alternativas rejeitadas**: decoupled look-back (single-pass) — depende de garantias de progresso entre grupos que o
WebGPU não dá; Blelloch — mesmo custo assintótico, mais barreiras para 256.

### R9 — Ordenação radix

**Decisão**: LSD de 4 bits por passe, 8 passes para u32, chaves com valores u32. Por passe: (1) histograma por grupo
de 256 (16 contadores por grupo, layout dígito-maior: `hist[d × grupos + g]`); (2) `PrefixSum` exclusiva sobre o
histograma inteiro — dá a base global de cada (dígito, grupo); (3) espalhamento estável: dentro do grupo, o posto de
cada elemento entre os de mesmo dígito vem de 16 somas de prefixo de flags em memória de workgroup (uma por dígito,
256 elementos); saída = base(d, g) + posto. Pingue-pongue entre dois pares de buffers; `bits` configurável (padrão 32)
para chaves menores (cores de grafo usam 8). N = 0 não despacha.

**Por quê**: estável por construção (necessário para ordenar valores associados e para a coloração), reusa a soma de
prefixos, sem atômicos (determinístico). 4 bits mantém o histograma em 16 × grupos (4 M chaves → 16 384 grupos →
262 144 entradas, dentro de um scan de 2 níveis).

**Alternativas rejeitadas**: bitônico (O(n log² n), não estável); 8 bits por passe (histograma 16× maior e posto
local com 256 dígitos).

### R10 — Compactação, alocação atômica e acumulação em ponto fixo

**Decisão**:

- `atomic_alloc` (módulo): `struct AtomicAllocCounter { count, overflow }` (schema) e
  `fn atomic_alloc(counter, capacity) -> u32` que devolve o índice ou `ATOMIC_ALLOC_FULL` e conta o excedente. É a
  peça que a narrowphase do LCP já usa embutida; ela passa a requerer o módulo.
- `Compaction` (C3): passe genérico `predicate → atomic_alloc → escrita`, com o predicado vindo de um módulo
  fornecido pelo consumidor (`fn compact_keep(i: u32) -> bool` e `fn compact_value(i: u32) -> u32`) e saída de índices
  ou valores; capacidade explícita; contagem e excedente legíveis. A ordem da saída não é estável (documentado); quem
  precisa de ordem usa `PrefixSum` sobre flags + scatter (`Compaction` oferece o modo `stable`, que faz exatamente
  isso).
- `fixed_point` (módulo): `fn fixed_from_f32(x, scale) -> i32` e `fn fixed_to_f32(i, scale) -> f32` com saturação
  (`clamp` aos limites de i32) e `fixed_saturated` para diagnosticar; a escala é parâmetro (o LCP mantém 2²⁰ — mesmo
  valor, trajetória bit a bit). `RBBodyDelta`/`RBBodyCorrection` continuam structs atômicos do LCP, gerados de schema,
  usando o módulo.

### R11 — Reduções

**Decisão**: `Reduce` (C3): árvore por grupo de 256 em memória de workgroup + níveis como no scan, até 1 valor;
operação e tipo vêm de um módulo de operação (`reduceOp('sum' | 'min' | 'max', 'u32' | 'i32' | 'f32')`, que define
`alias ReduceT`, `const REDUCE_IDENTITY` e `fn reduce_op`); o kernel genérico requer o módulo de operação escolhido —
cada combinação é um módulo memorizado (mesma spec → mesmo pipeline). Soma f32 tem ordem de soma diferente da CPU:
tolerância relativa `1e-5 × log2(N)` documentada no contrato.

**Sobre `linalg` × `mat`** (R6): `linalg` faz álgebra (det, inversa, produto…), `mat` constrói matrizes e requer
`linalg` — cada função num único lugar.

### R12 — Coloração de grafo na GPU

**Decisão**: Jones–Plassmann sobre o grafo de arestas sem materializá-lo. Entrada: arestas `(a, b)` u32. Por rodada
`r`: (1) limpa `vmax[v]`; (2) cada aresta sem cor faz `atomicMax(vmax[a], p)` e `atomicMax(vmax[b], p)` com prioridade
`p = (pcg_hash(i ^ semente_r) & 0xFFFFF000) | (i & 0xFFF)`-desempatada por índice (única por aresta na rodada); (3) a
aresta cujo `p` vence em ambos os vértices recebe cor `r`. Cada rodada colore um emparelhamento maximal local; o
número de cores fica ≤ 2Δ − 1 na prática e é limitado por `maxColors` (padrão 2Δ, Δ = grau máximo calculado na GPU
por `Reduce` max sobre os graus). Termina quando o contador de não coloridas chega a 0 (lido de volta a cada lote de
rodadas — coloração é feita na criação ou na mudança de topologia, não por quadro, então é assíncrona:
`color(edges): Promise<GraphColoring>`). Depois, a ordenação radix (8 bits, chave = cor, valor = índice da aresta)
agrupa as arestas por cor, e um histograma + `PrefixSum` dá os intervalos `{ offset, count }` por cor
(`ColorRangeSchema` — o struct único que substitui os dois `ColorRange`). Laços (`a == b`) são rejeitados na criação;
arestas repetidas recebem cores distintas; vértices isolados não participam.

O `GraphColorSolver` em CPU (sem consumidor) é removido: a coloração do motor é a da GPU (nota de migração). Os
testes verificam a validade da coloração (nenhuma cor com arestas adjacentes), não a igualdade com um algoritmo.

**Alternativas rejeitadas**: guloso em CPU na criação (serial, O(E·Δ), e duplicaria a capacidade); coloração de
vértices do grafo de linha materializado (memória O(E·Δ)).

### R13 — Verificação de órfãos e de duplicação no gate

**Decisão**: dois testes Vitest em CPU (rodam em `test:coverage`, portanto no gate):

- `wgslInventory.test.ts`: todo `.wgsl` em `src/` é importado por exatamente um módulo TS (`?raw`); falha listando os
  órfãos.
- `wgslSymbols.test.ts`: aplica o varredor de símbolos (R2) a todos os `.wgsl` e falha se uma `fn` (ou `struct`,
  `const`) aparece em mais de um arquivo, exceto pontos de entrada de estágio (`vs_main`, `fs_main`…) e structs de E/S
  de estágio, que só podem colidir entre módulos de entrada que nunca são montados juntos.

Além disso, o smoke `shaderLibrary` compila **todos** os módulos na GPU (cada módulo de base montado com um ponto de
entrada de teste) e roda os valores de referência (FR-018/FR-031).

### R14 — Mesma trajetória: gravação antes, comparação depois

**Decisão**: antes de qualquer mudança de WGSL, um smoke `trajectories` roda cada cena de física (corpos rígidos LCP,
XPBD com restrições, FEM, MPM sólido e fluido, SPH, PBF) por 240 passos com `app.step(1/60)` e grava o estado lido de
volta (posições e velocidades) como fixture (`src/__smokes__/fixtures/trajectories-<perfil>.bin` + JSON de metadados).
Primeiro mede-se o **determinismo entre execuções** no próprio código atual (duas execuções seguidas): cenas
deterministas exigem igualdade bit a bit depois da 005; cenas com soma em ordem variável (SPH/PBF: a vizinhança
espalha por contador atômico, então a ordem dos vizinhos muda entre execuções) usam como tolerância o envelope
observado entre execuções (máximo desvio × 2), registrado na pesquisa durante a implementação. MPM e LCP usam
somas inteiras em ponto fixo (independentes de ordem) e devem ser bit a bit.

### R15 — Documento de arquitetura: definição única por item (D5)

**Decisão** (alinhada ao roadmap §4; o documento marca explicitamente o que é estado atual e o que é alvo da 006/F2):

| #   | Definição única                                                                                                                                                                                                                                                                                                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `Resource.state` é enum público, alterado **só** por `ResourceSystem.transition()`, que valida pela tabela e lança; handlers são internos; `GpuManaged` entra na alocação quando nenhum descritor envia sempre; eventos são emitidos depois da transição e nunca a causam. Remover `currentResourceState` e `enter/exitGpuManagedMode`.                                              |
| 2   | Todos os exemplos com objetos de spec (`create(spec)` devolve a spec; identidade = hash + `discriminator`); `id` de descritor/pipeline é nome local de binding, não identidade de GPU.                                                                                                                                                                                               |
| 3   | Membros do `Resource`: `state`, `data`, `getDescriptors()`, `getPipelineDescriptors()`, `getFlowDescriptors?()`; empacotamento é do `Schema`.                                                                                                                                                                                                                                        |
| 4   | `Flow` é API pública do nível N3 (algoritmo novo, roadmap §4.4); níveis N0–N2 não escrevem Flows; os Flows do motor seguem o mesmo contrato.                                                                                                                                                                                                                                         |
| 5   | Alvo (006): `register(factory, { phase, bodyType?, priority? })` + `unregister`; estado atual (até a 006): `register(flow)` com `phase`/`priority`/`bodyType` declarados no Flow e `override(bodyType, flow)`. Uma única seção descreve os dois, marcados.                                                                                                                           |
| 6   | Ordem: fases fixas (física → transformação → sombra → forward → pós → UI), dentro da fase `priority` decrescente, empate pela ordem de registro; sem `before/after/at`. `resolve(bodyType)` devolve o Flow de maior `priority` (empate: o último registrado) — o código é corrigido nesta spec (hoje devolve o último registrado; contradiz o próprio documento e a regra de ordem). |
| 7   | `Entity.add(child): this` anexa filho (encadeável); `Scene.add(entity): this` insere no World (encadeável); `Scene.addEntity(entity): EntityId` insere e devolve o id. O código é corrigido nesta spec: hoje `scene.add` herdado anexa sem inserir (armadilha silenciosa).                                                                                                           |
| 8   | Pool `Renderable` definido como alvo da F2 (instancing): struct `{ geometry, materialSlot, transformSlot }` preenchido pela C2 para cada entidade com Geometry + Material + Transform; desenho agrupado por (geometria, pipeline) com instâncias/indireto. Tabela de pools completada (Transform, Camera, Material, Renderable), com status.                                         |
| 9   | Alvo (006): Material em pool por schema (`storage: 'pool'`, key = `schema.name`), referenciado por `materialSlot`; Camera continua individual (uma por câmera). Estado atual (até a 006): material individual com UBO por entidade. L1328/L1985 marcados como estado atual.                                                                                                          |
| 10  | Ponte (F2): uma geometria declara um pool de origem (`PointCloudGeometry({ source })`); o estágio de vértice lê posições direto do slot do pool por `instance_index` (buffer polivalente storage/vertex), sem cópia; kernel de sincronização só quando o layout difere. Emissores e corpos de partículas seguem a mesma regra.                                                       |

Seção de shaders reescrita com o modelo entregue (módulos, `requires`, deduplicação por símbolo, structs gerados,
`{{struct:X}}`, kernels genéricos), removendo L2798-2803 e o `#include`; a resolução de `consumes` fica marcada como
alvo da 006. As correções 6 e 7 tocam código (pequenas, com teste) porque o documento não pode descrever como correto
um comportamento que contradiz a regra que ele mesmo define.

### R16 — Desempenho

**Decisão**: a montagem roda na criação e é memorizada (R2); nenhum custo por quadro. Riscos medidos: (a) a busca de
vizinhança e o LCP com os kernels genéricos — os smokes `limits` e `rigidContacts` comparam tempo por quadro com a 004
(8,2 ms / 223,7 ms no perfil de referência); (b) o empacotamento por schema (`packInto` com objeto de campos) nos
`fillParams` por iteração — custo de CPU medido pelo `bench:check`. Se `packInto` com objeto pesar, o schema oferece
`fieldView(view, offset)` com setters por campo pré-compilados (decidido na implementação pela medição).

### R17 — Conjunto de colliders compartilhado e colisão dos fluidos

**Decisão**:

- `ColliderSet` (C3, `elements/physics/colliders/ColliderSet.ts`): mantém, para cada pool de collider (`PlaneCollider`,
  `BoxCollider`, `SphereCollider`, `MeshCollider`), o buffer do pool, o mapa de dono (slot no pool `LCPSchema`, ou
  `0xFFFFFFFF` para estático) e a contagem; reconstrói os mapas quando um pool de collider ou de corpo é realocado ou
  quando entidades saem; cria buffers mínimos para pools ausentes (bindings sempre válidos); `generation` muda quando
  os buffers mudam (os consumidores refazem bind groups). O `LCPFlow` passa a usá-lo no lugar de
  `rebuildBodyOwners`/`ensureBodyOwnersBuffer` (a lógica de dono existe num lugar só).
- Grupo de binding 2 = conjunto de colliders para os consumidores de colisão de fluido: `b0` uniform `ColliderSetCounts`
  (plano, caixa, esfera), `b1–b3` pools, `b4–b6` mapas de dono, `b7` pool `RigidBody` (pose dos donos). O
  `mpm_grid_update` passa de grupo 3 para 2 (o grupo 2 atual liga partículas que o shader não usa).
- Fonte WGSL `collider_set.wgsl` (vira módulo na US1): declara os bindings do grupo 2 e oferece
  `collider_set_push_out(p, v, radius, restitution)` (SPH/PBF: empurra para fora pela normal do SDF e reflete a
  componente normal da velocidade, como o kernel legado pretendia) e `collider_set_constrain(p, v)` (MPM: remove a
  componente normal entrante da velocidade do nó, como o `grid_update` pretendia). Pose do collider: dono dinâmico →
  `pos_pred`/`rot_pred` do corpo + centro local rotacionado; sem dono → centro como posição de mundo, rotação
  identidade (igual à narrowphase). SDF e gradiente pelo módulo `sdf`. `MeshCollider` sem contato (igual ao LCP).
- `DEFAULT_FLOW_FACTORIES`: XPBD com `constraintPoolKey: DistanceConstraint.schema.name`.
- O smoke `trajectories` passa a reprovar cena parada, valores não finitos ou `engineError`, e confere critérios
  físicos por cena antes de gravar (SC-010).

**Alternativas rejeitadas**: tirar a colisão dos fluidos até a F5 (o usuário decidiu corrigir na 005); copiar o código
de mapa de dono do LCP para cada fluido (duplicação que esta spec existe para eliminar).

### R18 — Fluidos coerentes: `ParticleMaterial` e solvers corrigidos

**Decisão**:

- **`ParticleMaterial`** (C3, `elements/physics/materials/ParticleMaterial.ts`, exportado na fachada): Resource
  singleton por World (como o `GravityField`), vocabulário de domínio — `restDensity` (kg/m³, 1000),
  `particleSpacing` (m, 0,05), `viscosity` (0,01), `speedOfSound` (m/s, 10), `restitution` (0,2), `youngModulus`
  (Pa, 5·10⁴), `poissonRatio` (0,3), `domainMin`/`domainMax` (m, ±2). Validação na construção (valores > 0,
  Poisson em [0, 0,5), domínio não vazio). Grandezas derivadas puras (testadas em CPU): massa da partícula
  m = ρ₀ s³, volume s³, h do SPH = 1,3 s (spline cúbica, suporte 2h), h do PBF = 2 s (poly6/spiky, suporte h), célula
  do MPM = 2 s (8 partículas por célula), módulo volumétrico K = ρ₀ c², Lamé μ/λ de E e ν, passo estável por
  algoritmo (SPH: 0,4 h / c; MPM: 0,3 dx / max(c, √((λ+2μ)/ρ₀)); PBF: 1 substep, estável por construção).
  Sem `ParticleMaterial` no World, os Flows usam os padrões.
- **Substeps pelo passo estável**: cada Flow de fluido usa `substeps = max(configurado, ⌈stepDt / dtEstável⌉)`; os
  parâmetros por iteração já são por região (004), então o número variável de iterações não muda o mecanismo.
- **Grade da vizinhança pelo material**: célula = raio de suporte (SPH 2h, PBF h), origem e dimensões pelo domínio;
  a busca de vizinhança é recriada quando o material muda.
- **SPH**: massa do material; Tait com k₀ = ρ₀ c² / γ (γ = 7); vizinhos no suporte inteiro.
- **PBF** (Macklin & Müller 2013): ρ = m Σ W; ∇C = (m/ρ₀) ∇W; Δp = (m/ρ₀) Σ(λᵢ + λⱼ + s_corr) ∇W; `s_corr` com
  n = 4, Δq = 0,2 h e k na escala de λ (λ tem unidade de m²: k = 10⁻⁴ (s/0,05)²; o 0,1 do artigo é de outro sistema
  de unidades e dominaria λ); ε de relaxação como parâmetro nomeado; demais correções em A9.
- **MPM** (MLS-MPM): massa e volume do material (uniform), não da partícula; `material_id` pelo tipo de corpo —
  fluido: P Fᵀ = K J (J − 1) I e F reiniciado para J^{1/3} I (sem cisalhamento acumulado); elástico: neo-Hookean com
  μ/λ do material.
- **Fachadas**: `FluidBody({ algorithm: 'MPM' })` cria F = I; `SoftBody` ganha `algorithm: 'MPM'` (sólido MPM pela
  fachada, F = I), em vez de dados crus.
- **Critérios físicos** no smoke `trajectories` (antes de gravar): sem NaN; partículas dentro do domínio e acima do
  chão (y ≥ −s/2); fluido assentado (velocidade média < 0,25 m/s após 4 s) e altura média abaixo da inicial; SPH com
  densidade média das partículas internas dentro de ±15% de ρ₀.

**Alternativas rejeitadas**: parâmetros por Flow (opções do construtor) — ficam fora do World e da fachada, e duas
cenas com materiais diferentes exigiriam Flows diferentes; massa por partícula no struct — muda o layout de todas as
partículas sem necessidade enquanto um fluido tem um único material (corpos como contêineres de partículas com
material próprio são da F2/F5, roadmap §3.1).
