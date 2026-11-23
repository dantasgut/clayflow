# Análise: por que o tempo real ainda é difícil, e o que falta

Data: 2026-11-23. Escrita depois das specs 041 (nuvens) e 011 (biblioteca de materiais), em resposta a perguntas do
usuário. Os números são do Apple M4 (GPU integrada), medidos nos smokes desta fase. **Nada aqui foi medido na RTX 4090.**
Onde o texto fala da 4090, é estimativa e está marcado.

Revisão de 2026-11-23: incorpora três análises feitas em outra sessão (v1 e v2 gerais, v3 sobre o código), depois de
conferir no código o que cada uma afirma. A conferência está na seção 3. Ela corrigiu dois pontos desta análise: o ritmo
dos quadros (a CPU e a GPU andam em série por causa das leituras de volta) e a ordem das prioridades (há três correções
baratas antes das peças grandes).

## 1. Resumo

O motor calcula tudo na GPU e já tem culling. A dificuldade com o tempo real não vem de falta de paralelismo nem do ECS.
Vem de quatro coisas somadas:

1. **Fazemos o cálculo caro e exato em todo pixel, todo quadro, na resolução cheia.** Jogos fazem o caro em resolução
   baixa, repartido por vários quadros, e reaproveitam o resultado.
2. **Não guardamos o que não muda.** O material procedural de um objeto parado é recalculado por pixel a cada quadro.
3. **O WebGPU não dá acesso ao traçado de raios por hardware.** A 4090 tem circuitos próprios para isso; o nosso traçado
   é um programa de compute que percorre a hierarquia "na mão".
4. **Medimos no M4**, que é o piso. A 4090 deve ser da ordem de dez vezes mais rápida (estimativa, não medida).
5. **Três desperdícios já medidos e ainda não corrigidos:** o ritmo dos quadros conta envios em vez de quadros, a física
   dá mais passos quando o quadro fica lento, e o estado de cada raio é grande demais para a banda de memória.

O que falta é uma camada de **reaproveitamento e orçamento**: resolução interna menor com reconstrução, cache de material
por páginas, traçado em meia resolução com acúmulo, e nível de detalhe de geometria por agrupamentos.

## 2. Onde o tempo vai hoje (M4, medido)

| O quê | Custo de GPU por quadro | Observação |
|---|---|---|
| Cena de tempestade inteira (041), 1280 × 720 | ~20 ms | ~50 quadros por segundo |
| Nuvens sozinhas, paradas | 2,3 ms | teto 3 ms |
| Nuvens com o sol no ritmo real | 2,78 ms | era 4,19 antes da rodada de otimização |
| Galeria de materiais, a maioria das famílias, 1440 × 960 | 7–14 ms | com céu e luz rebatida |
| Quadro com vidro (refração traçada) | ~36 ms | |
| Reflexo nítido dos opacos lisos | +4,5 a 5,5 ms | onde não havia traçado |
| Luz de área, três painéis | +7 a 11 ms | integrada por pixel, sem ruído |
| SSS | 0,2–4,3 ms | cresce com a área de tela coberta |
| Deslocamento de perto (triângulos de ~1 px) | 35–95 ms | 3 a 6 esferas grandes |

Leitura: cada recurso, sozinho, cabe ou quase cabe. O problema é a **soma**: uma cena com vidro, reflexo, luz de área,
SSS, deslocamento e luz rebatida passa de 100 ms no M4.

Ganhos já obtidos por otimização dirigida, que mostram o padrão do que funciona:

- Nuvens: 4,49 → 2,32 ms (paradas) e 4,19 → 2,78 ms (sol andando), sem mudar a imagem.
- A luz da marcha das nuvens num passe próprio, uma amostra por invocação: 1,37 → 0,87 ms.
- O traçado rodava sempre na tela inteira e com o máximo de rodadas; com a fila medida, um bloco.
- O teste raio–caixa acertava caixas vazias da malha adaptativa: 65 → 24 ms no quadro do relevo.

