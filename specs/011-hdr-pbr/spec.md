# Feature Specification: HDR e materiais físicos por nós

**Feature Branch**: `feature/011-hdr-pbr`

**Created**: 2026-10-15

**Status**: Draft (revisada em 2026-10-16 após a 031: materiais por nós BSDF, OpenPBR como sub-grafo, luzes por
pontos de cena)

**Input**: User description: "HDR e modelo de material físico em camadas (spec 011, fase F4 do roadmap —
`011-hdr-pbr`). Escopo conforme linha da F4 em specs/ROADMAP.md: (1) desenho em HDR `rgba16float` sobre o MSAA 4× já
existente (008), com mapeamento de tons configurável (ACES, AgX, neutro) e exposição, gradientes sem faixas; (2) modelo
de material em camadas no padrão OpenPBR Surface: base Cook-Torrance (GGX, Smith, Fresnel) com cor/roughness/metallic,
especular com IOR e anisotropia (metal escovado, seda), camada de verniz/coat com rugosidade/cor/espessura própria,
transmissão com IOR/espessura/absorção/dispersão e refração do que está atrás (vidro, líquidos), parede fina translúcida
(cortina), sheen de tecido (veludo, algodão), iridescência de filme fino, subsuperfície no modelo (pele, cera, mármore;
passe na tela fica para a 014), emissão em HDR; usando cor e intensidade do pool de luzes (direcional, pontual, spot)
com atenuação física, matriz normal correta para escala não uniforme; a função `material` da 009 passa a devolver todas
as camadas; (3) biblioteca de materiais prontos ajustáveis e substituíveis: madeira crua e madeira envernizada, algodão,
lã, veludo, seda/cetim, jeans, tecido fino, couro, borracha, cerâmica/porcelana, plástico fosco/brilhante, metal polido
e escovado, pintura de carro, vidro, metal oxidado; padrões procedurais detalhados ficam para a 012; (4) material físico
da água (Fresnel, absorção Beer-Lambert, refração do fundo, especular HDR) aplicado à superfície da 017 e cáusticas
filtradas em HDR, suaves, sem blocos; (5) critério: superior ao Three.js (inclusive WebGPURenderer/
MeshPhysicalMaterial) em cenas de referência lado a lado, com medidas; nada de efeito falso. Requisitos gerais: Resource

- evento + Flow, sem helpers; motor agnóstico; cada símbolo WGSL definido uma vez; fixtures regravados apenas com
  justificativa; sem leitura de volta por quadro; bench sem regressão relevante e baseline regravado; smokes com medidas
  inclusive --dist; npm run ci verde; vídeos. Fora de escopo: texturas e deslocamento (012), clustered/IBL/sombras (013),
  TAA/bloom/SSS na tela/RenderTarget (014)."

## Contexto e Problema

O desenho atual não é físico. Levantamento na `develop` após o PR #46 (031):

| Lacuna                       | Estado atual (evidência)                                                                                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Cena em 8 bits               | A cor da cena, a cópia de MSAA e a cadeia de pós usam o formato do canvas (`FrameTargets.ts`, `PostFlow.ts`); brilhos acima do branco são cortados, gradientes mostram degraus |
| Saída sem codificação de cor | O forward escreve RGB linear direto no alvo, sem passo sRGB; o "tone mapping" (`1 − e^(−c·exposure)`) é um efeito opcional aplicado sobre LDR                                  |
| Iluminação Lambert fixa      | `brdf.wgsl`: Lambert + ambiente constante (0,18/0,82); rugosidade e metalicidade calculadas e ignoradas; o especular não existe                                                |
| Uma luz, só a direção        | Os pontos de cena (031) entregam só a direção da luz com sombra (ou uma direção padrão); cor, intensidade, tipo e alcance do pool nunca são lidos; não há luz spot             |
| Material com quatro campos   | A função `material` (009, código ou grafo da 031) devolve cor, rugosidade, metalicidade e emissão; não há nós de BSDF nem como compor verniz, vidro, tecido ou pele            |
| Água com aproximações        | `water_composite.wgsl`: especular Blinn-Phong, reflexo para uma cor constante, cópia do fundo em 8 bits e corte final em [0, 1]                                                |
| Cáusticas em blocos          | Mapa de 512² na vista da luz, borrão 3×3; de perto cada texel ocupa vários pixels e o padrão aparece em degraus                                                                |

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Imagem em alta faixa dinâmica (Priority: P1)

