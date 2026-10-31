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

### D8 — As peças da C2

- **Buffer pela tela (FR-012)**: `GPUDescriptor.bufferShape = { bytesPerElement, canvasDivisor?, padTo? }` para
  `storage-rw`/`storage-ro`/`indirect`: `byteSize = ⌈w/d⌉·⌈h/d⌉·bytesPerElement`, alocado e recriado em
  `resizeCanvasTextures` (que passa a tratar buffers) antes do `FlowBinder`; as ligações refeitas como as das texturas.
- **Leitura de volta (FR-013)**: `GPUDescriptor.readback = { every: 'frame' }` num descritor de buffer: depois do envio
  do quadro, a C2 copia a faixa para um staging interno (anel de dois), mapeia sem bloquear e emite `bufferRead
{ resource, id, bytes }`, entregue aos Flows com slot no Resource (nova transição em `FlowTransitions`); uma leitura em
  voo por descritor.
- **Uniformes por região (FR-014)**: `GPUDescriptor.regions = { count, dynamic: true }` num `uniform`: a C2 aloca
  `count × stride` (alinhado ao `minUniformBufferOffsetAlignment`), envia o dado de cada região alterada e liga com
  offset dinâmico; a reserva é a redescrição com `count` maior (dobra) ou menor.

### D9 — Os auxiliares como provedores de descritores

Cada auxiliar ganha `static descriptors(prefix, capacidade…)` (os `GPUDescriptor` de que precisa) e `attach(slot ou
diretório, resource)` (as fontes alocadas pela C2), e perde o `core.create`. O Resource dono inclui os descritores em
`getDescriptors()` e se redescreve quando a capacidade muda. `PerStepUniforms`/`FrameUniforms` viram usuários da peça
de uniformes por região.

### D10 — O espaço de trabalho do desenho

| Flow                       | Dono                              | O que migra                                                                                                                                             |
| -------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RefractionFlow`           | `RefractionWork`                  | cadeia, dispersão adiada, cabeçalho, argumentos (capacidade pela fila lida); blocos e carimbos (pela tela); a onda; a contagem da fila por `bufferRead` |
| `CausticsFlow`             | `CausticsWork`                    | alvos, instâncias capazes, fótons, fila, argumentos, a onda (pela configuração, nos dois sentidos)                                                      |
| `ProbeFlow`                | `GlobalIllumination`              | raios, gerações, radiância, visibilidade, trabalho de tela (pela tela), a onda                                                                          |
| `FluidFieldFlow`           | `FluidField`                      | o trabalho por partícula e por bloco (já tem `reserve`), a grade, a onda, o volume, os colisores                                                        |
| `RaySceneFlow`             | `RayScene`                        | o rascunho da BVH e a ordenação (já tem `reserve`)                                                                                                      |
| `PostFlow`                 | `FrameTargets`                    | as texturas de ida e volta (`sizeFromCanvas`) e os parâmetros                                                                                           |
| `ForwardFlow`/`ShadowFlow` | `Renderer` (grupos de desenho)    | os argumentos indiretos por grupo (contagem de grupos por redescrição)                                                                                  |
| `ParticleFlow`/`UIFlow`    | `Renderer` / a fonte da interface | parâmetros, regiões por desenho, o atlas da fonte                                                                                                       |

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

LCP (contatos, pares, proxies, contadores lidos por `bufferRead`), PBF/SPH/difusas (`NeighborSearchPipeline` e os
buffers por partícula), MPM (grade), FEM/XPBD/superfícies macias, emissores, colisores de superfície (SDF assado),
transformações e câmeras (listas por função), matriz de sombra, superfícies adaptativas, nós de conjunto do grafo: o
espaço de trabalho no Resource da física de cada corpo ou do componente da cena, pelas peças da D8 e os auxiliares da
D9.

### D13 — A regra

`no-restricted-syntax` no ESLint contra `core.create` (e `ctx.core.create`) em `src/elements/**` e
`src/presentation/**`, com um teste que conta os sites (zero); a constituição já exige (Princípio III).

### Constitution Check da emenda

- Princípio III: a emenda é a correção — toda alocação pelo `ResourceSystem`.
- Princípio I: o `Renderer` na C3; a C4 o compõe com o `FrameTargets`; nenhuma importação nova da C1.
- Princípio II: a fachada do `Renderer` fala em caminhos de luz, fótons e perfis; o layout fica nos descritores.
- Sem afrouxar: os critérios atuais; o SC-001/SC-002 substituídos pela medida por perfil por decisão do usuário.
