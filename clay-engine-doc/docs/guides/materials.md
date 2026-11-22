---
sidebar_position: 18
title: Materiais
---

# Materiais — a aparência pelo grafo de nós (specs 011 e 034)

Material é a **aparência** de uma superfície: como ela espalha, transmite e emite luz. No motor, toda aparência termina
num **fechamento** (`Closure`): a soma de lobos de espalhamento com pesos — difuso, especular de dielétrico, condutor,
verniz, brilho de fibra, subsuperfície, transmissão, translucidez, filme fino e emissão —, como os BSDF do Blender e o
OpenPBR. O desenho, a luz global, a refração e as cáusticas avaliam o mesmo fechamento.

Há três níveis de autoria, do mais simples ao mais livre:

| Nível                         | Como                                                                  | Para                                       |
| ----------------------------- | --------------------------------------------------------------------- | ------------------------------------------ |
| Constantes                    | `StandardMaterial` (albedo, rugosidade, metalicidade)                 | o opaco comum                              |
| Grafo de nós                  | `MaterialFunction({ graph })` com `nodes.bsdf.*`, `nodes.closure.*`   | vidro, água, verniz, padrões por pixel     |
| Código WGSL                   | `MaterialFunction({ code })` que devolve `Closure` ou `SurfaceParams` | o que a biblioteca de nós ainda não tem    |

## `StandardMaterial`

```ts
import { BoxGeometry, StandardMaterial, Transform } from 'clayflow/web';

app.world.insert(
    new BoxGeometry({ size: [1, 1, 1] })
        .add(new Transform({ position: [0, 0.5, 0, 1] }))
        .add(new StandardMaterial({ albedo: [0.8, 0.2, 0.1, 1], roughness: 0.4, metallic: 0 })),
);
```

- `albedo` (RGBA linear; o alfa é a opacidade), `roughness` (padrão 0,5), `metallic` (padrão 0), `doubleSided`
  (padrão `false`: as faces de trás são descartadas).
- O fechamento das constantes é a base do OpenPBR: difuso mais o especular de dielétrico de IOR 1,5, misturados ao
  condutor pela metalicidade, com a rugosidade nos dois.
- Mudar `data` vale no quadro seguinte, sem recompilar.

Outros materiais desenham o que não é superfície iluminada pelo fechamento: `WireframeMaterial` (as arestas da
geometria como linhas), `PointSpriteMaterial` (cada partícula ou vértice como uma esfera em sprite) e
`DiffuseMaterial` (as partículas secundárias de um fluido: spray, espuma e bolhas).

## O grafo de materiais

Uma `MaterialFunction` anexada à entidade, ao lado do `StandardMaterial`, troca as constantes por um grafo. O grafo
termina em `nodes.output.closure`; até compilar, a entidade usa as constantes.

```ts
import { MaterialFunction, NodeGraph, nodes } from 'clayflow/web';

// Madeira envernizada: o difuso por um ruído da posição, o verniz por cima.
const look = new MaterialFunction({
    graph: new NodeGraph({
        nodes: {
            s: nodes.input.surfaceSample(),
            grain: nodes.noise.gradient3.with({ scale: 12, offset: [0, 0, 0] }),
            paint: nodes.color.ramp.with({ color_a: [0.35, 0.18, 0.08], color_b: [0.55, 0.32, 0.15], low: -0.5, high: 0.5 }),
            wood: nodes.bsdf.diffuse,
            varnish: nodes.bsdf.dielectric.with({ ior: 1.5, roughness: 0.05 }),
            coated: nodes.closure.layer,
            out: nodes.output.closure,
        },
        links: [
            ['s.world_position', 'grain.p'],
            ['grain.value', 'paint.t'],
            ['paint.color', 'wood.color'],
            ['varnish.value', 'coated.top'],
            ['wood.value', 'coated.base'],
            ['coated.value', 'out.closure'],
        ],
        output: 'out.value',
    }),
});
entity.add(new StandardMaterial()).add(look);

look.values.varnish_roughness = 0.2;  // `nó_parâmetro`: sem recompilar
```

A montagem, a validação, os sub-grafos e o JSON do grafo estão em [Grafos de nós](./node-graphs.md). O shader de cada
material contém só os lobos que o grafo usa (`lobeMask`, pelas marcas `lobe:<nome>` dos nós); funções com o mesmo código
compartilham o pipeline.

Padrões de superfície (xadrez, ruído, rampas) são nós avaliados por pixel na GPU, no próprio material: um chão
quadriculado é um plano com `nodes.pattern.checker2`, não uma entidade por casa.

### Nós de espalhamento (`nodes.bsdf`)

Um lobo cada. Toda entrada aceita um valor (o parâmetro de mesmo nome) ou uma ligação de outro nó.

