# Research — 037 padronização matemática e reuso

Base: o [inventário](./inventory.md) (levantamento de 2026-10-23 sobre `d38416d6`). Formato de cada decisão: Decisão,
Racional, Alternativas consideradas.

## R1 — Inventário vivo e a guarda contra a volta das duplicatas

- **Decisão**: o `inventory.md` é o registro (família, definição, usuários, destino) e é atualizado a cada tarefa. A
  guarda automática é um teste de "assinaturas canônicas": cada constante ou padrão que identifica uma conta (os
  multiplicadores do PCG 747796405/2891336453/277803737, os de Teschner 73856093/19349663/83492791, os pesos de
  luminância 0,2126/0,7152/0,0722 e 0,299/0,587/0,114, a curva sRGB 0,04045/12,92/1,055, π e 2π literais, a base de
  Duff, `(ndc.x·½+½, ½−y·½)`) só pode aparecer no módulo canônico dela; o teste aponta arquivo e linha. Complementa o
  teste existente de símbolo único (`elements/__tests__/wgslSymbols.test.ts`), que pega nomes, não contas.
- **Racional**: duplicata de matemática com nomes diferentes é o que escapou até hoje (seis cópias do mesmo hash com
  nomes distintos); a assinatura numérica é estável e barata de checar.
- **Alternativas**: comparação estrutural de AST de WGSL (cara, frágil); revisão manual (não impede a volta).

## R2 — Primitivas únicas: hash, aleatórios, cor, constantes

- **Decisão (hash)**: duas famílias, separadas por propósito:
  - **aleatoriedade**: `pcg_hash` (canônica, bits inalterados), `hash2`/`hash3`, um gerador com estado
    (`random_next`: `H(s + 0x9e3779b9)`) e a conversão `random_unit` = `(h >> 8)/2²⁴` em [0, 1). Fluxos nomeados por
    constante compartilhada (`RANDOM_STREAM_*`, uma por uso: refração, sondas de tela, sondas do mundo, fótons,
    partículas difusas, emissores, froxels), com a semente `random_seed(fluxo, índice, quadro)`; as cópias literais
    (`diffuse_hash`, `ray_direct_hash`, `gi_hash`, os inline) passam a chamar a canônica sem mudar bits; as sementes à
    mão migram para fluxos nomeados — isso muda as sequências da luz global, dos froxels, da refração e das
    partículas difusas (nenhuma é bit a bit; medido nos smokes, FR-013).
  - **endereçamento**: `hash_cell` (Teschner) e `hash_knuth` (o do LCP), sem a redução (`&`/`%` com quem chama); bits
    inalterados (a ordem dos vizinhos da física é bit a bit).
  - Variantes nomeadas intencionais: `hash_signed` em [−1, 1] fechado; o valor celular em [0, 1] fechado.
  - O `f32(h)/2³²` das partículas difusas (pode dar 1,0) passa a `random_unit`: muda resultado, medido.
- **Decisão (cor)**: `luminance` = Rec.709 sobre luz linear (FR-003); a BT.601 deixa de existir (a única aplicação
  correta seria luma de vídeo com gama, que o motor não usa); `ycocg`/`ycocg_inverse` numa definição (o recorte do
  antisserrilhado e a luz do forward); `max_channel` nomeado; `srgb_encode`, `srgb_encode_extended` sobre uma curva só e
  `srgb_decode` novo em WGSL; `gamma_encode` renomeado para a gradação (`grade_gamma`); o desempacotar de meia precisão
  da GI numa definição. Trocar BT.601 → Rec.709 no filtro do sinal traçado muda resultado (medido; o smoke
  `shaderLibrary` tem o espelho BT.601 e muda com decisão do usuário).
- **Decisão (constantes e amostragem)**: `PI`, `TAU`, `INV_PI` num módulo de constantes (mesmos f32: sem mudar bits);
  `basis_duff` (as quatro cópias); `basis_cross(n, limiar)` como variante nomeada (as bases por produto vetorial, com o
  limiar explícito para preservar cada uso); um módulo de amostragem (cosseno, esfera, cone, disco, triângulo).
