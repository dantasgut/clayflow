# Análise — validação na RTX 4090 e auditoria da 033 (2026-10-18)

Levantamento que dá origem à [spec 034](spec.md). Feito numa máquina Linux com RTX 4090 (perfil `nvidia-lovelace`,
Chrome com Vulkan, X11), depois do merge da 033 (`3a5ad835`), para validar o que ficou pendente no Mac
(`apple-metal-3`) e responder a três dúvidas: a luz está implementada corretamente? As implementações são modulares?
Há trabalho duplicado ou desperdiçado que custa desempenho?

Fontes: smokes (fonte e `--dist`), bench, vídeos das demos (`npm run video`), medidas de ruído na cena com janela, e
duas auditorias de código (luz; modularidade e desperdício) com as afirmações principais conferidas no código. Cada
achado tem um identificador usado na spec. **Confirmado** = visto no código e/ou medido; **plausível** = indício
forte, falta medir.

## 1. O que a 033 entrega e foi validado aqui

Os critérios SC-001 a SC-014 da 033 passam na 4090 (fonte e `--dist`):

| Medida                       | 4090                     | Mac (registro da 033) |
| ---------------------------- | ------------------------ | --------------------- |
| Orçamento da GI (1280×720)   | 2,19 ms (2,18 `--dist`)  | 3,67 ms               |
| Névoa                        | 0,24 ms                  | —                     |
| Água a 64k partículas        | 1,39 ms                  | —                     |
| Cornell — pior região        | 6,5 %                    | —                     |
| Vazamento                    | 0,067 %                  | —                     |
| Estabilidade / resposta      | 0,04 % / 99,6 % a 0,25 s | —                     |
| Névoa — Beer–Lambert / feixe | 0,14 % / 2,1 %           | —                     |

**Radiometria correta** (auditoria da luz, conferida): lux e cd/d² entram como irradiância; ρ/π·cosθ aplicado uma
vez (`bsdf.wgsl:117,121`); sondas guardam E/π e a leitura multiplica por π uma vez (`gi_probe_blend.wgsl:68-84`,
`gi_sample.wgsl:32`); estimador por cosseno com E = π·média certo; raios das sondas do mundo em espiral de Fibonacci
com rotação aleatória por quadro; pesos DDGI fiéis (wrap² + 0,2, Chebyshev³); B rebatimentos respeitados (geração k lê
k−1); sol sem dupla contagem (céu sem o disco, direta só pelo mapa de sombra); névoa com Henyey–Greenstein
normalizada, Beer–Lambert e integração de Hillaire, acompanhando o sol que se move (verificado em vídeo).

**Arquitetura modular** (auditoria de modularidade, conferida): nenhum `create*`/`mapAsync` fora da C1; bind groups
refeitos só quando a fonte muda; WGSL composto e memoizado; um encoder e um submit por quadro; uploads por bitset de
sujo; `check:circular` limpo.

Os problemas estão em **convergência do ruído**, **normalização das cáusticas**, **trabalho sem nada mudar** e
**trabalho com o recurso ausente** — detalhados abaixo.

## 2. Luz (L)

### L1 ★ Manchas nas paredes: o gather de tela não converge (confirmado)

Sintoma: manchas de 2–3 ladrilhos (16–24 px a 720p), várias azuladas, na cena com janela (vídeo `day`); continuam
depois de 600 quadros parados.

Medida (cena com janela, sol a 50°, câmera parada, 8 bits de luma; alto-passa na parede do fundo):

| Variante                                         | Manchas (desvio)     | Diferença quadro a quadro | Média |
| ------------------------------------------------ | -------------------- | ------------------------- | ----- |
| `medium` (8 raios de tela, ladrilho 8, fração ½) | 4,57                 | 0,38                      | 162   |
| sondas do mundo no máximo (256 raios, fração 1)  | 4,54                 | 0,39                      | 162   |
| `screenGather: false`                            | 4,05 (limpa)         | 0,06                      | 169   |
| `high` (32 raios, ladrilho 4, fração 1)          | 4,54 (visível menos) | 0,10                      | 161   |