| Nó                    | Entradas (padrão)                                                                                     |
| --------------------- | ----------------------------------------------------------------------------------------------------- |
| `bsdf.diffuse`        | `color` (0,8), `roughness` (0: Lambert; acima, Oren–Nayar com conservação de energia)                  |
| `bsdf.conductor`      | `color` (F0, 0,9), `edge_tint` (F82, branco), `roughness` (0,2), `anisotropy` (0, em [−1, 1]), `tangent` |
| `bsdf.dielectric`     | `ior` (1,5), `tint` (branco), `roughness` (0,1), `anisotropy`, `tangent` — a energia que não reflete segue para os lobos de baixo |
| `bsdf.transmission`   | `ior` (1,5), `color` (branco), `depth` (0), `abbe` (0), `roughness` (0) — a refração traçada ([Refração](./refraction.md)) |
| `bsdf.translucent`    | `color` (0,8): parede fina translúcida (cortina, folha), a luz de trás espalhada, sem refratar o fundo  |
| `bsdf.sheen`          | `color` (branco), `roughness` (0,3): brilho de fibra (veludo, algodão)                                  |
| `bsdf.subsurface`     | `color` (0,8; 0,5; 0,4: o albedo da superfície), `radius` por canal em **mm** (1; 0,5; 0,25: o caminho livre médio), `scale` (1: unidades do mundo por metro) — pele, cera, mármore ([Subsuperfície](#subsuperfície-a-luz-que-entra-no-corpo)) |
| `bsdf.emission`       | `color` (branco), `luminance` (1, em nits; sem teto até o limite do formato HDR)                        |

### Nós de composição (`nodes.closure`)

| Nó                        | O que faz                                                                                                  |
| ------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `closure.add`             | soma `a` e `b` (um dielétrico fica sobre o difuso)                                                         |
| `closure.mix`             | mistura `a` e `b` por `t` em [0, 1] (0 = `a`): a máscara entre dois materiais                              |
| `closure.layer`           | o especular de `top` como verniz sobre `base`, atenuando-a pelo que reflete e por `top_color`, com `top_weight` |
| `closure.thinFilm`        | filme fino (iridescência) de `thickness` nm e `ior` sobre o especular de base                              |
| `closure.opacity`         | opacidade `alpha` em [0, 1]: o material vai ao passe dos transmissivos                                     |
| `closure.normal`          | normal própria dos lobos de base (de um nó, como `surface.ripple` ou `surface.bump`, ou de um campo)        |
| `closure.mediumPriority`  | prioridade do meio na sobreposição de volumes transmissivos (o vidro dentro da água)                       |
| `closure.thinWalled`      | a transmissão como parede fina, de espessura zero (vidraça, bolha)                                         |

Lobos do mesmo tipo que se somam fundem os parâmetros pelo peso (a rugosidade em α², cores e direções lineares).
Parâmetros não finitos desligam o lobo; pesos e cores negativos vão a zero; a emissão é limitada ao máximo do formato
HDR. Nenhum NaN chega à imagem.

### OpenPBR como nó

`nodes.material.openpbr` é o OpenPBR Surface 1.1 montado com os nós acima, como um sub-grafo pronto (não o modelo do
motor). Os parâmetros têm os nomes da norma:

```ts
const paint = new MaterialFunction({
    graph: new NodeGraph({
        nodes: {
            pbr: nodes.material.openpbr.with({
                base_color: [0.6, 0.02, 0.02],
                base_metalness: 0,
                coat_weight: 1,
                coat_roughness: 0.03,
            }),
            out: nodes.output.closure,
        },
        links: [['pbr.value', 'out.closure']],
        output: 'out.value',
    }),
});
```

Base (`base_weight`, `base_color`, `base_metalness`, `base_diffuse_roughness`), especular (`specular_weight`,
`specular_color`, `specular_roughness`, `specular_ior`, `specular_anisotropy`), transmissão (`transmission_weight`,
`transmission_color`, `transmission_depth`, `transmission_abbe`), subsuperfície (`subsurface_weight`,
`subsurface_color`, `subsurface_radius` em mm, `subsurface_scale` em unidades por metro), verniz (`coat_weight`, `coat_color`, `coat_roughness`, `coat_ior`), fuzz
(`fuzz_weight`, `fuzz_color`, `fuzz_roughness`), filme fino (`thin_film_weight`, `thin_film_thickness`,
`thin_film_ior`), emissão (`emission_luminance`, `emission_color`) e geometria (`geometry_opacity`,
`geometry_thin_walled`).

### Biblioteca de materiais prontos (`Materials`, `nodes.material`)

Vinte e três materiais prontos (spec 011, US5), cada um um sub-grafo de ponto sobre os nós acima, com valores físicos
publicados e os parâmetros relevantes expostos. Três usos:

```ts
import { MaterialFunction, Materials, NodeGraph, nodes } from 'clayflow/web';

// 1. Inteiro: a fábrica devolve a MaterialFunction (o grafo de um nó), com os valores que quiser mudar.
entity.add(Materials.woodVarnishedGloss({ coat_color: [1, 0.85, 0.6] }));

// Depois de criado, um valor muda no quadro seguinte, sem recompilar: `material_<parâmetro>`.
const paint = Materials.carPaint();
paint.values.material_base_color = [0.05, 0.2, 0.6];

// 2. Como nó de um grafo maior: madeira crua e metal escovado misturados por um ruído.
const mixed = new MaterialFunction({
    graph: new NodeGraph({
        nodes: {
            s: nodes.input.surfaceSample(),
            a: nodes.material.woodRaw,
            b: nodes.material.metalBrushed,
            n: nodes.noise.gradient3.with({ scale: 3 }),
            x: nodes.closure.mix,
            out: nodes.output.closure,
        },
        links: [
            ['s.world_position', 'n.p'],
            ['a.value', 'x.a'],
            ['b.value', 'x.b'],
            ['n.value', 'x.t'],
            ['x.value', 'out.closure'],
        ],
        output: 'out.value',
    }),
});

// 3. Com uma entrada ligada: todo parâmetro exposto é também uma entrada — aqui a cor vem de um xadrez.
const checkered = new MaterialFunction({
    graph: new NodeGraph({
        nodes: {
            s: nodes.input.surfaceSample(),
            c: nodes.pattern.checker3.with({ scale: 2 }),
            ramp: nodes.color.ramp.with({ color_a: [0.8, 0.05, 0.05], color_b: [0.05, 0.05, 0.8] }),
            p: nodes.material.plasticGloss,
            out: nodes.output.closure,
        },
        links: [
            ['s.world_position', 'c.p'],
            ['c.value', 'ramp.t'],
            ['ramp.color', 'p.color'],
            ['p.value', 'out.closure'],
        ],
        output: 'out.value',
    }),
});
```

Um valor para um parâmetro que o material não expõe lança `NodeGraphError`. Materiais criados pela mesma fábrica
compartilham o pipeline; os valores são por entidade. Os grafos serializam (`toJSON`/`fromJSON` com o
`defaultNodeRegistry`).

Cada material tem a **estrutura** que o nome promete, calculada por pixel na GPU pelos nós de padrão
(`pattern.weave`, `pattern.knit`, `pattern.cells`, `pattern.rings`, `pattern.grain` — ver
[Grafos de nós](./node-graphs.md)) sobre o uv do objeto (o padrão anda com o objeto), com o relevo na normal
(`surface.bump`; nos de relevo em milímetros, `surface.reliefNormal`), filtrado pela largura do pixel (de
longe o detalhe vai à média, sem serrilhar) e sem emenda onde o uv dá a volta. Os que têm padrão expõem
`pattern_scale` (`vec2f`, repetições do padrão por unidade de uv; (1, 1)): numa esfera, `(2, 1)` deixa o padrão
quadrado no equador; numa peça maior, um valor maior mantém o tamanho do fio ou do veio.

```ts
entity.add(Materials.denim({ pattern_scale: [2, 1] })); // numa esfera
entity.add(Materials.woodRaw({ pattern_scale: [3, 1] })); // um tampo de 3 × 1: o veio do mesmo tamanho nos dois sentidos
```

| Material | Estrutura (nós) | Parâmetros (padrão) | Fonte dos valores |
| -------- | --------------- | ------------------- | ----------------- |
| `woodRaw` | dielétrico + difuso; anéis de crescimento (`pattern.rings`, a fibra ao longo de u: corte tangencial, com os arcos da "catedral", anéis de largura irregular e linhas onduladas) na cor do lenho inicial ao tardio, fibra e poros (`pattern.grain` alongado); lixada, quase lisa — o relevo é o da fibra | `color` (0,45; 0,28; 0,15), `late_color` (0,27; 0,15; 0,07), `roughness` 0,7, `ior` 1,53, `diffuse_roughness` 0,6, `relief`, `fiber_relief`, `pattern_scale` | celulose, n_D 1,53–1,55 |
| `woodRough` | `woodRaw` na cor, mais cinzenta e áspera (tábua serrada, exposta ao tempo), com o tom em manchas e faixas e o relevo em milímetros (`relief.woodRough`): o lenho tardio saliente, a face irregular, a fibra levantada, as frestas e os riscos ao longo do veio (escuros no fundo) e os poros abertos — na normal e, com `Displacements.woodRough()`, na geometria | `color` (0,37; 0,3; 0,23), `late_color` (0,2; 0,15; 0,105), `roughness` 0,9, `ring_height` 0,8 mm, `wear_height` 1,2 mm, `fiber_height` 0,3 mm, `crack_depth` 3 mm, `cavity` 0,25, `scale` 1, `pattern_scale` | — |
| `woodVarnishedGloss` | `woodRaw` (anéis, fibra e poros) sob dielétrico em camada: o verniz liso por cima do veio, com o realce próprio; o verniz molha a madeira (a base sem especular próprio, a cor mais escura e saturada) | `base_color`, `base_late_color`, `base_roughness`, `coat_color` (1; 0,8; 0,5), `coat_roughness` 0,04, `coat_ior` 1,5, `coat_weight` 1, `pattern_scale` | verniz de poliuretano, n ≈ 1,5 |
| `woodVarnishedMatte` | o mesmo | `coat_roughness` 0,35, `coat_color` (1; 0,9; 0,7) | verniz com fosqueante |
| `cotton` | difuso + brilho de fibra, sem especular (fosco e macio); tela 1/1 (`pattern.weave`, 110 fios) com o relevo dos fios torcidos (os cabos de cada fio, `strand`), a penugem (`pattern.grain` fino) borrando o contorno do fio e as faixas de fios mais grossos e mais finos ao longo da urdidura | `color` (urdidura), `weft_color` (trama), `sheen_color` 0,25, `sheen_roughness` 0,9, `diffuse_roughness` 1, `relief`, `pattern_scale` | Estevez e Kulla 2017 (sheen "Charlie") |
| `wool` | difuso + brilho de fibra forte e largo; tricô em ponto meia (`pattern.knit`, 30 colunas de pontos em V) de fio grosso e torcido, mesclado e felpudo; o relevo em milímetros (`relief.wool`: o fio de 1,4 mm e a penugem) na normal e, com `Displacements.wool()`, na geometria | `color` (0,24; 0,15; 0,09), `sheen_color`, `sheen_roughness` 0,9, `diffuse_roughness` 1, `height` 1,4 mm, `scale` 1, `pattern_scale` | idem |
| `denim` | difuso + brilho de fibra; sarja 3/1 (120 fios): a urdidura índigo por cima da trama crua, na diagonal; o desgaste — onde o pano dobra (a curvatura convexa da superfície, nas geometrias com geometria diferencial) o índigo da casca do fio gasta e o miolo claro aparece, em manchas | `color` índigo, `weft_color` cru, `sheen_roughness` 0,85, `wear_color` (0,3; 0,36; 0,48), `wear_low` 5, `wear_high` 22 (curvatura, por unidade) | idem |
| `velvet` | difuso escuro + brilho de fibra, sem especular: o centro escuro e fosco, a borda rasante com um halo claro e macio; o pelo penteado — `pattern.grain` largo e suave inclina de leve a normal do pelo (o halo se desloca em regiões largas) e um fino dá o granulado | `color` (0,085; 0,006; 0,022), `sheen_color` (0,6; 0,07; 0,17), `sheen_roughness` 0,45, `diffuse_roughness`, `nap`, `pile`, `pattern_scale` | idem (pelo em pé: o brilho só de lado) |
| `silk` | difuso + dielétrico anisotrópico + brilho de fibra; cetim 4/1 (150 fios), a tangente do brilho na direção da fibra do fio à vista (`fiber` da trama por `surface.direction`: o eixo do fio com a torção) — o realce corre ao longo do fio e pelas dobras do pano | `color`, `weft_color`, `roughness` 0,3, `anisotropy` 0,8, `ior` 1,56, `sheen_color`, `sheen_roughness`, `relief`, `pattern_scale` | fibroína, n ≈ 1,56 |
| `sheerFabric` | difuso misturado à parede fina translúcida + brilho de fibra; tela aberta (60 fios, metade do passo sem fio): a luz passa inteira pelos vãos | `color`, `weft_color`, `translucency` 0,5, `sheen_color`, `sheen_roughness`, `relief`, `pattern_scale` | — |
| `leather` | dielétrico + difuso; o grão (`pattern.cells`, 64 células com sulcos), fosco nos sulcos e liso nos platôs, com rugas largas; o relevo em milímetros (`relief.leather`) na normal e, com `Displacements.leather()`, na geometria | `color`, `roughness` 0,42 (os platôs), `ior` 1,5, `diffuse_roughness`, `height` 0,35 mm (os sulcos), `wrinkle_height` 0,5 mm, `scale` 1, `pattern_scale` | colágeno e acabamento, n ≈ 1,5 |
| `rubber` | dielétrico + difuso; grão fino de relevo leve | `color` 0,03, `roughness` 0,75, `ior` 1,519, `relief`, `pattern_scale` | poli-isopreno, n_D 1,519 |
| `ceramic` | corpo difuso com as pintas do ferro (`pattern.cells`) sob o esmalte em camada, de espessura irregular | `color`, `roughness` 0,08 (o esmalte), `ior` 1,5, `diffuse_roughness`, `glaze_color`, `pattern_scale` | esmalte de silicato |
| `porcelain` | dielétrico + subsuperfície | `color` (0,9; 0,9; 0,87), `radius` (0,3; 0,27; 0,22) mm, `scale` 1, `roughness` 0,05, `ior` 1,5 | esmalte de silicato; raio estimado (curto: só a borda fina deixa passar luz) |
| `plasticMatte` | dielétrico + difuso; a textura de molde (grão fino em relevo) | `roughness` 0,6, `ior` 1,49, `relief`, `pattern_scale` | polipropileno/PMMA, n_D 1,49 |
| `plasticGloss` | dielétrico + difuso, liso | `roughness` 0,08, `ior` 1,49 | PMMA, n_D 1,49 |
| `metalPolished` | condutor, liso: o que se vê é o reflexo do ambiente — nítido (o céu, o horizonte, o chão, os vizinhos) pelo reflexo traçado numa cena com a estrutura de raios (ver "Reflexo nítido dos lisos"); sem ela, borrado (as sondas da `GlobalIllumination` ou o hemisfério céu/chão) | `color` (F0 0,912; 0,914; 0,920), `edge_tint` (F82 0,970; 0,979; 0,988), `roughness` 0,05, `anisotropy` 0, `tangent` | alumínio do exemplo OpenPBR do MaterialX |
| `metalBrushed` | condutor anisotrópico com a tangente ao longo de u; os riscos da escova (`pattern.grain` alongado 125 : 1) na rugosidade e na normal | `color`, `edge_tint`, `roughness` 0,14, `scratch_roughness` 0,36, `anisotropy` 0,8, `relief`, `pattern_scale` | alumínio de `open_pbr_aluminum_brushed.mtlx` |
| `carPaint` | três camadas: o pigmento (difuso saturado e escuro), os flocos de condutor pequenos (`pattern.cells`, 240 por unidade do padrão), cada um com a inclinação e o tom dele — brilhos pontuais em volta do realce —, e o verniz espelhado em camada com a casca de laranja leve (`pattern.grain` na normal dele); a cor vai da clara de frente (`flake_color`) à escura e saturada rasante (`flake_edge_tint`) | `base_color` (0,36; 0,008; 0,012), `flake_color` (0,62; 0,02; 0,025), `flake_edge_tint` (0,22; 0; 0,01), `flake_roughness` 0,18, `flake_weight` 0,6, `flake_tilt` 0,24, `coat_color`, `coat_roughness` 0,02, `coat_ior` 1,5, `coat_weight` 1, `orange_peel` 0,0005, `pattern_scale` | base de condutor sob verniz de `open_pbr_carpaint.mtlx`; pigmento difuso sob os flocos |
| `metalOxidized` | chapa de aço com ferrugem: o metal que sobra liso e refletivo (escurece e fica áspero perto da ferrugem) misturado ao óxido em pó (difuso, do quase preto ao castanho, ao alaranjado e a pontos amarelados) pela máscara — manchas largas (`pattern.grain` de cinco oitavas), riscos que escorrem ao longo de v e pites (`pattern.cells`), mais o avanço `oxidation`; a ferrugem em relevo: a crosta granulada (`relief`) e a borda inchada (`swell`) | `color` (F0 do ferro 0,562; 0,565; 0,578), `roughness` 0,13 (o metal limpo), `oxide_color` (0,26; 0,085; 0,022), `oxide_roughness` 0,95, `oxidation` 0,55, `relief`, `swell`, `pattern_scale` | Real-Time Rendering 4ª ed., tabela 9.2 |
| `glass` | dielétrico + transmissão | `ior` 1,52, `roughness` 0, `color`, `depth` 0, `abbe` 58 | vidro sodo-cálcico |
| `skin` | dielétrico + subsuperfície | `color` (0,63; 0,44; 0,34), `radius` (0,91; 0,60; 0,52) mm, `scale` 1, `roughness` 0,45, `ior` 1,4 | Jensen et al. 2001 (skin2: R_d e ℓ = 1/(σ_s′ + σ_a)) |
| `wax` | dielétrico + subsuperfície | `color` (0,9; 0,82; 0,62), `radius` (2,8; 2,0; 1,2) mm, `scale` 1, `roughness` 0,3, `ior` 1,44 | parafina, n_D 1,44; raio estimado (uma vela de 2 cm deixa passar ~7 % do vermelho) |
| `marble` | dielétrico + subsuperfície; os veios (as linhas em que um `pattern.grain` de cinco oitavas passa por zero) na cor do corpo | `color`, `vein_color`, `radius` (0,46; 0,38; 0,33) mm, `scale` 1, `roughness` 0,1, `ior` 1,5, `pattern_scale` | Jensen et al. 2001 (mármore) |
| `jade` | dielétrico + subsuperfície | `color` (0,36; 0,62; 0,38), `radius` (0,9; 1,8; 1,0) mm, `scale` 1, `roughness` 0,08, `ior` 1,61 | nefrita, n ≈ 1,61; raio estimado (o verde vai mais longe) |
| `milk` | dielétrico + subsuperfície | `color` (0,91; 0,88; 0,76), `radius` (0,39; 0,31; 0,26) mm, `scale` 1, `roughness` 0,03, `ior` 1,35 | Jensen et al. 2001 (wholemilk); serve de sabão branco ou plástico leitoso |

O relevo usa as tangentes do uv da amostra (`dpdu`, `dpdv`), que existem no desenho; nos acertos dos raios (a
iluminação global, o que se vê através de um vidro, o `sheerFabric`) o padrão de cor continua e o relevo some. Os
padrões seguem o uv da geometria: onde ele converge (os polos da esfera) o padrão aperta, e a filtragem o leva à média
ali. `plasticGloss`, `metalPolished`, `porcelain`, `skin`, `wax`, `jade`, `milk` e `glass` são lisos (o que se vê neles é
a luz e o ambiente). `glass` e `sheerFabric` são transmissivos: o que está atrás vem da refração traçada
([Refração](./refraction.md)).

## Relevo e deslocamento (spec 011, T115)

O relevo na normal só inclina a luz: a superfície continua lisa, a silhueta é a da forma e o relevo não faz sombra em
si mesmo. Nos materiais de relevo forte — `woodRough`, `leather`, `wool` — a altura é dada em **milímetros** e pode
virar **geometria**: a mesma função de altura (`nodes.relief.<nome>`) inclina a normal no material e, pela
`DisplacementFunction` da entidade, move os vértices de uma `ParametricSurface` na GPU.

```ts
// Uma bola de madeira bruta de 20 cm de diâmetro numa cena em que 1 unidade = 18 cm (5,5 unidades por metro).
const values = { pattern_scale: [2, 1], scale: 5.5 };
world.insert(
    new ParametricSurface({
        preset: 'sphere',
        params: [0.55],
        adaptive: { patches: [32, 16], maxLevel: 5, screen: 0.0022 }, // segmentos de ~2 px
    })
        .add(new StandardMaterial())
        .add(new Transform({ position: [0, 0.55, 0, 1] }))
        .add(Materials.woodRough(values)) // a cor e a normal do relevo
        .add(Displacements.woodRough(values)), // o mesmo relevo na geometria
);
```

- **Unidades**: as alturas são em milímetros (`ring_height`, `crack_depth`, `height`…) e `scale` é a escala do mundo
  em unidades por metro (1: cena em metros) — a mesma convenção do raio da subsuperfície. Passe os mesmos valores
  (`scale`, `pattern_scale`, as alturas) ao material e ao deslocamento.
- **Onde vale**: a `DisplacementFunction` desloca `ParametricSurface` (a superfície pronta ou a de uma
  `SurfaceFunction`; a malha uniforme ou a adaptativa). Nas malhas de vértices fixos (`SphereGeometry`, `BoxGeometry`)
  o material sozinho dá o relevo na normal.
- **Quando é geometria e quando é normal**: os padrões filtram pelo que quem os lê resolve. Na geometria, a largura é o
  passo da malha: o detalhe menor que dois segmentos não entra nos vértices. No material, a largura é a do pixel: esse
  detalhe continua na normal, e some na média quando fica menor que o pixel. Com a malha adaptativa, `screen` é a
  fração da altura da imagem que um segmento pode ocupar (0,0022 a 960 linhas: ~2 pixels): de perto os segmentos
  encolhem e mais relevo vira geometria; de longe o mesmo objeto fica com o relevo na normal e, mais longe, liso.
  `maxLevel` e `patches` dão o teto (2^`maxLevel` segmentos por retalho).
- **Quem vê**: os vértices deslocados ficam no buffer da geometria — o desenho, as sombras (o mapa de sombra virtual) e
  os raios (a luz rebatida, o reflexo e a refração traçados) leem a mesma geometria. A normal dos vértices é a da
  superfície sem o relevo; a inclinação vem do material (`surface.reliefNormal`), e por isso o material de mesmo nome
  deve acompanhar o deslocamento. Nos acertos dos raios o material não tem as tangentes do uv: ali a normal é a lisa.
  O colisor de superfície não vê o deslocamento.
- **Custo**: a malha é refeita quando a superfície, os valores ou a câmera mudam (`refreshDistance`), não a cada
  quadro; o desenho e os raios pagam os triângulos. Os números medidos estão em `specs/011-hdr-pbr/tasks.md` (T115).
- **Relevo próprio**: qualquer padrão serve — `surface.relief` converte a altura e o gradiente de um padrão em
  milímetros, relevos somam-se com `math.add3`, `surface.reliefNormal` vai ao `closure.normal` do material e
  `surface.displacement` é a saída da `DisplacementFunction` (exemplo em [Grafos de nós](./node-graphs.md)).

`Displacements` tem um deslocamento por relevo pronto: `woodRough` (`ring_height`, `wear_height`, `fiber_height`,
`crack_depth`), `leather` (`height`, `wrinkle_height`) e `wool` (`height`, `fluff_height`), todos com `pattern_scale` e
`scale`.

## Tecidos: o fio e o pano (spec 011, T116)

Os tecidos de trama (`cotton`, `denim`, `silk`, `sheerFabric`) e o tricô (`wool`) tratam o fio como um cilindro de
fibras torcidas: a seção redonda dá a normal e a sombra entre os fios; a torção (`twist` do padrão) dá os cabos do fio
(`strand`: as faixas em hélice, visíveis de perto) e a direção da fibra à vista (`fiber`), que é a tangente do brilho
da seda — o realce quebra em tracinhos de fio em fio e, num pano com dobras, corre ao longo delas. A penugem (um grão
fino em relevo e o brilho de fibra) borra o contorno do fio no algodão e na lã e dá o halo claro na borda; no veludo o
halo aparece na borda e em cada dobra.

A escala manda no que se vê. Com o fio perto do tamanho real (centenas de fios no pano), a trama fica abaixo do pixel:
o que se lê do tecido é o caimento, o brilho, as faixas dos fios mais grossos e, no jeans, o desgaste claro nas cristas
das dobras (a curvatura vem da geometria diferencial: use uma `ParametricSurface` com `differential: true`). Com o
padrão ampliado (`pattern_scale` menor), aparecem o ligamento, o volume e os cabos de cada fio.

## Reflexo nítido dos lisos (spec 011, T114)

O metal polido, o verniz, o plástico brilhante e o esmalte mostram o ambiente como um espelho: o céu, o horizonte, o
chão e os vizinhos, com as bordas nítidas. Numa cena com a estrutura de raios (`RayScene`: a da `GlobalIllumination`
ou a dos transmissivos), cada pixel de um opaco cujo lobo especular (ou o verniz) é liso pede um raio na direção
refletida — pela normal do lobo, com o relevo e a casca de laranja — e o que o raio acha (o opaco com a luz direta, a
sombra e a luz rebatida dele; o céu; o que se vê através de um vidro) entra no lugar da luz indireta da cena naquele
lobo, pelo peso dele (o Fresnel do metal por canal, os 4 % do verniz que crescem para a borda).

- **Quanto de espelho**: rugosidade até 0,08, todo o lobo pelo raio; de 0,08 a 0,16, a mistura com a luz indireta; acima,
  só a luz indireta (as sondas, o hemisfério). O lobo anisotrópico (o metal escovado) não é espelho.
- **O sol** não vem pelo raio: é a luz direta no lobo (o realce), como antes — no metal polido, o ponto que estoura.
- **Custo**: um raio por bloco de 2 × 2 pixels lisos por quadro (parado, cada pixel fica com o valor exato dele em até 6
  quadros). Sem `RayScene` ou com `renderer.lightPaths.reflection = false`, nada roda e o lobo fica com a luz indireta.
- **Limites**: um reflexo só (o espelho visto num espelho mostra a luz indireta do segundo); as bordas do que é
  refletido se alisam pelo antisserrilhado temporal (com MSAA ficam em degraus, uma amostra por pixel); só entidades com
  função `material` (o `StandardMaterial` de constantes fica com a luz indireta).

```ts
app.defaults.renderer.lightPaths.reflection = false; // desliga o reflexo traçado dos opacos
```

## Subsuperfície: a luz que entra no corpo

Pele, cera, mármore, jade e leite não refletem a luz no ponto em que ela chega: ela entra, espalha-se dentro do corpo e
sai em volta. O lobo `bsdf.subsurface` (e os materiais prontos `skin`, `wax`, `marble`, `porcelain`, `jade`, `milk`)
segue o perfil de difusão de Christensen e Burley 2015, com três parâmetros:

| Parâmetro | Unidade | O que é |
| --------- | ------- | ------- |
| `color` | — | o albedo da superfície: a fração da luz que volta, por canal (a "cor" do material sob luz uniforme) |
| `radius` | **milímetros**, por canal | o caminho livre médio do espalhamento, ℓ = 1/(σ_s′ + σ_a): quanto a luz anda dentro do corpo; na pele o vermelho vai mais longe |
| `scale` | unidades do mundo por metro | a escala da cena: 1 se uma unidade é um metro, 100 se é um centímetro, 1000 se é um milímetro |

O raio é físico, em milímetros: ele só aparece na imagem quando o objeto tem poucos centímetros na cena. Uma cabeça de
20 cm modelada com 0,2 unidade (`scale` 1) mostra o terminador macio e a orelha acesa; a mesma malha com 20 unidades
precisa de `scale: 100`. Uma esfera de 1 m de pele fica igual a um difuso — como ficaria de verdade.

```ts
entity.add(Materials.skin()); // a cena em metros
entity.add(Materials.wax({ scale: 100 })); // a cena em centímetros
entity.add(Materials.marble({ scale: 100, radius: [0.9, 0.76, 0.66] })); // um mármore mais translúcido
```

O que o desenho faz com um material desses (sem nada a ligar: o primeiro que entra na cena liga os passes; sem
nenhum, nada é alocado nem preparado):

- **Difusão entre pixels.** A luz direta que chega a cada pixel do material (com a sombra) é espalhada pelos vizinhos
  pelo perfil, por canal: o raio em mm vira pixels pela escala do mundo e pela profundidade. A passagem da luz para a
  sombra fica macia e, na pele, avermelhada; uma sombra projetada sobre a cera perde a borda. Só a luz difusa é
  espalhada — o brilho especular fica nítido por cima. A luz rebatida (`GlobalIllumination`) não é espalhada de novo: ela
  já é lisa nessa escala.
- **Luz que atravessa.** Em contraluz, a luz de uma `DirectionalLight` com `castShadow: true` atravessa as partes
  finas: a espessura do corpo entre a luz e o ponto vem do mapa de sombra dela a cada quadro, e a luz sai atenuada pelo
  mesmo perfil (¼ e^(−t/d) + ¾ e^(−t/3d), com d = ℓ/s) — a orelha acesa contra o sol, a vela, a placa fina de mármore.
  Luzes sem sombra (pontuais, spot, o céu) não atravessam: o motor não conhece a espessura para elas.
- **Nos raios** (o que se vê pelo vidro, a luz rebatida): o ponto com subsuperfície responde como o difuso do mesmo
  albedo — o perfil inteiro somado no ponto, com a mesma energia.

A qualidade e o custo estão no renderizador: `renderer.subsurface.enabled` (desligado, o lobo responde só no ponto) e
`renderer.subsurface.samples` (amostras do perfil por pixel: 16, 12 e 8 nos perfis alto, médio e baixo; os conjuntos
se alternam a cada 4 × 4 pixels, e cada pixel recebe 16 vezes esse número).

Limites que valem saber: a difusão é feita na tela — duas peças diferentes encostadas e no mesmo plano trocam luz, e a
luz que entraria por uma parte fora da tela não chega; a espessura é medida ao longo da direção da luz (uma placa
inclinada parece mais grossa do que é); quase sem absorção (albedo acima de 0,9, o leite), o perfil de Burley perde a
cauda longa da difusão real (6 % da energia sai mais perto do que deveria); com uma `CameraFunction` de projeção
própria, a difusão não é desenhada.

## Imagens nos materiais: texturas virtuais (spec 034, T060c)

Uma imagem de material (a cor de uma pintura, de um tijolo, de um terreno) entra como `VirtualImage` e é lida no grafo
pelo nó `nodes.image.virtual`. O motor não guarda a imagem nem processa texels fora da GPU: a **fonte** é da aplicação
(o arquivo, a rede ou a memória dela, como o disco nas engines) e responde por evento aos pedidos do motor, só com a
cópia dos bytes. Na GPU só existem as páginas que os quadros pedem, num atlas compartilhado pelas `VirtualTextures` da
cena — a imagem pode ser maior que a memória reservada a ela.

```ts
import { MaterialFunction, NodeGraph, nodes, VirtualImage, VirtualTextures } from 'clayflow';

const wall = new VirtualImage({ width: 8192, height: 8192, wrap: 'repeat' }); // só o tamanho e o endereçamento
const cache = new VirtualTextures({ images: [wall], atlasPages: 16 }); // 16 × 16 páginas de 128² (2048²)
world.insert(cache);

// A fonte (aplicação): o nível 0 decodificado do arquivo e os níveis que a GPU prepara e entrega.
const levels: Uint8Array[] = [pixels]; // RGBA de 8 bits em sRGB
app.events.on('virtualTextureLevel', (e) => {
    if (e.textures === cache) keep(levels, e); // guardar o retângulo do nível e.level (cópia)
});
app.events.on('virtualTextureRequest', (e) => {
    if (e.textures !== cache) return;
    // O retângulo (e.x, e.y, e.width, e.height) do nível e.level, linha a linha; fora do nível, e.wrap.
    app.events.emit('virtualTextureDelivery', { textures: cache, request: e.request, texels: copy(levels, e) });
});

const material = new MaterialFunction({
    graph: new NodeGraph({
        nodes: { img: nodes.image.virtual.with({ image: 0 }), out: nodes.output.surfaceParams },
        links: [['img.color', 'out.base_color']],
        output: 'out.value',
    }),
});
```

- **Preparação na GPU**: na entrada da imagem, o `VirtualTextureFlow` pede à fonte o nível 0 em blocos de até 1024² (um
  por quadro, o seguinte depois da leitura de volta) e a GPU reduz cada bloco aos dez níveis seguintes (`vt_prepare.wgsl`:
  a média 2 × 2 em luz linear, por ladrilhos de 32² na memória do grupo e depois o resto do bloco, como o redutor de um
  passo da AMD); cada nível reduzido volta à fonte (`virtualTextureLevel`) para ela guardar, como a preparação do
  arquivo das engines, e a rodada seguinte parte do último nível. A imagem nunca fica inteira na GPU. Com a pirâmide
  inteira na fonte, a média (o nível de 1 × 1) e a marca de preparada vão ao cabeçalho, e as páginas passam a ser pedidas;
  antes disso o nó devolve preto.
- **Páginas**: 120² texels de conteúdo com borda de 4 (128² no atlas `rgba8unorm`); o pedido de uma página é o retângulo
  de 128² com a borda (fora do nível, a volta ou a borda presa, pelo endereçamento da imagem). A cor
  (`colorSpace: 'srgb'`, o padrão) é filtrada em luz linear pelo nó (cada texel decodificado antes do bilinear); o dado
  linear (`colorSpace: 'linear'`: rugosidade, metal, normais, máscaras) pelo hardware.
- **Leitura**: o nível pelas derivadas do uv (a pegada do pixel; no acerto de um raio, o cone), a página residente mais
  fina a partir dele e a mistura entre os dois níveis em volta. Sem página residente, a média da imagem.
- **Pedidos**: o nó marca as páginas que queria; o `VirtualTextureFlow` do quadro seguinte aloca as que faltam (do nível
  mais grosso ao mais fino, até `budget` por quadro; despeja as não pedidas há mais tempo quando o atlas está cheio), a
  lista volta à CPU, cada página é pedida à fonte (`virtualTextureRequest`) e a resposta (`virtualTextureDelivery`, agora
  ou depois) é copiada no atlas. A página só vale carimbada na época da série por páginas do atlas.
- **Medidas** (smoke `virtualTextures`, M4; imagem de 3000 × 2400, 12 níveis): a preparação leva 28 quadros, no máximo
  0,40 ms de GPU num quadro; a pirâmide da GPU é a da referência f64 (`vtPyramid`) sem diferença na imagem linear e a
  menos de um degrau de 8 bits em 0,04 % dos canais na sRGB. O `VirtualTextureFlow` custa 0,009 ms por quadro com a cena
  parada (a lista é lida um quadro em 8) e 0,3 ms andando, o mesmo nos três perfis. A leitura direta da referência e a
  imagem pelas páginas diferem até 0,47 % (RMS 0,08 %) — os 8 bits do atlas. As páginas que faltam chegam em 4 a 12
  quadros.
- Uma imagem acrescentada depois (`cache.addImage(img)` devolve o índice) é preparada e recomeça a tabela; as já
  preparadas seguem preparadas.

## Materiais transmissivos

Um grafo com lobo de transmissão, opacidade ou translucidez faz da entidade um **transmissivo**: ela vai ao passe dos
transmissivos, o que está atrás dela vem da refração traçada, e a cena ganha a estrutura de raios e as cáusticas sem
mais nada a fazer. O vidro, a água e a prioridade dos meios estão em [Refração](./refraction.md).

## Em código WGSL

Quando falta um nó, a função pode ser escrita em WGSL — a mesma assinatura que o grafo gera:

```ts
const ceramic = new MaterialFunction({
    code: /* wgsl */ `
fn material_fn(s: SurfaceSample, m: StandardMaterial, data: MaterialFnParams) -> Closure {
    let glaze = closure_dielectric(1.5, vec3f(1.0), 0.05, 0.0, vec3f(0.0));
    return closure_add(closure_diffuse(m.albedo.rgb, 0.0), glaze);
}`,
    lobes: ['diffuse', 'specular'], // os lobos que o código produz: o shader é especializado só com eles
});
```

A forma da 009 (`-> SurfaceParams`: cor base, rugosidade, metalicidade, emissão) continua aceita e vira a base do
OpenPBR. Funções do ponto `material` são as da 009: validação, troca só quando compila e `extensionRejected`
([Shaders — pontos de extensão](./shaders.md)).

## Material e física

Material é só aparência. As propriedades físicas das partículas de um corpo (densidade, viscosidade, coesão) ficam no
`ParticlePhysics` da cena, e as da superfície de um sólido para a água que o molha, no
`SurfacePhysics`. Um `FluidBody` com um material transmissivo é água que se vê; o mesmo corpo com
`PointSpriteMaterial` mostra as partículas.