- **Na CPU**: uma referência f64 de hash e de cor (`pcgHash`, `ProbeFlow.random`, `pathTracer.hash` unificados); nos
  smokes, um suporte único de medidas que distingue luma de sRGB de luminância linear; o mulberry32 de
  `particleScenes` preservado.
- **Racional**: a inconsistência de luminância dentro da mesma funcionalidade (034) e as sementes que coincidem entre
  áreas (correlação entre efeitos no mesmo pixel) são defeitos reais; as famílias bit a bit ficam intactas.
- **Alternativas**: uma família só de hash (misturaria endereçamento com aleatoriedade e arriscaria a ordem da física);
  manter BT.601 como opção (sem uso correto em luz linear).

## R3 — Álgebra canônica de transformações

- **Decisão**: WGSL não tem genéricos nem sobrecarga de funções do usuário. A especialização por classe é **por nome**,
  escolhida por quem escreve o kernel (é a montagem: nunca um ramo por classe em execução), com a mesma lista de
  operações em cada classe:
  - `rigid_*` (rotação + translação): `rigid_compose`, `rigid_inverse`, `rigid_point`, `rigid_direction`; normal = a
    própria rotação;
  - `affine_*` (3×3 + translação): `affine_compose`, `affine_inverse` (com a guarda de determinante de
    surface_collider_build: det ≤ 1e-20 → identidade, nomeada), `affine_point`, `affine_direction`, `affine_normal`;
  - `projective_*` (4×4): `projective_inverse` (cofatores), `projective_point` (com a divisão por w na política única);
  - TRS (quaternion, escala): `trs_world` e `trs_normal` (`R·S⁻¹`, a conta barata do TransformFlow);
  - 3×3: `mat3_inverse`, `mat3_det`, `mat3_transpose`; a simétrica do campo como `mat3_inverse_symmetric`.
    Onde um hospedeiro é genérico sobre a classe (os nós de espaço, `combineSpace`), a classe vem por ponto de extensão
    (`bindPoints`), como já se faz com a função de câmera. A referência da CPU é uma só, em f64
    (`elements/math/reference/xform.ts`), absorvendo `invertAffine`, `spaceInverseAffine` e `inverse3`; o `trsOf` da
    CPU passa a normalizar o quaternion e a tratar escala zero como a GPU (muda a decisão de "bake velho" do colisor só
    em casos de quaternion não normalizado: medido).
- **Tolerâncias** (FR-006), contra a referência f64: rígida e TRS ≤ 4 ulp por componente; afim e projetiva ≤ κ·u =
  1e3 · 2⁻²⁴ ≈ 6e-5 relativo para matrizes com número de condição κ ≤ 1e3 (u, o arredondamento unitário do f32: o limite
  do erro de qualquer inversa em f32 no pior caso). A primeira versão desta decisão pedia 1e-5 sem racional — inatingível
  em f32 com κ = 1e3 (medido: afim 4,6e-5, projetiva 1,6e-5) —, corrigida na T048.
- **Remover**: `quat_to_mat4` e `mat4_upper3x3_transform` (sem usuário), salvo se a família canônica precisar deles.
- **Racional**: o nome explícito mantém a escolha visível no código e custa zero em execução; ponto de extensão só onde
  a classe varia por cena.
- **Alternativas**: struct por classe com despacho por campo (ramo em execução — proibido); um gerador de WGSL por
  classe (código gerado sem matemática nova — contra FR-016).

## R4 — Referencial temporal único e módulo de espaços

- **Decisão (objetos)**: a inversa de mundo vira um pool próprio, sob demanda (`WorldInverse`, alocado só quando algum
  consumidor o liga — a refração, a estrutura de raios, o colisor, os nós de espaço), escrito pelo `TransformFlow` no
  mesmo despacho que compõe o mundo, só nos slots sujos. Não entra no `WorldTransform` para não pesar nas cenas de
  muitas instâncias (`instances/100k`) que não precisam dela.