Quem monta uma cena vê brilhos fortes (o sol refletido na água, uma lâmpada, um metal polido) estourarem de forma suave
em vez de cortados num branco chapado; sombras escuras mantêm detalhe; gradientes de céu, água funda e superfícies
foscas aparecem contínuos, sem faixas. A pessoa escolhe o mapeamento de tons (ACES, AgX, neutro) e a exposição, como
numa câmera. Em telas HDR, a imagem usa a faixa extra da tela.

**Why this priority**: é a base de tudo o que é físico; materiais, água e cáusticas suaves dependem de valores acima de
1 e de precisão nos escuros.

**Independent Test**: uma cena com uma luz muito forte e um gradiente lento; medir que os valores acima de 1 chegam ao
mapeamento de tons, que o gradiente não tem degraus e que a exposição muda a imagem como esperado.

**Acceptance Scenarios**:

1. **Given** uma superfície que recebe 20× a luz de outra, **When** a cena desenha com exposição neutra, **Then** as duas
   são distinguíveis na imagem final (a mais forte não satura no corte; o mapeamento de tons comprime).
2. **Given** um gradiente lento de luminância ocupando a tela, **When** desenhado, **Then** nenhum passo entre pixels
   vizinhos excede 1 nível de código da saída e não há faixas (sequências iguais longas seguidas de salto).
3. **Given** a exposição aumentada em 1 EV, **When** a cena desenha, **Then** a luminância linear antes do mapeamento
   dobra (erro ≤ 1 %).
4. **Given** cada mapeamento de tons (ACES, AgX, neutro), **When** aplicado a uma rampa conhecida, **Then** a saída
   coincide com a curva de referência do operador (erro ≤ 1 nível de código).
5. **Given** um navegador e uma tela que suportam saída estendida, **When** a cena pede saída HDR, **Then** valores acima
   do branco de referência chegam à tela; sem suporte, cai no mapeamento de tons padrão sem erro.

---

### User Story 2 - Iluminação física com todas as luzes (Priority: P1)

Os materiais respondem à luz como na realidade: rugosidade e metalicidade mudam o brilho e o reflexo; a cor e a
intensidade de cada luz contam; luzes pontuais e spot iluminam com queda física pela distância e cone; a luz ambiente
vem de um céu e um chão definidos (hemisfério), não de uma constante escondida. Objetos com escala não uniforme têm as
normais corretas.

**Why this priority**: ativa os parâmetros que a função `material` da 009 já devolve e o pool de luzes que já existe, e
é o requisito do ROADMAP para a 011.

**Independent Test**: esferas variando rugosidade e metalicidade sob uma luz direcional conhecida, comparadas pixel a
pixel com a avaliação de referência do modelo; luzes pontuais e spot medidas pela queda.

**Acceptance Scenarios**:

1. **Given** uma esfera com material conhecido e uma luz direcional conhecida, **When** desenhada, **Then** a radiância
   em pontos amostrados coincide com a avaliação de referência do modelo (erro ≤ 2 % antes do mapeamento de tons).
2. **Given** uma luz pontual de intensidade I, **When** iluminando um plano, **Then** a irradiância cai com o inverso do
   quadrado da distância (erro ≤ 2 %), até o alcance definido, onde vai a zero suavemente.
3. **Given** uma luz spot com cone interno e externo, **When** ilumina um plano, **Then** dentro do cone interno a
   intensidade é plena, fora do externo é zero e entre eles a transição é suave.
4. **Given** várias luzes de cores diferentes, **When** iluminam a mesma superfície, **Then** as contribuições somam
   (luz vermelha + verde = amarelo na proporção das intensidades).
5. **Given** um material branco não absorvente em um ambiente uniforme branco (teste de forno), **When** desenhado com
   rugosidades de 0 a 1, **Then** a radiância refletida fica a ≤ 3 % da do ambiente (energia conservada, inclusive nas
   rugosidades altas).
6. **Given** um objeto com escala (1, 3, 1), **When** iluminado, **Then** as normais desenhadas coincidem com as
   analíticas (≤ 1°).
7. **Given** uma superfície brilhante com detalhe fino de geometria, **When** vista de longe, **Then** o brilho não
   cintila entre quadros (serrilhado especular controlado).

