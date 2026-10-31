# Implementation Plan: 039 refeita — água em tempo real com trabalho fixo por pixel

**Branch**: `feature/039-tracado-em-ondas` | **Date**: 2026-10-29 | **Spec**: [spec.md](spec.md)

## Summary

Refazer o caminho da luz dos transmissivos (água e vidro) com trabalho fixo por pixel, o primeiro acerto da água pela
rasterização de uma malha extraída na GPU, e as otimizações do Particles4All que se aplicam ao motor (vizinhança por
intervalos contíguos, malha compacta com desenho indireto, medição por passe). O material continua fora dos kernels de
traçado, numa onda de tamanho fixo por estágio. A ordem segue o custo medido no tanque (`baseline.md`): refração
92,5 ms → cáusticas 22,8 ms → primeiro acerto e campo → física.

## Technical Context

- **Language/Version**: TypeScript 5 (strict), WGSL; WebGPU (Chrome/Dawn, Deno/wgpu).
- **Testing**: vitest (composição de kernels e unidade); smokes de GPU no Chrome headless; a cena do tanque no app.
- **Target**: M4 (piso) e RTX 4090; 1280×720 a 60 Hz no tanque (SC-001).
- **Constraints**: regra dura da GPU (todo laço com teto); nada na CPU; adaptativo pelo adaptador; Resource + evento +
  Flow; critérios e fixtures sem afrouxar.

## Decisões técnicas

### D1 — A cadeia fixa por pixel (substitui a árvore de caminhos)

Cada pixel da fila de refração percorre estágios fixos; cada estágio é: o acerto de um raio por pixel (BVH + marcha do
campo, sem material) → a onda (uma entrada por pixel: tamanho fixo = pixels pedidos) → o material por classe → a
continuação. Estágios:

1. **Câmera**: o acerto da câmera (para a água, a entrada vem do raster quando D3 estiver pronta).
2. **Reflexão da 1ª interface**: um raio refletido, traçado até o primeiro opaco ou o ambiente (o acerto sombreado
   como hoje: luz direta, cáusticas, indireta).
3. **Transmissão**: até `REFRACTION_CHAIN` interfaces (8) em linha: em cada interface o lobo pela roleta de Fresnel
   (sem viés; o filtro temporal já existe), a pilha de meios e a absorção analítica pelo comprimento; reflexão interna
   total segue a reflexão. A borda que não muda o meio segue reto.
4. **Dispersão**: na saída de um meio que dispersa, o caminho abre três canais (três raios finais fixos); antes dela, o
   caminho é de um canal só.
5. **Fim**: o opaco ou o ambiente.

Por pixel: no máximo 1 + 1 + 8 + 3 acertos, cada um um despacho de tela; o estado por pixel é pequeno (a origem, a
direção, o peso, a pilha de meios, a radiância somada). Nenhuma fila, nenhuma vaga, nenhuma folha, nenhuma ordenação. O
número de despachos por quadro é fixo.

### D2 — A onda por estágio

`RayWave` com capacidade = pixels da fila (cresce pelo pedido); um estágio usa a onda inteira. Os kernels de material por
classe e o substituto das constantes como hoje.

### D3 — A malha da superfície e o raster

`FluidSurfaceMesh` (Resource): tetraedros marchantes por voxel dos blocos ocupados do campo atual; vértice em 8 bytes
(posição de 16 bits por eixo na caixa do campo, normal octaédrica de 8+8 bits); contagem atômica e argumentos do desenho
indireto escritos na GPU; estouro sinalizado num contador lido de forma assíncrona → evento → a capacidade cresce.
Desenhada no alvo da água (profundidade e normal) no lugar do pedido por marcha; a câmera dentro da água pelo verso.

### D4 — Cáusticas

Medir por kernel; aplicar a mesma regra: nenhum fóton paga a marcha mais de uma vez por rebote; a transmitância pelo
meio homogêneo é analítica pelo comprimento.

### D5 — Física

A busca de vizinhos do PBF por 9 intervalos contíguos sobre as partículas reordenadas pela célula a cada subpasso.

