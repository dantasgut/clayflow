# Research — Traçado em ondas (spec 039)

Insumo: [proposta.md](proposta.md) (aprovada em 2026-10-29) e o mapa do código de 2026-10-29 (abaixo, "estado atual").

## Estado atual (medido no código)

- **Seletor:** `composeHitMaterial` (`src/elements/raytrace/hitMaterial.ts`) gera `ray_hit_material(index, s, m, fn_slot)`, um `switch` com um caso por módulo `composite` distinto. A deduplicação é feita por `RaySceneFlow.composeFunctions`.
- **Onde ele é ligado:** pelo ponto `rayHitMaterialPoint`, via `bindPoints`, em `ProbeFlow.ts:448`, `RefractionFlow.ts:78` e `CausticsFlow.ts:218`.
- **Pontos de chamada no WGSL:**
  - `ray_hit_closure` (`raytrace/ray_hit.wgsl:44`);
  - `refraction_hit_closure` (`refraction/refraction_scene.wgsl:53`, malha e volume);
  - `ray_volume_closure` (`raytrace/points.ts:262`, usado só por um smoke).
- **Kernels que expandem o seletor:**
  - `gi_probe_trace_main` e `gi_screen_trace_main`: um acerto, depois os rebotes com `closure_indirect` sobre o mesmo fechamento.
  - `refraction_camera_main`: um invocador, laço de 64 passos.
  - `refraction_trace_main`: árvore de ramos, com `refraction_path_split` e `refraction_path` e um laço de até 34 passos. Tem 4 sítios de chamada mais o lobo raro olhado antes.
  - `caustics_instances_main`, `caustics_targets_main` (só compila o módulo) e `caustics_trace_main` (até 6 rebotes por canal).
- **O fechamento:**
  - O `Closure` tem 67 floats (`math/closure.wgsl:25`).
  - Os consumidores usam o fechamento inteiro: a luz direta no acerto opaco (`closure_eval`), o meio (`refraction_medium`), a parede fina, a transmissão e o albedo.
- **Raster:**
  - `ForwardFlow` faz um pipeline por (base × módulo × orientação), compilado em segundo plano (`verify`).
  - Enquanto não fica pronto, `materialPipeline` devolve `undefined` e o objeto é desenhado pelo pipeline base, com as constantes.
- **Compilação:**
  - `PipelineState.createPipeline` é síncrono, salvo com `verify` ou `preferAsync`.
  - Os kernels de traçado são síncronos, no `framePrepare`, e refeitos a cada `materialRevision`.
  - `GpuEngineCore` já deduplica pipelines por `specHash` e tem `createAsync` (`GpuEngineCore.ts:275-289`).
- **Ferramentas de compute existentes:** `Compaction`, `PrefixSum`, `RadixSort`, `CountToArgs` e `Reduce` (`src/elements/gpu/compute/`). O `workgroupsIndirect` está no `Dispatcher`.
- **Critérios dos smokes da refração:**
  - erro relativo por região contra o traçador de caminhos da CPU (média de 256 quadros);
  - vagalumes ≤ 0,05 %;
  - degrau de borda na lente;
  - energia truncada ≤ 0,1 %;
  - **custo**: lente a 1280×720, refração ligada menos desligada ≤ 3 ms.

  São todos estatísticos ou físicos, nenhum compara o padrão de ruído.

---

## R1 — Forma: ondas em compute com quatro estágios

**Decisão.** Cada rodada de um consumidor tem quatro estágios:

1. **Avanço e traçado** — independente de material. Aplica a continuação do acerto anterior, quando há, traça o próximo raio, grava o registro de acerto e conta por material.
2. **Separação** — scan das contagens, argumentos indiretos e espalhamento dos índices por material.
3. **Material** — um kernel por material distinto, mais o das constantes. Grava a superfície do acerto.
4. **Fechamento da rodada** — o avanço da rodada seguinte, ou o kernel final do consumidor.

A continuação de um consumidor fica junto do traçado da rodada seguinte, num kernel só, porque nenhuma das duas depende de material. Isso dá (3 + M) despachos por rodada, para M materiais distintos.

**Alternativas rejeitadas:**