As sondas do mundo não são a causa; o gather de tela é. Três fatores (código conferido):

1. **Teto fixo da histerese**: `h = min(w/(w+1), hysteresis)` com 0,97 (`gi_response.wgsl:30`), a mesma das sondas do
   mundo (`ProbeFlow.ts:558`). A média móvel equivale a ~66 atualizações (~528 raios com 8 por atualização; com fração
   ½, uma a cada 2 quadros) — parada, a imagem não melhora além disso.
2. **Estimador de cauda pesada sem contenção**: raios por cosseno (`gi_screen_trace.wgsl:22-29`), sem amostragem por
   importância nem clamp; a luz indireta da parede vem de fontes pequenas e muito fortes (a mancha de sol no chão,
   L ≈ 6–8 k contra ~300 do resto; o céu pela janela — as manchas azuladas). Simulação: desvio por sonda de 10–16 %.
3. **Filtro espacial que só passa o ruído para baixa frequência**: gaussiana 5×5, σ = 1,2 ladrilho
   (`gi_screen_resolve.wgsl:70-104`); o comentário em `:67` admite as manchas de 2–3 ladrilhos.

A 033 (spec.md:127-129) pede convergência a ≤ 2 % em 2 s parado — incompatível com 1 e 2. A `research.md` (R2 adendo)
cita Lumen e GI-1.0 sem o que torna 8–16 raios viáveis neles: o cache de radiância para o campo distante e a
amostragem por importância.

### L10 Ruído de baixa frequência das sondas do mundo no `medium` (confirmado, novo)

Com a mancha de sol pequena e forte, a média da parede só com as sondas do mundo oscila ±1–2 % em escala de segundos.
O mesmo acontece com todas as sondas atualizadas a cada quadro e com 1 rebatimento; não muda com histerese 0,8. A
média a 2 s fica a 2,24 % da de 10 s, quando o critério da 033 é ≤ 2 %. Não depende do céu (constante), da relocação
das sondas nem da precisão de meia palavra (testados).

Causa: 64 raios por sonda contra fontes secundárias pequenas e muito fortes. A coleta de tela com amostragem guiada (R1)
não herda isso: 0,15–0,20 % de 2 s para 10 s.

### L2 Cáusticas com 0,5× a 1× da energia (confirmado)

`gi_photon_deposit` espalha trilinear 3D (`gi_photon_trace.wgsl:128-137`), a leitura é trilinear 3D
(`gi_photon.wgsl:65-76`) e o resolve divide só pela área h² (`gi_photon_resolve.wgsl:19-24`). Num plano, o eixo
normal soma (1−f)² + f²: num chão em múltiplo de h (y = 0, células centradas em (k+½)h, f = ½) a cáustica sai com
**metade** da energia; plano inclinado também erra (o corte da célula não tem área h²). Não é a causa dos smokes de cáustica
vermelhos (S1).

### L3 Corrida no acúmulo das sondas do mundo (confirmado)

`gi_probe_hysteresis` (`gi_probe_blend.wgsl:37-42`): os 64 texels de uma sonda leem `gi_probes[i].response` enquanto
o texel 0 o grava no mesmo kernel, sem barreira — texels da mesma sonda podem usar histereses diferentes; no recomeço
podem misturar o conteúdo antigo.

### L4 Raio de tela pela face de trás conta preto no denominador (confirmado)

`gi_screen_trace.wgsl:75-92` soma 0 e `:107` divide por todos os raios; as sondas do mundo descartam esses raios
(`gi_probe_blend.wgsl:66`). Escurece quinas e o vão da janela — compatível com a média 162 contra 169 sem o gather.

### L5 Entalhes escuros no topo da janela (plausível)

Vistos no `medium`, somem no `high` (ladrilho 4). Faixa fina do vão: o raio do centro do ladrilho de 8 px cai na
face de baixo da verga e os pixels caem no fallback "mais próxima ou 5×5" (`gi_screen_sample.wgsl:64-77`); L4
contribui.