---

### User Story 3 - Material composto por nós (Priority: P1)

Quem define um material **compõe** o comportamento físico ligando nós, como no editor de shader do Blender: um nó por
espalhamento (difuso, especular de metal, especular de dielétrico, transmissão, parede fina, brilho de fibra,
subsuperfície, emissão) e nós de composição (misturar, somar, pôr uma camada sobre outra, filme fino, opacidade, normal
própria). Cada entrada pode vir de um valor ou de qualquer outro nó (ruído, curvatura, campo, tempo), então a madeira
envernizada é "difuso de madeira sob um dielétrico liso", o verniz pode ficar áspero onde o ruído quer, e dois
materiais se misturam por uma máscara. O OpenPBR Surface é um grupo de nós pronto entre outros, não o modelo do motor.

**Why this priority**: é o que distingue a apresentação de um desenho genérico, e o usuário rejeitou o material de
parâmetros fixos que ligam e desligam camadas ("liga e desliga com valores fixos não serve"); a 031 trouxe os grafos
de nós como padrão fundacional.

**Independent Test**: um grafo por nó de espalhamento e por nó de composição, cada um medido contra a propriedade
física que introduz; um grafo com entradas ligadas a ruído e curvatura; troca de valores sem recompilar.

**Acceptance Scenarios**:

1. **Given** um dielétrico liso em camada sobre um difuso rugoso, **When** iluminado, **Then** aparecem dois realces (o
   nítido de cima e o largo de baixo), e a base fica atenuada pela energia que a camada de cima reflete.
2. **Given** um nó de transmissão de IOR 1,5, **When** desenhado diante de um padrão, **Then** o padrão aparece deslocado
   conforme a refração, a reflexão em ângulo rasante cresce conforme Fresnel, e com espessura e cor de absorção o vidro
   escurece com a espessura (Beer-Lambert).
3. **Given** a transmissão com dispersão, **When** desenhada diante de bordas de alto contraste, **Then** as bordas
   refratadas mostram separação de cores coerente com o número de Abbe.
4. **Given** um nó de parede fina iluminado por trás, **When** visto de frente, **Then** a luz atravessa (translucidez)
   sem refratar o fundo.
5. **Given** um nó de brilho de fibra (sheen), **When** visto em ângulo rasante, **Then** a borda brilha mais que o
   centro, como veludo.
6. **Given** um especular anisotrópico com a tangente ligada a um nó, **When** iluminado, **Then** o realce se alonga
   perpendicularmente à tangente, e girar o vetor no grafo gira o realce.
7. **Given** um filme fino de espessura conhecida, **When** visto em ângulos diferentes, **Then** a cor do reflexo muda
   conforme a interferência para essa espessura e IOR.
8. **Given** um nó de subsuperfície, **When** iluminado de lado, **Then** a transição luz-sombra é mais suave e na cor
   do espalhamento do que a do difuso.
9. **Given** um nó de emissão com intensidade acima de 1, **When** desenhado, **Then** a emissão chega ao HDR acima do
   branco (sem corte antes do mapeamento de tons).
10. **Given** dois materiais misturados por uma máscara de ruído, **When** desenhados, **Then** cada região mostra o
    comportamento do seu material e a transição é contínua; a regra de fusão de lobos do mesmo tipo é a documentada.
11. **Given** um grafo de material, **When** um valor de nó muda a cada quadro, **Then** nada recompila; **When** a
    ligação muda, **Then** recompila em transição, sem quadro quebrado.
12. **Given** um grafo que usa só difuso e especular, **When** compilado, **Then** o shader não contém o código dos
    outros espalhamentos e custa o mesmo que o material pronto.
13. **Given** uma função `material` escrita para a 009 (código ou grafo devolvendo cor, rugosidade, metalicidade e
    emissão), **When** usada sem mudança, **Then** funciona, com o especular físico da base.

---

### User Story 4 - Água física e cáusticas suaves (Priority: P1)

A superfície da água da 017 passa a usar o mesmo modelo físico: Fresnel correto, reflexo especular em HDR (o sol
refletido estoura suave), refração do fundo em HDR, absorção e cor pela profundidade. As cáusticas no fundo aparecem
suaves e contínuas, sem blocos, mesmo vistas de perto.

**Why this priority**: o usuário apontou a água e as cáusticas "duras e pixeladas" como o principal defeito visual.

