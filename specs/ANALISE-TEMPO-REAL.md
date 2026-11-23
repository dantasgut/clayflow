# Análise: por que o tempo real ainda é difícil, e o que falta

Data: 2026-11-23. Escrita depois das specs 041 (nuvens) e 011 (biblioteca de materiais), em resposta a perguntas do
usuário. Os números são do Apple M4 (GPU integrada), medidos nos smokes desta fase. **Nada aqui foi medido na RTX 4090.**
Onde o texto fala da 4090, é estimativa e está marcado.

## 1. Resumo

O motor calcula tudo na GPU e já tem culling. A dificuldade com o tempo real não vem de falta de paralelismo nem do ECS.
Vem de quatro coisas somadas:

1. **Fazemos o cálculo caro e exato em todo pixel, todo quadro, na resolução cheia.** Jogos fazem o caro em resolução
   baixa, repartido por vários quadros, e reaproveitam o resultado.
2. **Não guardamos o que não muda.** O material procedural de um objeto parado é recalculado por pixel a cada quadro.
3. **O WebGPU não dá acesso ao traçado de raios por hardware.** A 4090 tem circuitos próprios para isso; o nosso traçado
   é um programa de compute que percorre a hierarquia "na mão".
4. **Medimos no M4**, que é o piso. A 4090 deve ser da ordem de dez vezes mais rápida (estimativa, não medida).

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

## 3. As perguntas, uma a uma

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

Sim, e isso está certo. A CPU só monta os comandos do quadro. Na medição das nuvens, a CPU gastava ~2,3 ms por quadro;
não é o gargalo. Um ponto a vigiar: muitos passes pequenos têm custo fixo de troca; juntar passes e despachar com a
contagem exata ajuda.

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
- **Espera por quadro** (o tempo real em si): o que a seção 4 trata.

Coalescing, atlas, páginas e arena resolvem **memória, alocação e número de desenhos**. Não reduzem o custo por pixel. O
que falta é de outra natureza (seção 4).

### O ECS não está sendo efetivo?

Não há sinal de que o ECS seja o problema. Ele organiza os dados e os eventos do lado da CPU, e a CPU não é o gargalo. O
tempo está no trabalho por pixel da GPU, que independe do ECS. O que vale conferir (não medido): se os eventos de mudança
evitam de fato refazer malha, sombra e sondas do que não mudou.

## 4. O que falta: peças, em ordem de retorno estimado

Nenhuma destas está feita. A ordem é estimativa; o retorno real depende de medir.

1. **Resolução interna menor, com reconstrução temporal.** Desenhar a 50–67 % da resolução e reconstruir para a tela. É
   o que DLSS, FSR e o TSR do Unreal fazem. Reduz **todos** os custos por pixel de uma vez (a 67 %, cerca de 2,2 vezes
   menos pixels). O motor já tem antisserrilhado temporal, que é a base.
2. **Traçado em meia resolução com acúmulo e filtro partilhados.** Refração, reflexo e luz rebatida usando a mesma camada
   de acúmulo, em vez de cada um ter a sua.
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

## 5. Como chegar ao nível de um GTA VI

Com franqueza, são duas distâncias diferentes.

**Técnica de imagem.** O que se vê nos trailers (luz rebatida e reflexos por raios, nuvens volumétricas, água, pele com
SSS, cabelo em fios, multidões) é uma lista de técnicas. O motor já tem versões próprias de várias: céu físico, nuvens,
refração e reflexo traçados, luz rebatida, SSS, materiais em camadas, deslocamento, água com cáusticas. Faltam cabelo e
pelo, vegetação, terreno, personagens e animação, e mundo aberto com carregamento por regiões (todos na fila). E falta
a camada da seção 4, sem a qual essas técnicas não cabem juntas no quadro. Um jogo assim roda a 30 quadros por segundo
nos consoles, em resolução interna reduzida e reconstruída — não em resolução cheia.

**Conteúdo.** A maior parte da qualidade de um jogo desses vem de milhares de pessoas-ano de arte: modelos, materiais
feitos à mão ou escaneados, animação capturada, iluminação de cada cena. Isso não se alcança com técnica. A aposta do
motor é outra: conteúdo procedural e matemático. É um caminho legítimo, com um teto diferente — mundos coerentes e
ilimitados, com menos detalhe autoral.

Meta realista: **cenas pequenas e médias com as mesmas técnicas de imagem, a 60 quadros por segundo na 4090**. Para saber
a distância, o primeiro passo é medir na 4090.

## 6. Próximos passos sugeridos

1. **Medir na 4090, por passe**, duas ou três cenas (tempestade, galeria com vidro e reflexo, relevo). Sem esse número,
   tudo acima é estimativa. Depende de pedido do usuário (medição de desempenho só roda a pedido).
2. **Abrir a spec de desempenho** com as peças 1, 2 e 6 da seção 4 (resolução interna, acúmulo partilhado, orçamento por
   recurso). São as que valem para todos os recursos de uma vez.
3. **Cache de material por páginas** (peça 3) como spec própria, junto com o padrão por posição do objeto, que ficou
   pendente na 011.
4. Só depois: visibilidade por pixel e agrupamentos de geometria (peças 4 e 5), que mexem no desenho.

## 7. O que este documento não afirma

- Nenhum número da 4090 foi medido.
- A ordem de retorno da seção 4 é estimativa.
- Não foi conferido se malha, sombra e sondas de objetos parados são refeitas todo quadro.
- A disponibilidade de traçado por hardware no ambiente nativo não foi verificada.
- O que se diz de GTA VI vem do material público de divulgação, não de medida.