Nos quatro casos a causa era trabalho desperdiçado, não falta de capacidade.

## 3. Conferência das análises da outra sessão

Três documentos vieram de uma sessão de outro projeto. A v1 e a v2 são gerais, escritas sem ler o código. A v3 leu o
`clayflow`. Conferi no código, sem rodar nada, cada afirmação que muda uma decisão.

### O que procede (conferido)

| Afirmação da v3 | Conferido em | Resultado |
|---|---|---|
| As medidas são todas do M4 | `specs/039-tracado-em-ondas/baseline.md` | Procede |
| A física dá até 4 passos por quadro | `src/scene/time/Time.ts`, `maxStepsPerFrame: 4` | Procede |
| `inFlight` soma a cada envio, não a cada quadro | `GpuEngineCore.submit()` | Procede |
| Cada leitura de volta faz um envio próprio, com buffer de staging novo | `ResourceSystem`, `read:${readBatch++}` + `core.submit()` | Procede |
| O limite padrão é 2 quadros em voo, e o laço pára o quadro quando estoura | `Engine.ts` (`?? 2`), `GameLoop.tick` | Procede |
| A refração lê a fila de volta todo quadro | `RefractionFlow.measureQueue` | Procede, e **piorou na 011**: agora são duas leituras (`queueCount` e `roundCount`) |
| 256 bytes sem uso no registro custam +6 ms | `baseline.md`: 21,6 → 27,6 ms | Procede |
| O despacho indireto custa ~10× o direto no Chrome | `baseline.md`: 11,58 µs contra 1,12 µs | Procede |
| `f16` não é usado em nenhum shader | busca por `enable f16` | Procede |
| Não há reconstrução para resolução maior | busca por escala de resolução | Procede |
| Os vizinhos das partículas são lidos por índice (`particles[j]`) | `pbf_density_lambda.wgsl` | Procede. Não conferi se há reordenação periódica dos dados |
| Tanque de água: 43,7 ms; com 3 quadros em voo, 39,7 ms | `baseline.md` | Procede |

Não conferi: os 26 kernels de argumento, as 1001 chamadas de desenho da cena de 1k objetos, o custo de ~20 ms do
timestamp por passe, e a reconstrução do nível de cima da hierarquia a cada 8 quadros.

### O que não procede ou não se aplica

- **"Falta culling" (v1).** Existe, na GPU, com oclusão. A v3 já corrige.
- **"Ida e volta entre CPU e GPU como causa principal" (v1).** Os dados moram na GPU. O que existe é mais estreito: as
  leituras de volta ocupam vagas de quadro (abaixo).
- **Compute assíncrono, memória partilhada do grupo, ocupação por registradores, Nsight (v2).** São recursos e
  ferramentas de APIs nativas e da NVIDIA. O WebGPU tem uma fila só e não expõe nada disso. Valem só para uma medição
  nativa na 4090.
- **Texturas comprimidas (v2).** O motor é procedural; quase não há bitmap.
- **"O ECS copia componentes todo quadro" (v2, como hipótese).** Não: só as faixas alteradas sobem. A v3 confirma.
- **O motor `holos` e a coloração gerada por ele (v1, v2).** É de outro projeto.

### O que a conferência corrige nesta análise

1. **Eu escrevi que a CPU não é o gargalo. É verdade para a gravação (1,4 ms), mas há um gargalo de ritmo.** Cada leitura
   de volta conta como um quadro em voo. Com o limite em 2, uma leitura por quadro já segura o quadro seguinte, e a CPU
   e a GPU passam a andar em série. É a correção mais barata de todas.
2. **A 011 andou contra duas medidas antigas, sem eu notar:**
   - a refração passou a fazer duas leituras de volta por quadro em vez de uma;
   - os registros cresceram: o fechamento do material foi de 384 para 400 bytes, e o pedido por pixel de 2 para 4
     palavras. A medida da 039 diz que o traçado é limitado pela banda de memória, então isso tem custo.
