# Conclusões da conversa de 2026-10-16 — composição por nós

Registro da conversa que levou da spec 011 (material OpenPBR) à spec 031 (grafos de nós e contratos de shader
estruturados). Decisões em vigor e direções para fases futuras.

## 1. O material fixo foi um erro de desenho

- O primeiro plano da 011 ancorou o material no OpenPBR como **struct fixo com interruptores** (pesos de camada ligados
  ou desligados, ordem de camadas fixa) e uma função `material` que só ajustava valores dessa lista. Isso não é
  material composto.
- Motivo real da escolha: caminho de menor resistência — o `StandardMaterial` já era um struct fixo num pool, com um
  pipeline por classe; um uber-shader encaixava sem mexer na estrutura. O padrão da indústria dava aparência de
  credibilidade.
- O que vale no OpenPBR é a **física entre camadas** (energia que o verniz tira da base, escurecimento, cor do verniz
  pela espessura, conservação de energia, defaults calibrados, compatibilidade MaterialX/USD, imagens de referência).
  Por isso ele entra como **sub-grafo pronto**, montado com primitivas (dielétrico, condutor, fuzz, filme fino,
  transmissão, subsuperfície, emissão, `layer`, `mix`) — nunca como o modelo de material.
- O Three.js já tem materiais por nós (TSL): para a F4 ser "superior ao Three.js", o grafo é obrigatório.

## 2. Premissa do motor: composicionalidade

- O motor foi desenhado em camadas claras (C1–C4), extensíveis e amigáveis para programar qualquer coisa de forma
  rápida e fotorrealista: **entidades** (dado tipado por schema), **slots** (o que um estágio consome, resolvido pela
  C2) e **Flows** (estágios com estado e transições por evento).
- Passo extra: **composição por grafos de nós**, estilo Blender, mantendo os dados encapsulados mas flexíveis. Com os
  nós como base: cenas composíveis, geometria procedural em árvore, materiais e, mais adiante, física.

## 3. Dois níveis de nó

1. **Nós de ponto** — funções por amostra (pixel, vértice, partícula, célula): ruído, mistura, BSDF, campo, máscara.
   O compilador **funde** a cadeia numa única função dentro do shader; cada nó avaliado uma vez por amostra. A função
   da 009 é um grafo de um nó.
2. **Nós de conjunto** — operam sobre conjuntos inteiros (malhas, partículas, pools): gerar, subdividir, distribuir,
   instanciar, ordenar, reduzir, passos de solver. Cada um vira passe(s) de compute; arestas são buffers. **O grafo de
   conjunto compilado é um Flow**: entradas e saídas são slots, intermediários alocados pela C2.

Entradas de nós de conjunto recebem sub-grafos de ponto, fundidos no kernel do nó (ex.: densidade = ruído × curvatura).
O grafo é um Resource: parâmetros num registro tipado gerado da forma; valor novo não recompila; topologia nova
recompila em transição. Sub-grafos funcionam como nós reutilizáveis (node groups); o grafo é serializável.

Sobre usar Flows para materiais: a intuição vale, mas um grafo de material é avaliado milhões de vezes por quadro — a
maior parte precisa ser compilada num shader só; o Flow entra para o que é por conjunto ou para o que é caro e estático
(gravado em compute e lido pelo shader).

## 4. Acoplamento dos WGSL (auditoria na `develop` após o PR #45)

O núcleo de structs gerados (005) e de layouts inferidos (006) está bem resolvido, mas o contrato entre estágios e
shaders ainda tem o acoplamento do legado:

- ligação por nome de variável em texto (`caustic_map`, `shadow_map`, `lights` ligados por string no `ForwardFlow`);
- `@group/@binding` escolhidos à mão e repetidos (`worlds` em 10 arquivos, `cameras` e `field_records` em 8, `lights`
  e `shadow_matrices` em 6, com índices diferentes);
- o forward conhece água e sombra (lógica de cáusticas dentro do `forward.wgsl`; `ForwardFlow` importa `WaterSurface`
  e `ShadowFlow`; quatro estágios recriam os mesmos substitutos de sombra e luz);