- **O `switch` atual:** cresce com N × sítios e quebra o compilador da Apple.
- **Kernel fundido por material** (material + continuação + traçado, um por material e por consumidor): os programas de traçado seriam duplicados por material e cresceriam com M, contra a US4.
- **Fechamento por instância pré-calculado ou textura cozida:** os grafos variam por ponto (o xadrez), e cozinhar é atalho proibido (AAA).
- **Traçado por hardware:** o WebGPU não tem.

## R2 — Registro de acerto e superfície do acerto

**Decisão.**

- **`RayHitRecord`**, 16 palavras: a identidade do raio no consumidor (u32), a instância, `t`, a posição, a normal, o uv, a largura do cone, o índice do material (a classe da separação), o `fn_slot` e a direção de chegada. O tempo simulado vem do uniforme do consumidor.
- **`RayHitSurface`**: o `Closure` empacotado em meia precisão (`pack2x16float`), 34 palavras. As funções `closure_pack`/`closure_unpack` entram no módulo `closure`, num só lugar.
- **Precisão:** o índice de refração, as cores, os pesos e a rugosidade cabem com folga em f16. A emissão vai até 65 504 nits e a profundidade de absorção é em metros. A emissão do sol direto não passa pelo fechamento.
- **Conferência:** um teste unitário compara o empacotamento WGSL com a referência da CPU (`f16` do JavaScript), e um caso do `nodeGraphs` mede ida e volta na GPU.

**Alternativa rejeitada:** o `Closure` inteiro em f32, 268 B por acerto. Cabe, mas dobra a memória e a banda sem ganho medido nos critérios. Se algum critério cair por precisão, ela volta a f32 (decisão medida, não estética).

## R3 — Separação por material

**Decisão.**

- **Classes:**
  - 0: as constantes do `StandardMaterial` de malha;
  - 1..N: as funções `material`, na ordem de `RayScene.materialFunctions`;
  - N+1: o material próprio dos volumes sem função (`ray_volume_surface` com índice 0).
- **Contagem:** atômica no kernel de avanço e traçado.
- **Scan:** um kernel de um grupo de trabalho para M ≤ 256. Acima disso, `PrefixSum`.
- **Argumentos indiretos:** no formato do `CountToArgs`.
- **Espalhamento:** por cursor atômico por classe.
- **Determinismo:** a ordem dentro de uma classe não é determinística, mas cada kernel de material grava no índice do próprio registro, então o resultado é.

**Alternativa rejeitada:** `RadixSort` pela classe. É mais caro (8 passes de 4 bits) para M pequeno.

## R4 — Kernel de material nos acertos

**Decisão.**

- **Geração:** um `hit_shade_<hash>` por módulo `composite`. A entrada percorre a faixa da sua classe, monta a `SurfaceSample` (a lógica de `ray_hit_surface` / `ray_volume_sample`, que sai do traçado), chama a função do grafo, aplica `closure_sanitize` e empacota.
- **Kernels fixos:** o das constantes de malha e o dos volumes.
- **Dono:** um Resource `RayHitShading` (C3, `elements/raytrace`) e um `RayHitShadingFlow`. O Flow escuta a revisão dos materiais da `RayScene`, declara os pipelines por material e publica a lista dos prontos.
- **Despacho:** os consumidores despacham os kernels de material dentro do próprio passe, pela lista publicada.
- **Uma compilação por grafo:** um pipeline por grafo para os três consumidores, porque a fila e as superfícies são o mesmo recurso compartilhado (R5) e o `GpuEngineCore` deduplica por `specHash`.
- **Formato:** um caminho por `RayHitSurface`, no mesmo formato para todos os consumidores.

## R5 — A onda compartilhada e a capacidade

**Decisão.**

- **Recurso:** um Resource `RayWave` (C3, raytrace) com os registros de acerto, as superfícies, as contagens, os deslocamentos, os índices por classe e os argumentos indiretos.
- **Uso:** os consumidores usam a onda um depois do outro no quadro (GI → cáusticas → refração, a ordem atual dos Flows), cada um com o seu estado de caminho próprio.
- **Capacidade:**
  - o maior pedido dos consumidores (raios vivos por rodada);
  - limitada pelos limites do adaptador (`maxStorageBufferBindingSize`, `maxBufferSize`);
  - acima do teto, o consumidor processa em blocos (mais rodadas da mesma onda, pela fila de pixels ou fótons que já existe). Nada é escrito por ambiente.