3. **As rodadas da 041 e da 011 acrescentaram despachos indiretos com kernels de argumento.** O ganho medido em cada caso
   foi de milissegundos, contra microssegundos de custo, então valeu. Mas a regra da 039 (despacho direto com laço de
   passo de grade nas rodadas da onda) continua certa para despachos pequenos e repetidos.
4. **O tempo por passe engana no M4.** A v3 aponta que os passes se sobrepõem. Bate com o que se viu na 041: um passe
   que marcava 0,42 ms custava zero quando tirado.

## 4. As perguntas, uma a uma

### Falta culling?

Não. O motor tem descarte de objetos fora da vista e de objetos tapados, na GPU (`DrawCulling.ts`, com a hierarquia de
profundidade), descarte de partículas (`ParticleCulling.ts`) e páginas de sombra só onde há pedido. O culling evita
**desenhar** o que não se vê. Ele não reduz o custo dos passes de tela inteira (refração, reflexo, luz de área, SSS,
nuvens), que são a maior parte do tempo.

### Geometria, física e materiais são calculados em compute, separados do vertex e do fragment?

- **Geometria: sim.** As superfícies e a malha adaptativa são geradas por kernels de compute (`SurfaceFlow`) e gravadas
  em buffers. O vertex só lê.
- **Física: sim.** Solvers, partículas e fluidos são compute.
- **Culling, nuvens, traçado de raios, luz rebatida: sim**, compute.
- **Materiais: não.** O grafo do material é avaliado **no fragment**, por pixel, todo quadro, e de novo em cada ponto
  atingido por um raio. Anéis da madeira, trama, células, fissuras: tudo é recalculado a cada quadro, mesmo num objeto
  parado sob luz parada.

### Muda algo executar vertex e fragment só quando a câmera aponta para o objeto, deixando o resto pré-pronto?

A primeira metade já acontece: o que está fora da vista não é desenhado. A segunda metade, "deixar pré-pronto", é a ideia
que falta e a que mais rende:

- **Material pré-pronto:** avaliar o grafo do material uma vez para páginas de um atlas (na resolução que a tela pede) e,
  nos quadros seguintes, só ler. Recalcula-se a página quando o material, a escala ou a distância mudam. Encaixa na
  arquitetura de atlas e páginas que o motor já usa para sombra, cobertura das nuvens e cache de espalhamento.
- **Geometria pré-pronta:** a malha deslocada só precisa ser refeita quando a vista ou os parâmetros mudam. Vale conferir
  se hoje ela é refeita todo quadro.
- **Sombra pré-pronta:** páginas de sombra de objetos parados guardadas entre quadros.

O que não pode ficar parado fora da vista: a física (o mundo continua) e o que faz sombra ou reflete para dentro da
vista. Para a física, o caminho é ativação local e passo reduzido longe da câmera.

### 1. Os cálculos executam inteiramente na GPU

Sim, e isso está certo. A CPU só monta os comandos do quadro (1,4 ms no tanque, ~2,3 ms nas nuvens). Mas há um
gargalo de **ritmo** entre as duas: as leituras de volta (a fila da refração, as texturas virtuais, os contadores dos
contatos) contam como quadros em voo e seguram o quadro seguinte (seção 3). Outro ponto: muitos passes pequenos têm
custo fixo; juntar passes ajuda.

### 2. Outros jogos usam bem a GI e funcionam bem

Porque não fazem o que fazemos. Os três truques, combinados:

- **Resolução baixa:** a luz rebatida e os reflexos são calculados a meia ou a um quarto da resolução.
- **Acúmulo no tempo:** uma ou poucas amostras por pixel por quadro, somadas ao longo de dezenas de quadros, com um
  filtro que limpa o ruído.
- **Cache:** a luz é guardada em superfícies ou sondas e atualizada aos poucos (o Lumen do Unreal guarda a luz num atlas
  de "cartões" das superfícies), ou é pré-calculada no editor.

E, nas placas como a 4090, o percurso do raio é feito por **hardware próprio**. O WebGPU não expõe isso.