- **Decisão (câmera)**: `CameraMatrices` ganha a inversa da vista (a vista de uma `CameraFunction` não é garantidamente
  rígida), a inversa da vista-projeção sem deslocamento da amostra e a vista anterior; o `CameraFlow` as calcula uma
  vez por quadro. O antisserrilhado deixa de inverter por pixel; a luz global e a névoa deixam as cópias próprias da
  câmera anterior. A cópia da luz global hoje guarda a vista-projeção **com** deslocamento: passar à sem deslocamento
  muda resultado (medido). O corte de câmera (`history.x`) passa a ser lido por todos os históricos.
- **Decisão (espaços)**: um módulo `view_space` com as passagens: `ndc_to_uv`/`uv_to_ndc`, `uv_to_pixel`,
  `clip_divide` (política única de w), `is_orthographic`, `view_depth` (NDC → linear), `camera_ray` (o atual
  `ray_camera`, com o mesmo resultado), `motion_vector(ponto anterior, ponto atual)` (monta os dois clips e chama a
  conta de `camera_motion`), `pixel_footprint(câmera, tamanho, ponto)`. Os seis shaders de movimento, os cinco
  reconstrutores de raio e as ≥ 20 conversões inline passam a usá-lo. Tirar o deslocamento da amostra tem um jeito só:
  as matrizes sem deslocamento guardadas.
- **Racional**: os históricos dependem dessas contas; padronizar antes do acumulador evita migrar quatro cópias.
- **Alternativas**: inversa dentro do `WorldTransform` (custo de banda em toda cena); calcular a inversa no consumidor
  com cache por quadro (vira helper, contra a regra).

## R5 — Acumulador temporal: peças comuns e o genérico do domínio de pixel

- **Decisão**: os sete acumuladores têm domínios diferentes (pixel, ladrilho, célula 3D, sonda fixa, célula do mundo,
  texel da luz). O comum vira uma **biblioteca de peças** temporais, e o domínio de pixel ganha o **acumulador
  genérico** completo:
  - peças: `temporal_reproject_point` (ponto do mundo → posição no quadro anterior, pelo referencial único),
    `temporal_validate_guide` (objeto e distância em larguras de pixel; plano e normal), políticas de peso
    (`temporal_weight_count` 1/n com teto, `temporal_weight_change` o α do A-SVGF, `temporal_weight_hysteresis` fixa) e
    a resposta adaptativa das sondas (`gi_response`, já compartilhada), `temporal_moments`, o corte de câmera;
  - acumulador genérico de pixel: o filtro do sinal traçado da 034 generalizado (ponto da fonte com o sinal, o guia e
    a mudança; reprojeção bilinear com fallback 3 × 3; momentos; à-trous opcional).
  - Instâncias: o **filtro do sinal traçado** (já é); o **antisserrilhado** usa as peças (reprojeção do fundo, corte,
    peso por contagem) e mantém o que é dele (recorte YCoCg, reativa, Catmull–Rom); as **sondas de tela** usam a
    reprojeção por ponto, a validação por plano/normal e o corte; a **névoa** usa a reprojeção por ponto, a histerese e
    o corte. DDGI e as cáusticas usam só as políticas de peso onde couber (não reprojetam). O que não migrar fica
    justificado no inventário (SC-006 pede ≥ 3 de 4).
- **Racional**: forçar um kernel único sobre domínios diferentes gera ramos e cópias; as peças dão o reuso sem perder a
  especificidade de cada um.
- **Alternativas**: um kernel genérico para todos os domínios (ramos em execução, custo); nada comum (status quo).

## R10 — Canal temporal da C2 (pedido do usuário, 2026-10-24)