### D6 — Medição

O profiling por passe que já existe (`setFrameProfiling`, `takeFrameTimings`) ligado pelo app; os tempos dos passes de
compute por estágio no `baseline.md` a cada passo. No Apple, os passes de render se sobrepõem: o quadro inteiro pelo
intervalo do primeiro início ao último fim.

## Constitution Check

- Resource + evento + Flow: a malha é Resource, o estouro é evento, cada estágio é Flow ou passe de um Flow.
- Nada na CPU: a malha, a contagem e os argumentos na GPU.
- Regra dura: os laços da cadeia têm teto (`REFRACTION_CHAIN`, os passos da marcha, o laço da BVH).
- Sem afrouxar: os critérios atuais; a cena que o orçamento fixo não cobre vai ao usuário com a medida.

## Project Structure

- `src/elements/lighting/refraction/` — `RefractionFlow.ts` (a cadeia fixa), `refraction_chain.wgsl` (novo), o que
  sai: `refraction_wave.wgsl`, a fila de caminhos, a ordenação das folhas.
- `src/elements/fields/` — `FluidSurfaceMesh.ts`, `FluidSurfaceMeshFlow.ts`, `field_mesh.wgsl` (novos).
- `src/presentation/flows/RefractionVolumeRequestFlow.ts` — pelo raster da malha.
- `src/elements/physics/` — a busca de vizinhos.

## Emenda 2026-10-30 — o renderizador e o espaço de trabalho gerenciado

Ver a emenda na [spec](spec.md) (US7–US9, FR-010–FR-019, SC-007–SC-011). Ordem: as peças da C2 primeiro (sem elas a
migração repetiria o desvio), depois o `Renderer`, o espaço de trabalho do desenho, a Opção B e os perfis, e por fim o
espaço de trabalho da simulação e da cena.

### D7 — O `Renderer` (C3)

- `src/elements/render/Renderer.ts`: uma `Entity` com o dado da configuração (descritor uniforme `settings`) e os
  Resources de trabalho do desenho como componentes (`.add`): `ToneMapping`, `TemporalAntialiasing`, `TemporalFilter`
  (os de hoje, mesmos schemas), `RefractionWork` (o `Refraction` sem a autoria) e `CausticsWork` (o `Caustics` sem a
  autoria). A C4 acrescenta o `FrameTargets` na composição dos estágios padrão (a C3 não importa a C4; a C4 já importa
  a C3).
- Fachada: `quality: 'high' | 'medium' | 'low'` e os valores por grupo — `lightPaths.transmission` (o `maxInterfaces`),
  `caustics.{photons, cellSize, rate: 'frame' | 'step', average}`, `tracing.{continuation, checkerboard}`, e o
  antisserrilhado, o filtro temporal e a saída que hoje vivem nos Resources avulsos. Os perfis preenchem os valores
  (alto = o atual; médio = teto 4 e 16 384 fótons; baixo = teto 3, sem cáusticas) e o valor explícito vence o perfil.
- A troca de um valor muda o dado do `Renderer`; os componentes de trabalho se redescrevem (crescem e encolhem) no
  `framePrepare` do Flow dono, pela C2.
- `app.defaults.renderer` substitui `refraction`, `antialiasing`, `temporalFilter` e `presentation`; o `Caustics`
  inserido pela presença de transmissivo passa a ser o `CausticsWork` do renderizador.
- Por cena (um singleton). O renderizador por alvo de render (014) reaproveita a forma: um `Renderer` por alvo, com os
  componentes de trabalho dele.

### D8 — O que a C2 já tem e a única peça nova

Revisão de 2026-10-31 (o usuário apontou que a arquitetura já previa os Flows sobre os pools dos corpos; a primeira
versão desta emenda inventava peças que já existem):

