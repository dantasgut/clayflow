# Proposta — traçado em ondas (wavefront): material fora dos laços de traçado

**Data**: 2026-10-29 · **Origem**: análise do compilado do Deno (spec 038, US4) · **Estado**: proposta, aguarda
aprovação para virar spec/tarefas.

## Problema

O material nos acertos dos raios é hoje uma única função WGSL gerada, `ray_hit_material`
(`src/elements/raytrace/hitMaterial.ts`, decisão 033 R3): um `switch` com um caso por grafo de material distinto da
cena. Ela é expandida dentro de 7 kernels de traçado, em todos os pontos de chamada:

| Kernel                    | Flow             | Pontos de chamada / laço                                         |
| ------------------------- | ---------------- | ---------------------------------------------------------------- |
| `gi_probe_trace_main`     | `ProbeFlow`      | 1 acerto; rebotes usam o fechamento                              |
| `gi_screen_trace_main`    | `ProbeFlow`      | 1 acerto                                                         |
| `refraction_camera_main`  | `RefractionFlow` | laço de 64 passos                                                |
| `refraction_trace_main`   | `RefractionFlow` | 4 sítios; laços de ramos (`4*count`) × 34 passos × 32 interfaces |
| `caustics_instances_main` | `CausticsFlow`   | 1 por instância                                                  |
| `caustics_targets_main`   | `CausticsFlow`   | nenhum, mas compila o módulo composto                            |
| `caustics_trace_main`     | `CausticsFlow`   | 6 rebotes × canais de dispersão                                  |

Consequências:

- **Não escala.** N grafos × todos os sítios de todos os kernels. Com 3 grafos, `refraction_trace_main` leva 7,1 s
  para compilar no Deno.
- **Todo grafo novo recompila todos os kernels de traçado**, de forma síncrona e no quadro (`materialRevision` →
  `PipelineState` sem `preferAsync`).
- **O compilador da Apple (MSL do naga) quebra essa forma**: queda (segfault), código errado e laço que não termina.
  Os dois primeiros foram comprovados; o terceiro é a causa provável do travamento do tanque no Deno.
- **Pressão de bindings**: cada forma de parâmetros de material é mais um buffer de storage em cada kernel de
  traçado. É o que leva o traçado das sondas da GI a 11 buffers.

## Decisão proposta

Separar **achar o acerto** de **avaliar o material**, como as tabelas de shaders de acerto do traçado por hardware
(DXR/Vulkan) e os traçadores em ondas de produção, só que feito em compute. Os kernels de traçado não contêm
nenhuma função de material.

### Recursos (C2, `elements/raytrace`)

- **`HitQueue`**: registros de acerto, um por raio vivo. Cada registro guarda:
  - o id do raio e a instância;
  - posição, normal, uv e largura (footprint);
  - o índice da função de material e o `fn_slot`;
  - a direção de chegada.
- **`HitClosures`**: o fechamento avaliado por registro, no mesmo índice. É o formato comum lido pela GI, pelas
  cáusticas e pela refração.
- **`MaterialBins`**: contagem por material, deslocamentos (scan) e índices espalhados, mais os argumentos indiretos
  por material.
  - Reusa `Compaction`, `PrefixSum` e `CountToArgs` (`src/elements/gpu/compute/`).

### Kernels

1. **Traçado**: percorre a BVH e grava o `HitQueue`. Não depende dos materiais da cena.
2. **Separação**: conta por índice de material com atômicos, faz o scan sobre os M materiais, espalha os índices e
   grava os argumentos indiretos.
3. **Sombreamento por grafo**: um kernel `hit_shade_<hash>` por grafo distinto, gerado do mesmo módulo `composite`
   que o raster usa. Há também um kernel para as constantes (índice 0).
   - Cada kernel é despachado de forma indireta só sobre os acertos do seu material e grava o `HitClosures`.
   - Ele é compilado uma vez por grafo e compartilhado pelos três consumidores.
4. **Continuação**: é a lógica de cada consumidor que hoje segue a chamada do material: refratar ou refletir, roleta
   de Fresnel, depositar o fóton, sombrear e terminar. Grava o próximo raio (estado do caminho em buffer) ou termina.

O laço de rebotes passa da GPU para **rodadas codificadas pela CPU**: um número fixo de rodadas igual ao orçamento
(interfaces, rebotes), com despacho indireto pela contagem de raios vivos. Rodada sem raio custa só o despacho.