- **Decisão**: a série temporal vira um conceito da C2, ao lado do pool e do alvo: o campo `history` de um descritor
  (textura ou pool) faz a C2 manter N fatias, girá-las quando o produtor grava, carimbá-las com o tempo do quadro e
  invalidá-las nos eventos que quebram a continuidade. A ligação escolhe a fatia pelo atraso, com um bind group por fase
  do anel. As peças `temporal_*` (R5) continuam sendo a conta; o canal é o recurso. Contrato:
  `contracts/temporal-channel.md`.
- **O que define a série**: domínio (entidades de um pool, alvo por pixel, células), valor e precisão, profundidade,
  carimbos, correspondência (identidade da entidade; reprojeção pela câmera anterior; transformação anterior do objeto)
  e invalidação. Correspondência e redução são de quem consome (média exponencial, momentos, diferença, janela).
- **Racional**: o levantamento de 2026-10-24 achou alocação, alternância, redimensionamento, recomeço e recuo de
  precisão repetidos nos quatro acumuladores (pipelines por paridade no antisserrilhado e na névoa, metades por paridade
  na luz global, cópias por quadro no filtro), e a névoa alocando 32 bits sem conferir `float32-filterable`. A física já
  guardava o "anterior" à sua maneira; o canal é o mesmo objeto para os dois mundos — a origem do desenho Flow + evento
  foi a dissipação de energia de corpos rígidos e moles, e a série temporal é o que faltava a ele.
- **Fase em vez de cópia ou de pipeline por paridade**: o bind group é criado por hash de conteúdo (004); cada fase do
  anel é um bind group criado uma vez e escolhido no quadro, sem cópia de textura e sem duplicar pipelines.
- **Corte de câmera fica na GPU**: é por câmera (`CameraMatrices.history.x`), e um alvo por pixel serve a uma câmera;
  invalidar o recurso inteiro pelo corte perderia os outros consumidores.
- **Pool**: entrada ou saída de entidade invalida o canal inteiro do pool (o slot liberado pode voltar com outra
  entidade). A validade por slot (carimbo de nascimento) fica registrada como evolução, não entra agora.
- **Alternativas**: uma spec própria depois da 034 (o usuário pediu nesta fase); um Flow genérico que copia o atual
  para o anterior (cópia por quadro, sem profundidade nem carimbo); manter os quatro como estão (status quo).
- **Energia dos corpos moles (pedido do usuário, 2026-10-24)**: cada corpo declara a sua faixa (`SoftBodyRange`, enviada
  na inserção: as partículas no pool do algoritmo, as arestas, o algoritmo e os blocos — os inícios por `slotRefs`
  `self:`, que a C2 resolve) e blocos de 1024 elementos (`SoftBodyChunk`: a faixa e o índice; a soma de cada um em
  `SoftBodyPartial`, no slot do bloco). Duas passadas, em ordem fixa (cada invocação uma fatia estriada, depois a redução
  em árvore no grupo: determinístico, sem atômicos de float): um grupo por bloco soma o bloco pela fonte do algoritmo no
  ponto `soft_energy_source` (XPBD com as arestas, nós sem termo elástico, MPM com o Neo-Hookean), trocada na montagem, e
  um grupo por corpo soma os blocos e grava a fatia. Uma região de parâmetros por algoritmo (offset dinâmico) diz quais
  blocos cada despacho toma. A primeira versão, um grupo por corpo, custou 1,0 ms com um corpo de 65 536 partículas (mais
  que o solver XPBD, 0,69 ms): o grupo único serializa o corpo grande; com os blocos, 0,05 ms. Termos: cinética
  ½·m·|v|², potencial −m·g·x no campo uniforme (os demais campos de força não entram), elástica ½·C²/α por aresta do
  XPBD com α > 0 (α = 0 é restrição rígida, sem energia definida) e V₀·ψ(F) no MPM, ψ = μ/2·(tr FᵀF − 3) − μ·ln J +
  λ/2·(ln J)² (o mesmo modelo do P2G); o FEM do motor ainda não tem modelo elástico (só integra a gravidade), então a
  energia dele é cinética + potencial. Partícula fixa (massa infinita) fica fora. Referências: f64 do estado lido; no
  XPBD e no FEM, a lei discreta do amortecimento (v·(1 − c·dt) por substep no XPBD, v·(1 − c) no FEM) dá a potência e a
  janela analíticas; o MPM não tem lei fechada de dissipação (a transferência em ponto fixo domina), e a conferência
  temporal dele é a das fatias.