- índices de grupo fixos no código de desenho; adaptadores da 009 escolhendo ligações para caber no grupo do hospedeiro;
- globais implícitos do hospedeiro, não conferidos na montagem (o erro só aparece no compilador do driver);
- constantes repetidas entre TS e WGSL (grupo 64 em 80 kernels; sentinela `0xFFFFFFFF` com 5 nomes; "sem profundidade
  de água" valendo `1e9` e `1e8`);
- fonte remendada por `replace`; listas posicionais sem tipo; corpos duplicados entre pronto, adaptador e validação da
  009; parâmetros num registro de bits com teto de 32 escalares; WGSL da água na camada de elementos.

Um grafo construído sobre esse contrato multiplicaria esses defeitos. Por isso a limpeza entra na mesma spec.

## 5. Decisão: spec 031 antes da F4

- Spec **`031-node-graphs`** (branch `feature/031-node-graphs`, fase nova **F3b Composição por nós** no ROADMAP;
  número fora da sequência para não renumerar as seguintes), commitada em 1564242.
- Histórias: (1) contratos de shader estruturados — recursos declarados pelos módulos, ligações atribuídas pelo motor,
  globais implícitos rejeitados, pontos de cena para luz/sombra/atenuação, estágios sem importar estágios, constantes
  com fonte única; (2) nós de ponto fundidos; (3) nós de conjunto compilados num Flow; (4) grafo como Resource,
  sub-grafos e serialização; (5) biblioteca de nós base; (6) arquitetura documentada e migração completa.
- Critérios centrais: zero ligações à mão, globais implícitos, importações entre estágios e constantes duplicadas;
  **fixtures de imagem e trajetória iguais bit a bit**; grafo de ponto com custo igual ao código escrito à mão; grafo de
  conjunto sem leitura de volta; bench sem regressão.
- Consumidores: 011 (reescrita como materiais por nós, OpenPBR como sub-grafo), 012 (procedurais), `032-geometry-nodes`
  (nova, F8, base de terreno/vegetação/criaturas) e F5 (física por nós).
- **Por enquanto segue a spec 031 como está.** O plano (`/speckit-plan`) é o próximo passo.

## 6. Respostas às dúvidas (estado atual do código)

- **Geometria**: nem toda é criada em compute. Primitivas (caixa, esfera, plano, paramétrica da CPU) são geradas na CPU
  e enviadas uma vez; a `ParametricSurface` (009/010) é escrita só pela GPU, com malha adaptativa e contagem indireta;
  partículas, nuvens de pontos e superfícies moles são escritas pela física em compute; a superfície do fluido é
  reconstruída na tela, sem malha.
- **Materiais**: os dados vão à GPU num pool; a avaliação é no **fragment shader** (`fs_main` → `material_eval`, com a
  `MaterialFunction` da 009 embutida). Nada de material roda em compute hoje.
- **Quando o material precisa de compute**: quando tem **estado que evolui** do quadro anterior (ferrugem que se
  espalha, superfície que seca, acúmulo, reação-difusão), quando precisa da **vizinhança** (gradiente, desfoque), quando
  é **caro e muda pouco** (gravado em textura com mipmaps) ou quando é **compartilhado com a física**. Função do
  momento (tempo, posição, curvatura, campo) resolve no fragment, já dinâmica.
- **Material de arame** (`WireframeMaterial`): sem compute. As arestas de feição são pares de índices (`wireEdges`); o
  vertex shader descobre a aresta pelo `vertex_index`, lê os dois vértices do storage e monta um quad de `lineWidth`
  pixels; o fragment suaviza a borda com `fwidth` + `smoothstep`. Lê o vértice como `array<f32>` com deslocamento de 8
  floats à mão (um dos acoplamentos da 031).

## 7. Direção para fases futuras (não incorporada à 031)

- **Tudo processado na GPU.**
- **Shader misto** como padrão: compute mantém estado e o que é por conjunto ou caro; o fragment compõe a aparência.
- Referência de experiência: **mudança morfológica** (um cubo vira esfera), **texturas que mudam dinamicamente**, o
  **próprio espaço mudando** de euclidiano para hiperbólico ou esférico, **torção (twist) do espaço** — uma experiência
  "psicodélica", ou no estilo
  do jogo _Layers of Fear_ (ambientes que se transformam enquanto o jogador observa).
- Esses pontos orientam 032 (geometria por nós), 012 (procedurais em compute), F6/019 (espaços curvos) e F5, e serão
  tratados quando o usuário mandar — não alteram a 031 agora.