## R6 — Rodadas e orçamento estrutural

**Decisão.**

- **Número de rodadas:** fixo por consumidor e igual ao orçamento atual:
  - GI: 1;
  - cáusticas: `CAUSTICS_BOUNCES` (6) + 1;
  - refração: `max_interfaces` + 2 (os dois níveis de ramos).
- **Despacho:** cada rodada é indireta pela contagem de raios vivos. Uma rodada vazia despacha 0 grupos.
- **Raios vivos:** compactados por anexação atômica em pingue-pongue de estado.
- **Laços restantes:** os da BVH, com o teto atual, e os de luzes, com `LIGHT_LIMIT`. Nenhum atravessa material.

**Risco:** o custo dos despachos (R13).

## R7 — Aleatoriedade por raio

**Decisão.**

- **Hoje:** os ramos e as repetições compartilham o estado sequencial (`state`, `rewind`, `forced`).
- **Agora:** o estado de cada caminho é derivado por hash da sua identidade (pixel ou fóton, quadro, id do ramo, rodada). Isso é determinístico: o mesmo raio na mesma cena dá a mesma amostra.
- **O que muda:** o padrão de ruído, não a distribuição.
- **Por que os critérios não sofrem:** os smokes são estatísticos, contra o traçador da CPU (estado atual). Se algum critério depender do padrão do ruído, o fato é levado ao usuário antes de qualquer mudança de fixture ou critério.

## R8 — Refração: a árvore de ramos achatada

**Decisão.**

- **Identidade do caminho:** `(pixel, leaf)`, com `leaf` = ramo do 1º nível (≤ 4) × ramo do 2º nível (≤ 4) × canal (−1 e 0..2 → 4). São no máximo 64 folhas por amostra, cada uma com o seu peso inicial.
- **Dispersão sem repetição:** onde a dispersão começa, o caminho abre os 3 caminhos por canal na hora. Some a repetição com `forced`, que existia para não guardar o estado.
- **O lobo raro olhado antes (T065i):**
  - Na interface, o caminho emite o lobo seguido e o lobo raro como dois raios da mesma rodada, ligados (índice do par).
  - Na continuação da rodada seguinte, a decisão de hoje vale igual:
    - se o raro termina, a luz dele entra com o peso exato e o outro segue sem roleta;
    - senão, a roleta de Fresnel escolhe entre os dois e mata o outro.
  - Só há essa emissão dupla acima de `REFRACTION_LOOK_WEIGHT`, como hoje.
- **Resultado:**
  - Cada folha terminada anexa um registro: pixel, radiância, truncada, movimento, fim, albedo e luminância.
  - O fechamento por pixel ordena os registros por pixel (`RadixSort`) e reduz cada segmento na ordem das folhas. A soma em ponto flutuante tem ordem fixa, portanto é determinística.
  - O fim e o albedo são os da folha de maior luminância. Hoje é o máximo hierárquico (ramo, depois amostra); o achatado pode escolher outra folha empatada. Isso afeta só o guia do filtro e do movimento, e fica documentado.

**Alternativa rejeitada:** soma atômica em ponto fixo por pixel. É determinística, mas a faixa HDR exige escala por cena.

## R9 — Refração: a pilha de meios da câmera numa rodada

**Decisão.**

- **Antes:** `refraction_camera_main` andava 64 passos, avaliando o material a cada acerto.
- **Agora:** o raio da câmera é uma reta. Um kernel de traçado enumera os acertos dela (até `REFRACTION_CAMERA_SEEN` = 32, laço da BVH com teto e avanço de `t`) e grava os registros. Uma rodada de material avalia todos, e a continuação monta a pilha na ordem.
- **Custo:** uma rodada em vez de 64.

## R10 — GI e cáusticas

**Decisão.**

- **GI (sondas e tela):**
  1. traçado: grava o acerto;
  2. material;
  3. continuação: `gi_shade_direct` e os rebotes com `closure_indirect`, com o fechamento desempacotado.

  São uma rodada. A redução da tela continua no kernel de continuação.