## R6 — Precisão dos históricos

- **Decisão**: o formato de cada histórico vem de um lugar só (o descritor do Resource dono, por um valor de domínio
  `historyPrecision: 'half' | 'full'` com o padrão atual), para o smoke medir os dois sem código paralelo. Medida por
  histórico: erro contra a referência no smoke do efeito (antisserrilhado `still`, `giNoise` parado, `fog`, `refraction`
  com o filtro) e custo como fração do quadro de 60 Hz no M4. Troca de padrão só onde o erro cai além do ruído da
  medida (duas rodadas) e com decisão do usuário.
- **Correção já justificada sem medida nova**: o contador de quadros do antisserrilhado sai do alfa `rgba16float` (2048
  inteiros exatos) para o estado `rg32float` que já existe — o teto de 4096 do modo de acumulação passa a valer; o
  efeito na cor é medido.
- **Racional**: a suspeita (incremento perdido em 16 bits) é concreta e barata de verificar; o valor no Resource mantém
  a medida reproduzível e documentada.
- **Alternativas**: trocar tudo para 32 bits (dobra a banda sem medida); uma opção global de precisão (esconde o custo
  por efeito).

## R7 — Limites reais dos adaptadores

- **Decisão**: um smoke `adapterLimits` grava os limites **do adaptador** (`adapter.limits`, todos os nomes do
  WebGPU) e as `features` numa fixture por perfil (`apple-metal-3`, `nvidia-lovelace`), com data e versão do navegador.
  O motor passa a pedir, além dos de escala, os limites que o desenho usa (saídas de storage por estágio, anexos de cor,
  bytes por amostra), no valor **mínimo comum** às fixtures dos perfis de referência (`ENGINE_PORTABLE_LIMITS`), nunca
  o máximo de um adaptador; abaixo do mínimo comum, o evento de não suportado que já existe. O `deviceFloor` ganha o
  piso dos novos limites. A RTX 4090 entra quando o usuário rodar o smoke na outra máquina; até lá vale o M4 como
  mínimo conhecido.
- **Racional**: hoje o máximo real é desconhecido nos limites não pedidos; pedir o mínimo comum mantém o motor portátil
  (nada específico de Mac ou NVIDIA).
- **Alternativas**: pedir o máximo do adaptador (quebra a portabilidade, como a tentativa da 4090 da 034).

## R8 — Medida de equivalência e ordem de migração

- **Decisão**: antes de mudar código, uma rodada de base: todos os smokes e o bench no estado `d38416d6`, números
  guardados em `baseline-smokes.md`. Ordem: (1) as trocas que preservam bits (hash literal, π, Duff idêntica, apelidos,
  remoções), (2) a álgebra e o referencial com equivalência dentro das tolerâncias de R3, (3) as trocas que mudam
  resultado agrupadas num pacote para decisão do usuário, com a tabela antes/depois (luminância do filtro, fluxos de
  hash, `f32(h)/2³²`, câmera anterior da luz global, corte nos históricos, `trsOf`), (4) acumulador, (5) precisão,
  (6) limites. Cada passo roda os smokes afetados; o fim roda tudo três vezes, no fonte e com `--dist`.
- **Racional**: separar o que preserva bits do que muda resultado mantém cada mudança atribuível e a decisão do
  usuário concentrada.
- **Alternativas**: migrar por família de uma vez (mistura mudanças neutras com as que mudam imagem).

## R9 — Branch e retorno

- **Decisão**: a 037 vive em `feature/037-padronizacao-matematica`, criada de `feature/034-refracao-fisica` em
  `d38416d6`; ao fim, merge na 034 (nunca PR para o `develop`). Mudanças da 034 durante a 037 não acontecem (034
  pausada).