### L6 Serrilhado na borda da mancha de sol (confirmado em vídeo)

A borda da luz do sol no chão sai em degraus (vídeo `fog`, sol baixo): resolução/filtragem do mapa de sombra
direcional.

### L7 Padrão quadriculado na névoa (confirmado em vídeo)

Nas regiões escuras da névoa aparece um padrão em blocos (froxels de 160×90×128 sem jitter/filtro temporal visível).

### L8 Rebatimentos ≥ 2 leem o texel mais próximo (plausível)

`gi_generation.wgsl:22-24` sem bilinear: facetas leves.

### L9 Pesos DDGI podem zerar (plausível, menor)

`gi_weights.wgsl:86-90` sem o piso de 1e-6 do DDGI: se todos zerarem, a amostra é pulada.

## 3. Trabalho desperdiçado (D)

| #   | Achado (confirmado salvo indicação)                                                                                                                                                                                                                                                                       | Evidência                                                                                                                                  | Impacto estimado                      |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------- |
| D1  | Fótons de cáustica traçados sem nenhum alvo: `gi_photon_power` só zera a direcional sem alvos; pontual/spot sempre `e·4π`. `caustics` é `true` por padrão; 262k fótons/quadro no `medium` terminam numa difusa sem depositar; o resolve percorre os 2¹⁹ baldes; potência por luz recalculada 2× por fóton | `gi_photon_trace.wgsl:46-55,166,178,204-208`; `ProbeFlow.ts:313-314`                                                                       | O maior desperdício de GPU da GI      |
| D2  | Desligar/remover a GI não desfaz o que ela ligou: a `RayScene` fica (refit do TLAS todo quadro, rebuild a cada 8, sem consumidor); com `enabled:false` o hemisfério continua retirado (cena sem ambiente) e o prepass forçado                                                                             | `presentation/flows/defaults.ts:218-238`                                                                                                   | GPU contínua sem uso + defeito visual |
| D3  | Estrutura de raios refaz o estático: TLAS refit todo quadro e LBVH a cada 8 sem checar movimento; BLAS de esferas idem com a simulação parada; geometria com contagem na GPU: build completo todo quadro                                                                                                  | `raytrace/RaySceneFlow.ts:387-395,631-636,643`                                                                                             | GPU por quadro em cena parada         |
| D4  | `FluidField` refeito inteiro todo quadro, mesmo pausado; limpa a capacidade inteira (~16,8 MB/quadro a 64k); `links` despachado pela capacidade                                                                                                                                                           | `fields/FluidFieldFlow.ts:203-256,225,232`                                                                                                 | GPU + banda                           |
| D5  | Física fragmentada: cada dispatch do LCP abre o próprio passe (~110 passes por passo com os defaults); solve/build pela capacidade de contatos (o `CountToArgs` + indireto já existe); o mesmo em SPH, vizinhança e `TransformFlow`                                                                       | `LCPFlow.ts:520-541,607-618`; `SPHFlow.ts:205-221`                                                                                         | 0,5–1,5 ms de CPU (estimado)          |
| D6  | `TransformFlow` recompõe todos os transforms quando um só é da GPU (10 corpos + 100k estáticos = 100k matrizes por quadro)                                                                                                                                                                                | `elements/scene/flows/TransformFlow.ts:289-297`                                                                                            | Escala com a cena inteira             |
| D7  | Mapa de sombra redesenhado todo quadro sem teste de mudança; efeito de pós com força 0 ainda faz ida e volta em tela cheia; efeitos em resolução cheia sem fusão (bloom sem cadeia de mips, blur 5×5 não separável, vinheta/cromática/grading em passes separados)                                        | `ShadowFlow.ts:197-245`; `PostProcessEffect.ts:82`; `effects.wgsl`                                                                         | GPU                                   |
| D8  | CPU por quadro: UI re-achatada e re-subida inteira; filtros O(G·T) com alocação e `recordGroups` 2× com prepass; args indiretos reescritos; flows reordenadas por fase; `WeakSet` por chamada em `specHash`; `JSON.stringify` e LUT do céu por quadro; grades de névoa copiadas todo quadro               | `UIFlow.ts:154`; `ForwardFlow.ts:627-631,849-893`; `FlowRegistry.ts:161-168`; `specHash.ts:87`; `SkyFlow.ts:121,147`; `FroxelFlow.ts:190`  | CPU                                   |
| D9  | Memória superdimensionada (plausível): hash de cáustica de 16,8 MB com `caustics` desligado; buffers de sondas para 4 cascatas com menos em uso; texturas de tela a canvas/4 com ladrilho 8                                                                                                               | `GlobalIllumination.ts:309`; `ProbeFlow.ts:422-427`                                                                                        | Memória                               |
| D10 | A medir (plausível): blend/visibilidade das sondas sem memória de grupo (~28M leituras/quadro no `medium`, 0,1–0,3 ms); histórico de tela recalculado por raio; injeção de froxels sem culling de luzes; pilha de travessia de 32 que descarta nós e testa cada caixa 2×; terceira cópia de cor da água   | `gi_probe_blend.wgsl:64-78,109-115`; `gi_screen_trace.wgsl:66`; `media_froxel_inject.wgsl:63-68`; `ray_scene.wgsl`; `WaterFlow.ts:136-146` | Medir com timestamp antes de mexer    |