O motor já usa parte disso (sondas, acúmulo temporal, marcha das nuvens a um quarto). A refração, o reflexo, a luz de
área e o SSS ainda rodam na resolução cheia, com pouco reaproveitamento.

### 3. Não melhoramos isso ainda?

Em parte. Houve otimização dirigida por recurso (seção 2). Não houve ainda um trabalho **global** de desempenho: a "spec
curta de desempenho" está na fila e nunca rodou. As últimas rodadas da 011 priorizaram a aparência e acrescentaram custo
(reflexo, luz de área, deslocamento) sem orçamento por recurso.

### 4. Como melhorar a paralelização?

A GPU já roda tudo em paralelo. O ganho não está em "mais paralelo", está em **não desperdiçar o paralelo**:

- **Trabalho igual junto.** Num grupo de invocações, todas esperam a mais lenta. Separar por tipo de trabalho em listas
  compactas (foi o ganho da luz das nuvens e do desenho do mapa visto do sol).
- **Despacho pela contagem real**, não pela tela inteira.
- **Menos passes pequenos**, juntando os que leem os mesmos dados.
- **Raios em ondas compactadas** (a 039 já faz), mantendo os raios vivos juntos.

### 5. Por que esta espera? Como melhorar? Falta algo na arquitetura?

Há duas esperas diferentes:

- **Espera de preparação** (testes de minutos, quadros que demoram a aparecer): compilação de shaders. Cada material é um
  programa próprio; 72 materiais são dezenas de programas grandes, traduzidos e compilados. Mais o acúmulo da luz
  rebatida (a galeria espera 240 quadros). Remédios: preparação assíncrona com cache persistente dos programas; menos
  variantes (um programa que lê os parâmetros como dados, em vez de um por material).
- **Espera por quadro** (o tempo real em si): o que a seção 5 trata.

Coalescing, atlas, páginas e arena resolvem **memória, alocação e número de desenhos**. Não reduzem o custo por pixel. O
que falta é de outra natureza (seção 5).

### O ECS não está sendo efetivo?

Não há sinal de que o ECS seja o problema. Ele organiza os dados e os eventos do lado da CPU, e a CPU não é o gargalo. O
tempo está no trabalho por pixel da GPU, que independe do ECS. O que vale conferir (não medido): se os eventos de mudança
evitam de fato refazer malha, sombra e sondas do que não mudou.

## 5. O que falta: peças, em ordem de retorno estimado

### Antes das peças: três correções baratas, já apontadas por medida

Vêm da v3, conferidas no código (seção 3). São pequenas e não mudam a imagem.

- **A. Ritmo dos quadros.** Contar quadros em voo, não envios; pôr as cópias de leitura no próprio quadro, com staging
  reaproveitado; 3 quadros em voo por padrão. Medido na 039: 43,7 → 39,7 ms só com o terceiro quadro em voo.
- **B. Física que não cresce com o quadro lento.** Limitar a 1–2 passos por quadro com interpolação no desenho;
  reordenar as partículas por célula; corpos parados fora dos despachos.
- **C. Estado do raio compacto.** Registros menores (normais em octaedro, `f16`), mirando menos de 128 bytes por
  caminho. Medido na 039: o tamanho do registro pesa direto no tempo do traçado.

### As peças

Nenhuma destas está feita. A ordem é estimativa; o retorno real depende de medir.

1. **Resolução interna menor, com reconstrução temporal.** Desenhar a 50–67 % da resolução e reconstruir para a tela. É
   o que DLSS, FSR e o TSR do Unreal fazem. Reduz **todos** os custos por pixel de uma vez (a 67 %, cerca de 2,2 vezes
   menos pixels). O motor já tem antisserrilhado temporal, que é a base.
2. **Traçado em meia resolução com acúmulo e filtro partilhados.** Refração, reflexo e luz rebatida usando a mesma camada
   de acúmulo, em vez de cada um ter a sua. A v2 acrescenta o reaproveitamento de amostras no espaço e no tempo
   (ReSTIR) e uma hierarquia de raios com geometria simplificada, diferente da malha que se vê.