- **Racional**: a 037 reorganiza código que a 034 acabou de criar (refração, filtro); fazer antes da retomada evita
  retrabalho.

## Desvios registrados na implementação

- **R2 (`hash_cell`)**: a assinatura é `hash_cell(c: vec3u)`; as coordenadas com sinal entram por `bitcast<vec3u>` (o
  mesmo dos `bitcast<u32>` por componente das cópias), e os usos já sem sinal (estratos da refração, células dos
  froxels, pixel e partícula do pontilhado) chamam direto.
- **R2 (`basis_cross`)**: em vez do limiar, recebe o eixo auxiliar (`basis_cross(n, helper)`); a escolha do eixo e o
  limiar ficam com cada uso, que é o que preserva os bits das três cópias (eixos e limiares diferentes entre elas).
- **R4 (`WorldInverse` sob demanda)**: o motor só aloca sob demanda descritores individuais; os pools são sempre
  alocados. A inversa de mundo precisa de pool (mesmo slot do `WorldTransform`), então o contrato existente
  `allocation: 'onDemand'` passa a valer também para pool: até alguém pedir, o pool fica com um buffer mínimo (os
  slots são contados normalmente); o pedido (`ResourceDirectory.ensurePoolAllocated`) aloca a capacidade inteira e
  emite a realocação que os estágios já tratam. É a única extensão da C2 na 037.
- **R4 (módulo de espaços)**: dois módulos em vez de um — `view_space` (as contas puras: NDC ↔ uv ↔ pixel, divisão
  por w, ortográfica, profundidade linear, movimento a partir dos dois clips) e `camera_space` (`camera_ray`,
  `motion_vector`, `pixel_footprint`, que leem `cameras`). Os shaders de tela cheia e de interface usam as passagens
  sem ligar o pool de câmeras.

## R6 — medida 16 × 32 bits (T042, 2026-10-23, Apple M4, duas rodadas)

Os três históricos com `historyPrecision: 'full'` (32 bits por canal; lidos filtrados com `float32-filterable`) contra
o padrão `half`:

| Histórico               | Erro contra a referência (16 → 32 bits)                                                                                                               | Custo (fração do quadro de 60 Hz)                                                                             | Leitura                                                                                           |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Antisserrilhado (cor)   | `still` após 16 quadros 1,05 → 0,98 %; bordas após 64: 3,01 → 2,60–2,62 % (os dois passam a caber no critério); `trail` 15,69 → 16,08 %; órbita igual | resolução 5,79 ms acumulado no quadro, igual; antisserrilhado 2,47–2,56 ms (base 2,50) — sem custo mensurável | **ganho além do ruído**: troca proposta (T048)                                                    |
| Filtro do sinal traçado | lente pior região 0,05–0,06 % (igual)                                                                                                                 | temporal 0,078 → 0,110 ms, à-trous 0,320 → 0,376 ms (+0,09 ms ≈ 0,5 % do quadro)                              | sem ganho: fica `half`                                                                            |
| Névoa (froxels)         | vidro dentro 66,33 / 67,42 % (faixa da base 65,8–67,9); caminhada 1,52 % (base 1,47–1,50); `fogWalk` periodicidade 1060–1160× (base 351–550×)         | 0,71 → 0,75 ms (+0,04 ms)                                                                                     | sem ganho (a periodicidade piora: menos ruído de quantização mascarando a estrutura): fica `half` |

A luz global de tela já guarda o histórico em `array<vec4f>` (32 bits) e as sondas do mundo em meia precisão
empacotada (`pack2x16float`, com a resposta adaptativa): não entram na medida (sem dono com `historyPrecision`).

O formato dos alvos de 32 bits pediu uma correção na C2: o tipo de amostra das texturas `r32float`/`rg32float`/
`rgba32float` passa a `float` (filtrável) quando o device tem `float32-filterable` (antes, sempre `unfilterable-float`);
o motor pede a feature como opcional.