## 4. Modularidade (M)

| #   | Achado                                                                                                                                                                                                                                                                                                                                                                                | Evidência                                                                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | WGSL duplicado apesar do `wgslModule({requires})`: hash de Teschner em 6 cópias; `field_key` = `gi_photon_key`; hash PCG em 3; desempacotamento de half em 3 na GI; 3 bases ortonormais; vertex de tela cheia em 3; `prepareIndirect` e o laço de grupos copiados entre Forward e Shadow; duas grades de vizinhança paralelas em TS. Viola "cada símbolo WGSL definido uma vez" (033) | `spatial_hash.wgsl:9`, `field_common.wgsl:48,91`, `gi_photon_common.wgsl:32`, `media_common.wgsl:40`, `diffuse_sprite.wgsl:50`, `noise.wgsl:7`, … |
| M2  | Objetos-deus: `ResourceSystem.ts` (2508 linhas, ~9 responsabilidades) e `ForwardFlow.ts` (1339, ~10)                                                                                                                                                                                                                                                                                  | —                                                                                                                                                 |
| M3  | C3/C4 importam `scene/graph/*` como valor, fora da lista de contratos do Princípio I; o lint não pega                                                                                                                                                                                                                                                                                 | `presentation/flows/defaults.ts:31`                                                                                                               |
| M4  | Nomes que enganam: `fs_ssao` não é oclusão de ambiente (compara luminâncias de cor); `fs_fxaa` roda em HDR antes do tone map                                                                                                                                                                                                                                                          | `effects.wgsl:81`                                                                                                                                 |
| M5  | Luminância inconsistente: `gi_luminance` Rec.709, `math/color.wgsl` BT.601                                                                                                                                                                                                                                                                                                            | —                                                                                                                                                 |

## 5. Smokes e testes (S)

Diagnóstico com os smokes na 4090, bissecção em worktrees temporárias. **Nenhuma falha vem das fixtures
`nvidia-lovelace`**, e a pista de L2 não se aplica: `fluidSurface` e `parametricSurfaces` não usam a GI, e sim o
`CausticsFlow` da 017.

### S1 Seis checagens medem cor no pixel da tela com limiares de antes da 011 (teste; confirmado por bissecção)

Os smokes medem cor e contraste no pixel de 8 bits com limiares calibrados quando a saída era linear. O
**`5ef1dd46`** (011: HDR, AgX, sRGB) quebra todos; o `4046c88e` (luzes por `scene_lighting`, hemisfério) clareia e
dessatura mais:

| Checagem                                  | `7fa2e12b` (antes da 011) | `5ef1dd46`    | hoje          | Causa no pixel                                                                                                                                      |
| ----------------------------------------- | ------------------------- | ------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `extensionPoints` xadrez (trocas)         | 8 ✔                       | 0 ✘           | 0 ✘           | Fundo 0,05 vira 72,85,110 em sRGB; casas escuras a R≈106–114, acima do limiar fixo `> 60` (`:742-754`)                                              |
| `extensionPoints` olho de peixe (px)      | 5,38 ✔                    | 5,40          | 3,44 ✘        | Laranja sai 157,103,69 e `r > 1,6·g` falha; só a borda conta (`:1056-1085`)                                                                         |
| `nodeGraphs` caixa 181 (pior diferença)   | 0,53 ✔                    | 97 ✘          | 109 ✘         | 1000/1000 caixas diferem: compara emissão linear `c·255` com o pixel tonemapeado; em linear sobra +0,060 constante (especular F0≈0,04) (`:915-935`) |
| `softSurface` pano (px)                   | 7378 ✔                    | 15 ✘          | 56 ✘          | O pano aparece, rosado (175,126,120); `r > 1,8·g` falha; com `r > g+30 && r > b+30` dá 7330 (`:131-139`)                                            |
| `fluidSurface` cáusticas agitadas (H5)    | 1,31× / 0,37× ✔           | 1,29× / 0,71× | 1,26× / 0,79× | Razão no pixel AgX+sRGB; decodificado 1,67×/0,60×; em linear 2,10×/0,52× (`:183-194,320-334`)                                                       |
| `parametricSurfaces` lago, % claro/escuro | 20 / 28 ✔                 | —             | 0,78 / 0,45 ✘ | Visíveis; decodificado 16,8 % / 21,6 % contra 2 % pedidos (`:722-749`)                                                                              |

Leitura: a origem é a apresentação nova (`5ef1dd46`) e a luz nova (`4046c88e`), não as fixtures. O que esta medida
**não** prova é que o motor esteja certo: falta conferir o AgX contra a curva de referência, a exposição padrão, os
níveis das luzes e do hemisfério e o especular dos materiais de teste. A correção é no motor (R10). Medir em linear ou
recalibrar limiares por conta própria — proposto numa primeira versão desta análise e também tentado na 034
descartada — é mudar o critério e fica proibido; se o motor sair comprovado certo, a decisão do critério é do usuário.
H4 e H5 do PENDENCIAS passam a apontar para `5ef1dd46` como origem, ainda abertas.

### S2 `parametricSurfaces/animated`: física roda antes do colisor (motor + smoke; confirmado)

Os pipelines com código de extensão (`surface_eval_main`, `scb_points_main`) são verificados por
`getCompilationInfo` antes de compilar (`GpuEngineCore.ts:493`): 532 e 605 ms na 4090, mais que os 400 ms do
`settle`. O laço síncrono de passos (`parametricSurfaces.ts:605-609`) não deixa o `then` rodar: a compilação só é
pedida depois dos 90 passos, no dispose. O estágio de colisor obrigatório é pulado em silêncio ("30 Hz: 0 cópias");
as taxas seguintes passam com o cache `verified` quente (`PipelineState.ts:333`). Os pageerrors "device perdido" vêm
de `void this.core.createAsync(spec).then(...)` sem `catch` (`PipelineState.ts:361`). Com o relógio da página a 0,25×
o caso passa. Correção: prontidão do motor por evento/promessa (nenhum Flow em `preparing`, nenhuma compilação em
voo — o core já rastreia `pendingPipelines`), `catch` no `createAsync` quando o token mudou ou o core está fechando,
`settle` aguardando a prontidão. Decidido (2026-10-18): a física espera o colisor obrigatório ficar pronto.

### S3 "0 amostras de GPU" no `fluidSurface` (teste + profiler; ligado ao H1) — corrigido