- **Cáusticas por instância:** acertos sintéticos (o centro da BLAS) na onda, depois material, depois `caustics_capable` sobre a superfície. É o primeiro consumidor e valida a fundação.
- **Cáusticas, fótons:** o estado do fóton (posição, direção, potência, canal, rebote, flag especular, pilha de meios quando houver) em pingue-pongue. Cada rodada aplica a continuação: refratar ou refletir pela roleta, depositar no hash e terminar.

## R11 — Fase de carga

**Decisão.**

- **Assíncrono por padrão:** `PipelineState` passa a ser assíncrono por padrão. Síncrono só por pedido explícito (teste).
- **Declaração antecipada:** os Flows declaram os pipelines na resolução dos slots (`slotsResolved`), como já fazem os declarados, não no `framePrepare`.
- **Independentes da cena** (avanço e traçado, separação, continuação, fechamento): compilam na inicialização do motor.
- **Por grafo:** o kernel de material e o raster compilam quando o grafo entra no mundo.
- **Prontidão:** reusa a `EngineReadiness` existente (C2, `scene/readiness`). Ela já avalia a cada quadro os pipelines em compilação dos Flows e emite `engineReady`. Com a declaração antecipada, `engineReady` passa a significar que todos os pipelines da cena estão compilados. O `Engine.whenReady()` já espera por ele. Não se cria recurso novo.
- **Material novo em execução:** enquanto o kernel de material da classe k não está pronto, o consumidor despacha o kernel das constantes sobre a faixa da classe k (com o índice da classe como uniforme). Na tela, o raster já usa o pipeline base. Nenhum quadro espera compilação.

## R12 — Cache binário de pipelines

**Decisão.** Membro opcional `pipelineCache?` no contrato `PlatformAdapter`, usado pelo `GpuContext` só se presente.

- Nem o navegador nem o Deno oferecem hoje: o WebGPU não expõe cache, o Dawn e o serviço de compilação do Metal guardam sozinhos, e o wgpu só tem cache no Vulkan.
- Portanto nenhuma implementação nesta spec, só o contrato e o teste do caminho ausente.

## R13 — Custo por quadro

**Decisão.**

1. **Primeiro, medir:** um micro-benchmark seguro (kernels triviais, sem laço) do custo de um despacho indireto vazio e cheio no Chrome, no M4, para dimensionar as rodadas. A refração pode ter cerca de 34 × (3 + M) despachos.
2. **Critério:** os de custo atuais. O principal é o da refração (≤ 3 ms na lente a 1280×720).
3. **Se passar, as reduções são medidas nesta ordem:**
   - (a) juntar rodadas vazias: a continuação grava 0 nos argumentos de todas as rodadas seguintes quando não resta raio;
   - (b) a separação dentro do kernel de avanço quando M = 1;
   - (c) rodadas por nível só onde há raios (a fila de pixels já compactada).
4. **Nunca:** afrouxar o critério, nem cortar o orçamento de interfaces. Se nada fechar, o fato vai ao usuário.

## R14 — Verificação no Deno

**Decisão.**

- **Novo smoke de compilação do motor**, só pela API WebGPU, sem submeter trabalho: cria todos os pipelines da cena do tanque com `create*PipelineAsync`, lê `getCompilationInfo` e falha em erro ou em mais de 120 s por pipeline. Roda no navegador e no Deno.
- **Compilação nativa fora do motor:** o MSL pelo `makeLibrary` continua como ferramenta fora do repositório (scratchpad), porque é específica do Mac.
- **GPU:** a execução do tanque na GPU só com a aprovação do usuário, uma vez, com vídeo.

## R15 — Contagem de recursos por kernel

**Decisão.**

- **Traçado:** deixa de ligar os pools de parâmetros de material (um por forma) e a geometria de uv.
- **Kernel de material:** liga os registros, as superfícies, os índices da classe, as instâncias e a geometria da estrutura de raios, e os pools de parâmetros do seu grafo.
- **Registro:** a contagem de cada kernel fica num teste de composição. O traçado das sondas da GI deve descer de 11; o valor medido é registrado, não prometido.