- **Por entidade — o pool do corpo (existe).** Os Flows de física recebem os pools pelos slots (`bodies`, `pool`,
  `pools`; `bodyType` e `FlowDescriptor` roteiam o algoritmo). Um Resource com vários descritores em pool ocupa o mesmo
  slot em todos (`ResourceSystem`), então o trabalho por partícula ou por corpo é um descritor de pool a mais do Resource
  do corpo: `role: 'storage-rw'`, `upload: 'never'`, `allocation: 'onDemand'` (alocado quando o Flow pede por
  `ensurePoolAllocated`), crescendo 2× com cópia na GPU e `poolReallocated`, as faixas livres reaproveitadas
  (`FreeRanges`). Precedente: `partials` e `energy` do `SoftBody`.
- **Por domínio, configuração ou tela — descritores próprios com `reserve` (existe).** O Resource dono declara os
  descritores com `count`; o Flow pede a capacidade (`reserve`) e a redescrição realoca o que mudou de forma, nos dois
  sentidos (`reallocateOwn` libera e aloca no tamanho novo), emitindo `bindGroupReplaced`. Precedente: `FluidField`. Os
  buffers pela tela seguem o tamanho do alvo pelo mesmo `reserve` (o Flow já reage ao `canvasReconfigured`); as texturas,
  por `sizeFromCanvas`.
- **Leitura — `ResourceSystem.read` (existe).** A leitura sob demanda da spec 007 (lote por tarefa, uma cópia por faixa,
  desempacotada pelo schema). Falta só expô-la no `ResourceDirectory` que os Flows recebem e medir o custo a cada quadro;
  se o staging criado por leitura pesar, ele passa a ser reaproveitado dentro do próprio `read`.
- **A peça nova — uniforme por região (FR-014).** `GPUDescriptor.regions = { count }` num `uniform` próprio: a C2 aloca
  `count × stride` (alinhado ao `minUniformBufferOffsetAlignment` do adaptador), envia as regiões alteradas e entrega a
  fonte com `dynamic: { stride }` (o `ResolvedSource` já aceita); a reserva é a redescrição. É a lacuna real: o pool
  recusa `uniform`, e hoje o `PerStepUniforms` e o `FrameUniforms` criam o buffer fora da C2.

### D9 — Os auxiliares como provedores de descritores

Cada auxiliar ganha `static descriptors(prefix, capacidade…)` (os `GPUDescriptor` de que precisa) e `attach(slot ou
diretório, resource)` (as fontes alocadas pela C2), e perde o `core.create`. O Resource dono inclui os descritores em
`getDescriptors()` e se redescreve quando a capacidade muda — o mecanismo da D8, sem peça nova. O que o auxiliar faz
por elemento do pool (os arrays por partícula da `NeighborSearchPipeline`, os donos do `ColliderSet`) vai como
descritor de pool do corpo; o que é do domínio (as células da vizinhança, os níveis do `PrefixSum`), como descritor
próprio com `count`. `PerStepUniforms`/`FrameUniforms` viram usuários da peça de uniformes por região.

### D10 — O espaço de trabalho do desenho