Sem vsync, a CPU submete os 160 quadros em ~70 ms; o profiler mantém um único `mapAsync` em voo
(`GpuProfilerSystem.ts:195-240`) e o dispose destrói o staging antes de o map resolver: 1 resolve, 0 leituras. O
"leituras velhas" do H1 no Mac é provavelmente o mesmo mecanismo (mesmas flags). Correção: o smoke cadencia por
`onSubmittedWorkDone` ou passa até ter ≥ 30 leituras; no motor, anel de 2–3 stagings e limite de quadros em voo.

### S4 `field.test.ts` estoura 5 s no `npm run ci` (teste) — corrigido (culling por grade, equivalência testada)

Sozinho 488 ms; com coverage 1552 ms; suíte sem coverage 2393 ms; **suíte com coverage 5318 ms** (24 workers). Causa:
`densityAt` em `fields/reference/field.ts:200-242`, O(voxels × kernels) ≈ 50 M iterações alocando arrays. Correção:
culling por grade no `densityAt` (ou camada menor) e timeout explícito.

## 6. Validação e ferramentas (V)

| #   | Achado                                                                                                                                                                                                                                                                                                      | Estado                                                               |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| V1  | No Linux o Chrome cai no SwiftShader sem `--enable-features=Vulkan --ignore-gpu-blocklist`                                                                                                                                                                                                                  | Corrigido (`bench/runner/browser.ts`)                                |
| V2  | `--headless` perde o device na 4090/Vulkan; smokes e bench rodam com janela                                                                                                                                                                                                                                 | Registrar; investigar só se o CI precisar                            |
| V3  | O bench fica preso a 60 FPS na 4090 (FPS e p99 sem valor: G3 e H3 não medidos); a GPU fica em clock baixo (P8) e o tempo de GPU sai inflado. Hipótese não testada: a emulação de viewport do Playwright (`orchestrate.ts:63`) — as demos sem emulação passam de 700 FPS                                     | Aberto; baseline da 4090 não foi gravado                             |
| V4  | Vídeos: `npm run video` (exact quadro a quadro + realtime pela tela). O realtime perdia quadros sem vsync (132 únicos de 655) e, com vsync, o primeiro quadro dava passo negativo e parava a animação                                                                                                       | Corrigido (vsync no `launchBrowser`, relógio do 1º quadro, watchdog) |
| V5  | `field.test.ts` estoura 5 s no `npm run ci` completo (0,75 s sozinho)                                                                                                                                                                                                                                       | Ver S4                                                               |
| V6  | Débito de outras fases: 001 T029 sem `../claflow-web` para testar; 011 US5/US6 e parte da US4 não implementadas (sem `Materials.ts`, `caustic_mesh.wgsl`, cena de materiais no bench, luzes pontuais no Clayflow do bench); 005 T084 e 006 T078 fechadas no PENDENCIAS mas com a caixa aberta no `tasks.md` | Fila / reconciliar                                                   |

## 7. Inventário das pendências das outras fases

Varredura de todas as caixas `- [ ]` das specs 001–033 e dos itens abertos do PENDENCIAS, com o estado conferido no
código (2026-10-18). Das 38 tarefas abertas: **6 feitas** (só falta marcar), **6 parciais**, **25 não feitas**, **1
bloqueada**, nenhuma obsoleta inteira.

### 7.1 Tarefas abertas das specs