**Independent Test**: a cena do lago da 010 e o tanque com caixa submersa da 017; medir Fresnel, absorção e a
continuidade das cáusticas de perto.

**Acceptance Scenarios**:

1. **Given** a água vista de cima e em ângulo rasante, **When** desenhada, **Then** a fração refletida segue Fresnel
   para IOR 1,33 (≈ 2 % na normal, crescendo para ~100 % no rasante; erro ≤ 2 pontos percentuais).
2. **Given** uma água mais funda em uma região, **When** desenhada, **Then** a cor do fundo é atenuada conforme
   Beer-Lambert com o coeficiente configurado (erro ≤ 3 %).
3. **Given** o sol refletido na água, **When** desenhado, **Then** o realce passa do branco no HDR e é comprimido pelo
   mapeamento de tons, sem corte em [0, 1] antes disso.
4. **Given** as cáusticas no fundo vistas com a câmera perto (cada texel do mapa cobrindo ≥ 4 pixels), **When**
   desenhadas, **Then** não há degraus de texel: o padrão é contínuo (sem platôs com bordas retas).
5. **Given** as cáusticas, **When** a água se move, **Then** o padrão se move sem cintilar quadro a quadro além do que a
   própria superfície muda.

---

### User Story 5 - Biblioteca de materiais prontos (Priority: P2)

Quem monta a cena escolhe um material pronto — madeira crua, madeira envernizada (fosca ou brilhante, âmbar), algodão,
lã, veludo, seda/cetim, jeans, tecido fino, couro, borracha, cerâmica/porcelana, plástico fosco e brilhante, metal
polido e escovado, pintura de carro, vidro, metal oxidado, pele, cera, mármore. Cada um é um grupo de nós: usa inteiro,
ajusta os parâmetros expostos, abre e religa, ou usa como nó dentro de um grafo maior.

**Why this priority**: torna os nós de material utilizáveis sem conhecimento de óptica; depende das US2 e US3.

**Independent Test**: uma galeria com todos os materiais prontos sob a mesma luz; cada um verificado pelos nós que
deve ter e por valores físicos de referência (IOR, metalicidade, rugosidade dentro das faixas de medidas publicadas).

**Acceptance Scenarios**:

1. **Given** cada material pronto, **When** criado, **Then** tem os nós e os valores documentados (ex.: madeira
   envernizada = madeira crua sob um dielétrico liso; pintura de carro = condutor sob um dielétrico).
2. **Given** um material pronto, **When** a pessoa muda um parâmetro (ex.: cor do verniz), **Then** só esse parâmetro
   muda e o restante permanece.
3. **Given** a galeria, **When** desenhada, **Then** cada material é reconhecível pelo comportamento sob a luz (madeira
   crua fosca sem realce nítido; envernizada com realce nítido; veludo com borda brilhante; metal escovado com realce
   alongado; vidro transparente com refração).
4. **Given** um material pronto usado como nó, **When** misturado a outro por uma máscara ou com uma entrada ligada a
   outro nó, **Then** o grafo compila e desenha como qualquer grafo; a 012 liga padrões (veios, trama, flocos) às mesmas
   entradas.

---

### User Story 6 - Superior ao Three.js lado a lado (Priority: P2)

As mesmas cenas de referência são montadas na Clayflow e no Three.js (`WebGPURenderer` com `MeshPhysicalMaterial`), com
a mesma câmera, luzes e parâmetros, e comparadas por medidas e por imagem.

**Why this priority**: é o critério da F4 aprovado pelo usuário ("superior ao Three.js").

**Independent Test**: cenas de comparação no bench (galeria de materiais, metal e verniz sob luz forte, vidro, água),
medindo serrilhado, faixas, conservação de energia e cintilação.

**Acceptance Scenarios**:

1. **Given** a cena de galeria nas duas engines, **When** medida, **Then** a Clayflow tem faixas e erro de energia menores
   ou iguais aos do Three.js, e cintilação especular menor ou igual.
2. **Given** as cenas de comparação, **When** medidas no bench, **Then** o tempo de quadro da Clayflow não é pior que o
   do Three.js além da tolerância do bench.
3. **Given** as imagens lado a lado, **When** gravadas, **Then** são enviadas ao usuário em vídeo.

---

### Edge Cases