- O orçamento total de passos passa a ser **estrutural**: nenhum laço de GPU atravessa material.
- O laço da BVH continua com o seu teto próprio.

### Por consumidor

| Consumidor              | Forma em ondas                                                                                                                                                  |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cáusticas por instância | fila de acertos sintéticos (centro da BLAS) → sombreamento → `caustics_capable` sobre o fechamento                                                              |
| GI (sondas e tela)      | uma rodada: traçado → separação → sombreamento → continuação (`gi_shade_direct` + rebotes com o fechamento)                                                     |
| Cáusticas (fótons)      | estado do fóton por canal em buffer; até 6 rodadas                                                                                                              |
| Refração (câmera)       | pilha de meios da câmera em rodadas (até 64)                                                                                                                    |
| Refração (pixels)       | cada lobo (reflexão/transmissão nas interfaces 1 e 2, lobo raro) vira um raio na fila com o seu peso; rodadas até `REFRACTION_MAX_INTERFACES`. É a parte maior. |

## Compilação antes de carregar a cena

- **Traçado, separação e continuação** não dependem da cena: são compilados na inicialização do motor.
- **Sombreamento por grafo** e o pipeline de raster de cada grafo são compilados quando o grafo entra no mundo, de
  forma assíncrona (`createComputePipelineAsync` / `createRenderPipelineAsync`, que o `GpuEngineCore` já tem com
  deduplicação por `specHash`).
- **Fase de carga**: a cena é inserida, os Flows declaram os pipelines em `slotsResolved` (não no `framePrepare`),
  e um evento `sceneReady` sai quando todos estão prontos. Só então vem o primeiro quadro visível. Isso se apoia no
  `Engine.whenReady()` existente.
- **Material novo durante o jogo** compila só o kernel pequeno dele, em segundo plano. Até ficar pronto, aquela
  instância usa as constantes do `StandardMaterial`: é o que o caminho do índice 0 já faz, e não exige trocar o
  kernel inteiro.
- **Cache binário entre execuções**: o WebGPU não expõe. O Chrome/Dawn e o serviço de compilação do Metal guardam em
  disco sozinhos; o wgpu só tem `PipelineCache` no Vulkan. Fica como capacidade opcional do `PlatformAdapter`,
  usada onde o ambiente oferecer.
- **C1** não muda. **C2** muda: `PipelineState` assíncrono por padrão, declaração antecipada e o evento de prontidão
  da cena.

## Fases

1. **Fundação**: `HitQueue`, `HitClosures`, `MaterialBins`, a geração do `hit_shade_<hash>` e o Flow que separa e
   sombreia.
   - Testes de composição: nenhum `material_fn_` nos kernels de traçado; um só por kernel de sombreamento.
2. **Cáusticas por instância** na fila (o caso mais simples, valida a fundação).
3. **GI**: sondas e tela.
4. **Cáusticas**: fótons em rodadas.
5. **Refração**: a câmera, depois os pixels com lobos na fila.
6. **Remoção** de `composeHitMaterial`, `rayHitMaterialPoint` e do `switch`.
7. **Fase de carga**: pipelines assíncronos, declaração antecipada e `sceneReady`.
8. **Deno**:
   - primeiro, verificação só de compilação (naga → MSL → `makeLibrary`) dos kernels novos;
   - depois, com a aprovação do usuário, a cena do tanque na GPU e o vídeo.

## Critérios

- **Smokes do Chrome** (GI, cáusticas, refração, `fluidSurface`, `nodeGraphs`) nos critérios e fixtures atuais, sem
  regravar e sem afrouxar.
- **Custo por quadro** comparado ao atual, em fração do quadro de 60 Hz no M4.
- **Testes, tsc e lint** verdes.
- **Tempo de compilação**:
  - os kernels de traçado não crescem com o número de grafos;
  - o kernel de sombreamento é pequeno.
- **A cena do tanque roda no Deno.**
- **Efeito provável a medir**: o traçado das sondas da GI deixa de levar os buffers de parâmetros de material e pode
  caber nos 10 do Chrome.

## Riscos

- **Memória** do estado de caminho e das filas, proporcional aos raios vivos. A refração tem ramos; o teto é o
  orçamento atual de jobs.
- **Despachos**: aproximadamente (M + 3) por rodada × rodadas. Isso precisa ser medido; se pesar, juntam-se rodadas
  vazias pelo despacho indireto.
- **Equivalência numérica da refração** com os ramos virando raios: é motor contra motor, nos mesmos fixtures.