| Spec / tarefa                                        | Estado real                                                                                                                                                                                                                                                                                                                                                                                          | Destino                                    |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| 001 T029 (cena do `claflow-web`)                     | Bloqueada: `../claflow-web` não existe nesta máquina                                                                                                                                                                                                                                                                                                                                                 | Fica na 001 até o repo irmão estar aqui    |
| 005 T084, 006 T078                                   | Feitas (PENDENCIAS §0; nota em 006 tasks.md:349-358); caixa aberta                                                                                                                                                                                                                                                                                                                                   | Marcar (034 T057)                          |
| 011 T025, T083, T103, T111                           | Feitas (`bsdf.test.ts` 8/8; `FluidSurfaceMaterial.ts:71-110`; fixtures de estado e `ci` pela 033)                                                                                                                                                                                                                                                                                                    | Marcar (034 T057)                          |
| 011 T003                                             | Parcial: smokes existem; faltam `hdr`, `lighting`, `materials` no README dos smokes                                                                                                                                                                                                                                                                                                                  | 034 T056                                   |
| 011 T102, T109                                       | Não feitas: limiares quebrados em `5ef1dd46`; smokes vermelhos                                                                                                                                                                                                                                                                                                                                       | 034 (S1: T024–T028, T031)                  |
| 011 T101                                             | Parcial: imagens regravadas na 033; faltam os hashes de `extensionPoints`/`parametricSurfaces` (smokes falham)                                                                                                                                                                                                                                                                                       | 034 T025, T027                             |
| 011 T110                                             | Parcial: baseline regravado na 033 com as regressões da 011 embutidas (`instances/100k` GPU 0,35 → 0,98 ms); custo do HDR nunca medido                                                                                                                                                                                                                                                               | 034 (US6)                                  |
| 011 T079                                             | Não feita: grafo de madeira envernizada e grafo inválido no `nodeGraphs`                                                                                                                                                                                                                                                                                                                             | Retomada da 011                            |
| 011 US4 — água (T081, T082, T084 parcial, T085–T089) | Não feitas: testes da `roughness`/obsoletos e do `WaterSurface`; composição ainda com a cópia própria `water_background` (`WaterFlow.ts:133`); `lightSize` 512 e vista `background` (`WaterSurface.ts:66,141`); sem `causticGrid`; sem `caustic_mesh.wgsl` (a decisão da malha, 011 research.md:232, não foi revogada pela 033); transmissão bilinear; smokes `water-*` e `caustics-smooth/temporal` | Retomada da 011 (decisão da malha a tomar) |
| 011 US5 — biblioteca (T090–T094)                     | Não feitas: só `openpbr.ts`; sem os 23 sub-grafos, `Materials.ts`, `gallery`, `library-compose`                                                                                                                                                                                                                                                                                                      | Retomada da 011                            |
| 011 US6 — Three lado a lado (T095–T100)              | Não feitas: adaptador sem MSAA/AgX/luzes físicas (`bench/engines/three.ts:39`); sem cena `materials`, `point-lights/clayflow.ts` (`scene.ts:15` ainda `unsupported until 'F4'`), `water-lake`, página de comparação, `comparison.md`                                                                                                                                                                 | Retomada da 011                            |
| 011 T104–T108 — docs                                 | Não feitas/parciais: sem `materials.md`, `lighting.md`, `presentation.md`; `node-graphs.md` sem os grupos; `post_processing.md` ainda com o passthrough; ordem dos passes; ROADMAP não marca a 011                                                                                                                                                                                                   | Retomada da 011                            |
| 011 T112 — vídeos                                    | Não feita (galeria, grafo, comparação)                                                                                                                                                                                                                                                                                                                                                               | Retomada da 011                            |