- Valores não finitos ou negativos vindos de uma função `material`: tratados como zero/limite, sem propagar NaN para o
  HDR (um pixel NaN não contamina a cadeia de pós).
- Emissão ou luz extremamente forte (> 65 000, limite do formato): limitada ao máximo do formato, sem infinito.
- Rugosidade 0 com luz pontual: o realce não desaparece nem vira um único pixel cintilante (rugosidade mínima efetiva).
- IOR igual a 1 na transmissão: o material vira invisível sem reflexo (correto fisicamente), sem divisão por zero.
- Transmissão sobre transmissão (vidro atrás de vidro): o vidro de trás aparece na refração do da frente com a
  aproximação documentada (sem traçado de raios em hardware no WebGPU); sem buracos.
- Muitas luzes além do limite do laço desta spec: as excedentes são ignoradas com aviso único e contagem exposta (a 013
  traz a iluminação clustered).
- Luz spot com cone interno maior que o externo: corrigido para o externo, com aviso.
- Transparentes em mais de duas camadas (três vidros enfileirados): a terceira em diante tem a aproximação documentada
  (o descasque cobre duas camadas sem ordenação na CPU).
- Grafo de material sem saída ou com erro: a entidade desenha com o material pronto, com o aviso/evento da 031.
- Lobos do mesmo tipo misturados (dois especulares de rugosidades diferentes na mesma camada): fundidos pela regra
  documentada.
- Navegador sem saída HDR estendida: cai no mapeamento de tons padrão em 8 bits com pontilhamento.
- MSAA desligado: o HDR continua funcionando (sem resolução de amostras).
- Partículas em sprite e partículas secundárias: iluminadas pelo mesmo modelo (impostor esférico), sem caminho Lambert
  paralelo.

## Requirements _(mandatory)_

### Functional Requirements

**HDR e saída**

- **FR-001**: A cor da cena, a cópia multiamostrada e a cadeia de pós DEVEM estar em ponto flutuante de 16 bits por
  canal; nenhum valor é cortado em [0, 1] antes do mapeamento de tons.
- **FR-002**: O mapeamento de tons DEVE ser o passo final da apresentação, configurável entre ACES, AgX e neutro (e
  linear para depuração), com exposição em EV, e a saída DEVE ser codificada em sRGB.
- **FR-003**: A saída em 8 bits DEVE ter pontilhamento para eliminar faixas.
- **FR-004**: Em navegador e tela com suporte, a saída DEVE poder ser HDR estendida; sem suporte, cai no padrão sem
  erro, com a escolha exposta.
- **FR-005**: Os efeitos de pós existentes DEVEM operar sobre o HDR (a reconstrução deles com profundidade e normais é
  da 014; esta spec não acrescenta efeitos falsos e remove o tone mapping sobre LDR).

**Iluminação**

- **FR-006**: O sombreamento DEVE ser Cook-Torrance (distribuição GGX, sombreamento-mascaramento de Smith correlacionado,
  Fresnel) com difuso físico, usando cor, rugosidade e metalicidade, e com compensação de múltiplo espalhamento para
  conservar energia nas rugosidades altas.
- **FR-007**: O sombreamento DEVE somar todas as luzes ativas (direcional, pontual e spot) até um limite documentado,
  usando cor, intensidade (unidades físicas documentadas), alcance com queda suave e cone (spot); as luzes chegam ao
  desenho pelos pontos de cena (031) — nenhum estágio de desenho conhece uma classe de luz.
- **FR-008**: DEVE existir a luz spot (cone interno e externo) e a luz ambiente de hemisfério (céu e chão), como
  Resources da cena; a constante de ambiente escondida deixa de existir.
- **FR-009**: A sombra direcional existente DEVE continuar valendo para a luz que a projeta; as demais luzes não têm
  sombra nesta spec (013).
- **FR-010**: As normais DEVEM usar a matriz normal (inversa transposta) para escala não uniforme.
- **FR-011**: O brilho especular DEVE ter controle de serrilhado (rugosidade ajustada pela variação da normal na tela).

**Material por nós**

- **FR-012**: O material DEVE ser composto por nós: nós de espalhamento (difuso com rugosidade, especular de condutor
  com tinta de borda, especular de dielétrico com IOR, ambos com anisotropia e tangente, transmissão com absorção e
  dispersão por número de Abbe, parede fina, brilho de fibra, subsuperfície, emissão) e nós de composição (mistura,
  soma, camada com atenuação por Fresnel, filme fino, opacidade, normal própria), com qualquer entrada ligável a outro
  nó; o OpenPBR Surface DEVE existir como grupo de nós pronto.