| Flow                       | Dono                              | O que migra                                                                                                                                                 |
| -------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RefractionFlow`           | `RefractionWork`                  | cadeia, dispersão adiada, cabeçalho, argumentos (capacidade pela fila lida); blocos e carimbos (`reserve` pelo alvo); a onda; a contagem da fila por `read` |
| `CausticsFlow`             | `CausticsWork`                    | alvos, instâncias capazes, fótons, fila, argumentos, a onda (pela configuração, nos dois sentidos)                                                          |
| `ProbeFlow`                | `GlobalIllumination`              | raios, gerações, radiância, visibilidade, trabalho de tela (`reserve` pelo alvo), a onda                                                                    |
| `FluidFieldFlow`           | `FluidField`                      | o trabalho por partícula e por bloco (já tem `reserve`), a grade, a onda, o volume, os colisores                                                            |
| `RaySceneFlow`             | `RayScene`                        | o rascunho da BVH e a ordenação (já tem `reserve`)                                                                                                          |
| `PostFlow`                 | `FrameTargets`                    | as texturas de ida e volta (`sizeFromCanvas`) e os parâmetros                                                                                               |
| `ForwardFlow`/`ShadowFlow` | `Renderer` (grupos de desenho)    | os argumentos indiretos por grupo (contagem de grupos por redescrição)                                                                                      |
| `ParticleFlow`/`UIFlow`    | `Renderer` / a fonte da interface | parâmetros, regiões por desenho, o atlas da fonte                                                                                                           |

### D11 — A Opção B

- **B3 (cáusticas)**: o `CausticsFlow` refaz os fótons só no quadro com passo da física ou com mudança da cena (luzes,
  instâncias, configuração — eventos e dado do `Renderer`); a média móvel do hash pelo `caustics.average` do perfil.
- **B1 (continuação)**: `tracing.continuation` limita as rodadas por quadro (3); as vagas vivas no fim do quadro
  seguem no seguinte (a raiz de um pixel só nasce quando a cadeia dele terminou); o resultado de um caminho que termina
  depois sai com o carimbo do quadro em que nasceu e o filtro temporal o reprojeta como já faz com os blocos.
- **B2 (xadrez)**: `tracing.checkerboard` traça os blocos 2×2 de uma paridade por quadro; a reconstrução usa os
  carimbos dos blocos (já existem) e a reprojeção pelo movimento, com a rejeição do histórico onde a superfície mudou.
- Cada peça medida sozinha (tanque congelado e com a física; câmera parada e girando) antes de entrar num perfil.

### D12 — O espaço de trabalho da simulação e da cena

Pelo mecanismo que a arquitetura já tinha para os Flows de física (D8), sem peça nova:

| Flow                                                 | Por entidade (pool do corpo, mesmo slot)                                                        | Por domínio (descritor próprio com `reserve`)                                       |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `PBFFlow` / `SPHFlow`                                | `delta`, `normal`, `boundary` no `ParticleBody` (hoje fixos em `NEIGHBOR_SEARCH_MAX_PARTICLES`) | —                                                                                   |
| `NeighborSearchPipeline`                             | ids de célula, ordem, posições ordenadas, contagem e lista de vizinhos por partícula            | contagem, início e cursor das células, pelo `ParticlePhysics` da grade              |
| `DiffuseFlow`                                        | o trabalho por partícula difusa no pool dela                                                    | a grade                                                                             |
| `MPMFlow`                                            | —                                                                                               | a grade, no Resource do domínio do MPM (como o `FluidField`)                        |
| `LCPFlow`                                            | os proxies por corpo                                                                            | pares candidatos, contatos, contadores e argumentos; os contadores lidos por `read` |
| `ColliderSet`                                        | os donos por colisor, nos pools dos colisores                                                   | as contagens (região uniforme)                                                      |
| `SoftSurfaceFlow` / `SurfaceColliderFlow`            | as faces e o SDF assado no Resource do corpo ou do colisor (`onDemand`)                         | —                                                                                   |
| `TransformFlow` / `CameraFlow`                       | os elos e as listas por função no pool do `Transform` e da câmera                               | —                                                                                   |
| `ShadowMatrixFlow` / `SurfaceFlow` / nós de conjunto | o trabalho por superfície no Resource dela                                                      | os parâmetros (regiões uniformes)                                                   |

Os parâmetros por passo de todos esses Flows vão pela peça de uniformes por região, no Resource do slot que o Flow
atende.

### D13 — A regra

`no-restricted-syntax` no ESLint contra `core.create` (e `ctx.core.create`) em `src/elements/**` e
`src/presentation/**`, com um teste que conta os sites (zero); a constituição já exige (Princípio III).

### Constitution Check da emenda

- Princípio III: a emenda é a correção — toda alocação pelo `ResourceSystem`, pelos pools e descritores que ele já
  tem; uma peça nova (uniforme por região).
- Princípio I: o `Renderer` na C3; a C4 o compõe com o `FrameTargets`; nenhuma importação nova da C1.
- Princípio II: a fachada do `Renderer` fala em caminhos de luz, fótons e perfis; o layout fica nos descritores.
- Sem afrouxar: os critérios atuais; o SC-001/SC-002 substituídos pela medida por perfil por decisão do usuário.