O merge da 011 (`693aed4b`, PR #47) entregou só US1–US3. Achado à parte: as caixas de T075 (`closure-layer`) e T078
(`transmission-ior1`) estão marcadas, mas `closure-layer` não é um caso próprio em `materials.ts:1003` — conferir na
retomada.

### 7.2 Débitos registrados no PENDENCIAS

| Item                                                | Destino                                                              |
| --------------------------------------------------- | -------------------------------------------------------------------- |
| R1 (011) refração com fundo pixelado — imediato     | **034 US7** (T059–T062)                                              |
| H1 tempo de GPU no Apple                            | 034 S3 (T029) — causa: CPU à frente do profiler                      |
| H2 resolvedor de consumidor ausente em silêncio     | 034 FR-026 (T006–T008)                                               |
| H3 p95 de `64k-water`, G3 p99 de `rigid-bodies/10k` | 034 US6 (T033)                                                       |
| H4, H5 fixtures e checagens desde a 011             | 034 S1 (T024–T028)                                                   |
| H6 raios sem texturas por derivada                  | F4 (012), como no ROADMAP                                            |
| G2 passthrough do pós sem efeitos                   | F4 (014); a fusão de efeitos da 034 (T042) não o remove              |
| P1, P2, P4, P5, P7, P8, P9, E1, E4                  | F5 (015, 016, 018), como no ROADMAP — funcionalidades, não correções |
| P6 emissores                                        | F9 (025)                                                             |
| N1, N2, N3, N6 grafos                               | F8 (032)                                                             |

## 8. Tentativa anterior da 034 (descartada)

Uma sessão anterior abriu uma 034 (refração, tempo de GPU, cáusticas, smokes antigos, fechamento) e o usuário a
descartou por atalhos que falseavam a solução. O código não foi aproveitado; o levantamento dela entra aqui como
requisito:

| Item da tentativa                                                                                                | Atalho rejeitado                                     | Onde entra nesta 034 |
| ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | -------------------- |
| Raio no limite de interfaces lendo a cópia da tela                                                               | Cópia da tela no lugar de seguir o raio              | US7, FR-031, T061    |
| Rugosidade como desfoque bilateral                                                                               | Desfoque no lugar de raios pela GGX                  | FR-031a, T063        |
| Reflexo das faces atravessadas pelo ambiente                                                                     | Ambiente no lugar de raio traçado                    | FR-031b, T062        |
| Dispersão com antisserrilhado iluminada na superfície do raio verde                                              | Um acerto para os três canais                        | FR-031c, T064        |
| Água saindo do volume sem refratar (normal = `-dir`)                                                             | Sem normal de saída, Fresnel, reflexão interna total | FR-031d, T065        |
| Filtro de φ da água (alisava a normal ruidosa)                                                                   | Filtro no sintoma em vez do redistanciamento         | FR-031e, T066        |
| Smokes `materials`/`globalIllumination`/água com a refração nova; caso da água no `refraction`                   | Não feito                                            | T060, T067           |
| Tempo de GPU medido uma vez por quadro                                                                           | —                                                    | FR-027b, T029        |
| Água a 64k: ~15,9 ms contra 10,2 ms no `develop` (medido na tentativa; registrado como H7)                       | Tarefa marcada feita sem fechar                      | FR-027c, T029a       |
| Cáusticas do lago e da água agitada; pano, xadrez, olho de peixe, caixa 181                                      | Critérios mudados (depois desfeitos)                 | FR-025, T024–T028    |
| PENDENCIAS dizendo que H4/H5 foram resolvidas                                                                    | Registro falso                                       | T057 (reescrever)    |
| Fixtures com montagem, docs, ROADMAP, 31 smokes + `refraction` + `gpuTiming`, bench, `ci`, vídeos sem serrilhado | —                                                    | Fase 9 (T054–T058)   |

## 9. Itens abertos durante a implementação

| #   | Item                                                                                                                                                                                                                                                                                                                                                         | Estado    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| O1  | `materials/transmission-layers` contra o traçador (decisão do usuário): L1 3,07 % (limite 3 %) e o verde de trás em 12 dos 38 pixels em que a referência o mostra. A diferença fica na borda da esfera clara, onde os raios a atravessam rasantes e alcançam a verde sobreposta; a mesma cena em perspectiva no smoke `refraction` (`layers`) passa a 1,21 % | Aberto    |
| O2  | H2 confirmado ao vivo: o consumidor `GlobalIllumination.refraction` faltando deixou o pipeline dos transmissivos esperando em silêncio (sem aviso) — a C2 precisa avisar (FR-026)                                                                                                                                                                            | Aberto    |
| O3  | `app.ready()` esperava só os pipelines atuais; a troca em preparo (a névoa, a GI que entrou) desenhava ainda com o antigo e deixava o smoke `fog` intermitente — corrigido (as trocas também contam)                                                                                                                                                         | Corrigido |