- **FR-013**: A transmissão DEVE refratar a imagem HDR do que está atrás conforme IOR e espessura, borrada conforme a
  rugosidade, e atenuar por Beer-Lambert, com duas camadas transparentes sem ordenação na CPU.
- **FR-014**: A subsuperfície DEVE estar no modelo (difusão aproximada no sombreamento: transição suave e cor de
  espalhamento); o passe de espalhamento na tela é da 014.
- **FR-015**: O shader de um material DEVE conter só os espalhamentos que o grafo usa; mudar valores não recompila,
  mudar a ligação recompila em transição; funções `material` da 009 continuam válidas.
- **FR-016**: O mesmo modelo DEVE iluminar malhas, superfícies paramétricas, geometrias de grafo, sprites de partículas
  e partículas secundárias; nenhum caminho Lambert paralelo permanece.
- **FR-017**: Valores não finitos ou fora de faixa vindos do grafo ou da função DEVEM ser saneados sem NaN no HDR.

**Biblioteca**

- **FR-018**: DEVE existir a biblioteca de materiais prontos listada na US5, cada um como grupo de nós com valores
  físicos documentados e parâmetros expostos, usável inteiro ou como nó de outro grafo, e serializável.

**Água e cáusticas**

- **FR-019**: A superfície da água DEVE usar o mesmo modelo (Fresnel por IOR, especular GGX em HDR, reflexo da luz
  ambiente de hemisfério, refração do fundo em HDR, absorção Beer-Lambert), sem corte em [0, 1].
- **FR-020**: As cáusticas DEVEM ser acumuladas e filtradas em HDR com reconstrução contínua (sem degraus de texel na
  vista de perto) e sem cintilação além da variação da superfície.

**Comparação e qualidade**

- **FR-021**: DEVEM existir cenas de referência montadas igualmente na Clayflow e no Three.js (`WebGPURenderer` +
  `MeshPhysicalMaterial`), com medidas de faixas, erro de energia, cintilação especular e tempo de quadro.
- **FR-022**: Nenhuma parte DEVE exigir leitura de volta por quadro.
- **FR-023**: As trajetórias físicas DEVEM continuar idênticas, bit a bit (a mudança é só de desenho); as fixtures de
  imagem que mudam com o HDR DEVEM ser regravadas e listadas com a justificativa visual.
- **FR-024**: Smokes com medidas (HDR, mapeamento de tons, faixas, BRDF contra referência, forno, luzes, normais,
  nós de material, água, cáusticas), no fonte e no build minificado; `bench:check` sem regressão relevante e baseline
  regravado; `npm run ci` verde.
- **FR-025**: Documentação de arquitetura, guias, ROADMAP e PENDENCIAS atualizados; vídeos para o usuário (galeria de
  materiais, água com o novo material e cáusticas, comparação com o Three.js).

### Key Entities

- **Alvo HDR da cena**: a cor da cena em ponto flutuante (com a versão multiamostrada) que todos os passes escrevem e a
  apresentação mapeia para a tela.
- **Apresentação (mapeamento de tons)**: operador (ACES, AgX, neutro, linear), exposição em EV, pontilhamento e modo de
  saída (padrão ou HDR estendido).
- **Luz**: direcional, pontual, spot (cone interno/externo) e ambiente de hemisfério, com cor, intensidade em unidades
  físicas e alcance; contribui para a iluminação da cena sem o desenho a conhecer.
- **Nó de espalhamento e de composição**: as peças do material (difuso, especulares, transmissão, parede fina, fibra,
  subsuperfície, emissão; mistura, soma, camada, filme fino, opacidade, normal).
- **Material**: um grafo dessas peças (ou o material pronto das constantes), avaliado por ponto da superfície.
- **Material pronto**: um grupo de nós com nome, valores documentados e parâmetros expostos.
- **Cena de referência**: a mesma cena montada na Clayflow e no Three.js para comparação medida.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Valores acima de 1 preservados até o mapeamento de tons: duas superfícies com 20× de diferença são
  distinguíveis na saída; nenhum corte antes do mapeamento.