3. **Cache de material por páginas.** O material avaliado uma vez por página de atlas e reaproveitado; os raios leem o
   mesmo cache, em vez de reavaliar o grafo.
4. **Sombrear uma vez por pixel visível.** Um passe que grava "qual triângulo está em cada pixel" e sombreia depois. Hoje
   o desenho direto sombreia fragmentos que acabam tapados, e com triângulos de um pixel isso pesa.
5. **Nível de detalhe de geometria por agrupamentos.** Em vez de triângulos de um pixel em toda a superfície deslocada,
   uma hierarquia de agrupamentos escolhida por distância, também para a sombra. É a ideia do Nanite.
6. **Orçamento por recurso com qualidade adaptativa.** Cada recurso com um teto em milissegundos, e a qualidade (amostras,
   resolução, alcance) ajustada para caber. As nuvens já têm isso; o resto não.
7. **Preparação assíncrona e cache de programas**, para a espera de compilação.
8. **Traçado por hardware.** Fora do alcance do WebGPU no navegador hoje. O caminho seria o ambiente nativo (o motor já
   roda em Deno com wgpu), se e quando a consulta de raios estiver disponível ali. Não verificado.

## 6. Como chegar ao nível de um GTA VI

Com franqueza, são duas distâncias diferentes.

**Técnica de imagem.** O que se vê nos trailers (luz rebatida e reflexos por raios, nuvens volumétricas, água, pele com
SSS, cabelo em fios, multidões) é uma lista de técnicas. O motor já tem versões próprias de várias: céu físico, nuvens,
refração e reflexo traçados, luz rebatida, SSS, materiais em camadas, deslocamento, água com cáusticas. Faltam cabelo e
pelo, vegetação, terreno, personagens e animação, e mundo aberto com carregamento por regiões (todos na fila). E falta
a camada da seção 5, sem a qual essas técnicas não cabem juntas no quadro. Um jogo assim roda a 30 quadros por segundo
nos consoles, em resolução interna reduzida e reconstruída — não em resolução cheia.

**Conteúdo.** A maior parte da qualidade de um jogo desses vem de milhares de pessoas-ano de arte: modelos, materiais
feitos à mão ou escaneados, animação capturada, iluminação de cada cena. Isso não se alcança com técnica. A aposta do
motor é outra: conteúdo procedural e matemático. É um caminho legítimo, com um teto diferente — mundos coerentes e
ilimitados, com menos detalhe autoral.

Meta realista: **cenas pequenas e médias com as mesmas técnicas de imagem, a 60 quadros por segundo na 4090**. Para saber
a distância, o primeiro passo é medir na 4090.

## 7. Próximos passos sugeridos

1. **Medir na 4090, por passe**, duas ou três cenas (tempestade, galeria com vidro e reflexo, relevo). Sem esse número,
   tudo acima é estimativa. Depende de pedido do usuário (medição de desempenho só roda a pedido).
2. **Abrir a spec de desempenho começando pelas correções A, B e C** (ritmo dos quadros, passos da física, estado do
   raio). São baratas e já têm medida. Depois, as peças 1, 2 e 6 da seção 5 (resolução interna, acúmulo partilhado,
   orçamento por recurso), que valem para todos os recursos de uma vez.
3. **Cache de material por páginas** (peça 3) como spec própria, junto com o padrão por posição do objeto, que ficou
   pendente na 011.
4. Só depois: visibilidade por pixel e agrupamentos de geometria (peças 4 e 5), que mexem no desenho.

## 8. O que este documento não afirma

- Nenhum número da 4090 foi medido.
- A seção 3 foi conferida lendo o código, sem rodar nenhum teste. Os itens listados como "não conferi" seguem em aberto.
- A ordem de retorno da seção 5 é estimativa.
- Não foi conferido se malha, sombra e sondas de objetos parados são refeitas todo quadro.
- A disponibilidade de traçado por hardware no ambiente nativo não foi verificada.
- O que se diz de GTA VI vem do material público de divulgação, não de medida.