- **SC-002**: Gradiente lento: nenhum passo entre pixels vizinhos maior que 1 nível de código; sem faixas.
- **SC-003**: Exposição: +1 EV dobra a luminância linear (erro ≤ 1 %); cada operador coincide com a curva de referência
  (≤ 1 nível de código).
- **SC-004**: BRDF contra a referência do modelo: erro ≤ 2 % na radiância amostrada para a grade de rugosidade ×
  metalicidade.
- **SC-005**: Teste de forno: radiância a ≤ 3 % do ambiente para rugosidades de 0 a 1.
- **SC-006**: Luz pontual com queda pelo inverso do quadrado (erro ≤ 2 %); spot com os cones corretos; cores somam.
- **SC-007**: Normais com escala não uniforme a ≤ 1° da analítica.
- **SC-008**: Cada nó de espalhamento e de composição demonstra a sua propriedade física (dois realces na camada,
  deslocamento e Fresnel no vidro, Beer-Lambert com a espessura, separação de cores na dispersão, borda do sheen, realce
  alongado da anisotropia, cor angular do filme fino, transição suave da subsuperfície, emissão acima de 1, mistura por
  máscara contínua); grafo com só difuso e especular custa o mesmo que o material pronto; 60 s mudando valores → zero
  recompilações.
- **SC-009**: Água: Fresnel para IOR 1,33 com erro ≤ 2 pontos percentuais; absorção com erro ≤ 3 %; realce do sol acima
  de 1 no HDR.
- **SC-010**: Cáusticas de perto (texel ≥ 4 pixels): 0 platôs de texel com borda reta detectados; variação temporal
  limitada à da superfície.
- **SC-011**: Comparação com o Three.js: faixas, erro de energia e cintilação especular da Clayflow ≤ os do Three.js em
  todas as cenas de referência; tempo de quadro dentro da tolerância do bench.
- **SC-012**: Trajetórias físicas idênticas bit a bit; fixtures de imagem regravadas apenas as listadas, cada uma com
  justificativa.
- **SC-013**: `bench:check` sem regressão relevante; smokes no fonte e com `--dist`; `npm run ci` verde.
- **SC-014**: Vídeos (galeria de materiais, água com cáusticas suaves, comparação lado a lado com o Three.js) enviados
  ao usuário.

## Assumptions

- O MSAA 4× da 008 continua o padrão; o HDR é aplicado sobre ele.
- A luz ambiente desta spec é o hemisfério (céu e chão uniformes); o céu físico, a iluminação por imagem e os reflexos
  de ambiente são da 013. O hemisfério é uma aproximação, não luz rebatida: a iluminação global (fótons do sol e do
  céu rastreados na cena, reunidos em sondas) é da 033, depois da 013 e da 014, e entra como mais uma contribuição ao
  ponto `scene_lighting`, sem mudar materiais nem desenho. O teste de forno usa o hemisfério uniforme, em que ele é
  exato.
- Sem traçado de raios em hardware no WebGPU: a refração usa a imagem do que está atrás (espaço de tela) e a
  transmissão sobre transmissão é aproximada; a limitação é documentada.
- Unidades físicas das luzes: direcional em lux, pontual e spot em candela, emissão em nits; a exposição padrão é
  escolhida para que as cenas atuais pareçam equivalentes.
- O limite de luzes no laço desta spec é fixo e documentado; a iluminação clustered (013) o elimina.
- Padrões visuais dos materiais (veios, trama, poros, flocos visíveis) e mapas de textura/deslocamento são da 012; a 011
  entrega os nós e versões uniformes coerentes de cada material pronto.
- O fechamento avaliado no shader tem um número fixo de lobos por tipo (como os "bins" do Blender EEVEE); lobos do
  mesmo tipo na mesma camada são fundidos pelo peso, regra documentada e medida.
- O `StandardMaterial` continua com cor, rugosidade e metalicidade — as constantes do material pronto e os padrões dos
  nós; as camadas vêm do grafo, não de campos fixos.
- TAA, bloom em cadeia de mips e a reconstrução de SSAO/FXAA são da 014; esta spec não os altera além de passá-los
  para HDR.
- As fixtures de imagem mudam necessariamente (8 bits linear sem sRGB → HDR com mapeamento e sRGB); as de estado
  (trajetórias, contatos, comportamento de fluido) não mudam.
