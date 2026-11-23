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
| `closure.glints`          | brilhos pontuais do especular de base: os flocos menores que o pixel acendem um a um (`cells` e `count` de `pattern.glints`; `roughness` a do espelho de cada floco) — ver "Brilhos pontuais" |
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

Sessenta e oito materiais prontos (spec 011, US5), cada um um sub-grafo de ponto sobre os nós acima, com valores físicos
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
(`pattern.weave`, `pattern.knit`, `pattern.cells`, `pattern.rings`, `pattern.grain`, `pattern.shingles`,
`pattern.veins`, `pattern.glints` — ver
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
| `woodRough` | `woodRaw` na cor, mais cinzenta e áspera (tábua serrada, exposta ao tempo), com o tom em manchas e faixas e o relevo em milímetros (`relief.woodRough`): o lenho tardio saliente, a face irregular, a fibra levantada, as frestas e os riscos ao longo do veio (escuros no fundo) e os poros abertos — na normal e, com `Displacements.woodRough()`, na geometria | `color` (0,31; 0,26; 0,21), `late_color` (0,2; 0,16; 0,125), `roughness` 0,9, `ring_height` 0,3 mm, `wear_height` 1,2 mm, `fiber_height` 0,5 mm (mais os sulcos da fibra gasta, 2,4 mm), `crack_depth` 3 mm, `cavity` 0,25, `scale` 1, `pattern_scale` | — |
| `woodVarnishedGloss` | carvalho claro sob verniz brilhante em camada: as linhas finas e irregulares dos anéis (a figura do corte tangencial, com ovais e catedrais, pouco contraste), as faixas de cor, a fibra e os poros alongados na cor de um difuso sem especular próprio (o verniz molha a madeira); o verniz acompanha o poro aberto e a fibra (a normal dele desce em cada poro: o realce em tracinhos) | `base_color` (0,47; 0,3; 0,15), `base_late_color` (0,35; 0,21; 0,095), `base_roughness`, `coat_color` (1; 0,8; 0,5), `coat_roughness` 0,05, `coat_ior` 1,5, `coat_weight` 1, `pore_relief` 0,0022, `pattern_scale` | verniz de poliuretano, n ≈ 1,5 |
| `woodVarnishedMatte` | o mesmo, com o verniz acetinado e o poro mais aberto | `coat_roughness` 0,35, `coat_color` (1; 0,9; 0,7), `pore_relief` 0,0032 | verniz com fosqueante |
| `cotton` | difuso + brilho de fibra, sem especular (fosco e macio); tela 1/1 (`pattern.weave`, 110 fios) com o relevo dos fios torcidos (os cabos de cada fio, `strand`), a penugem (`pattern.grain` fino) borrando o contorno do fio e as faixas de fios mais grossos e mais finos ao longo da urdidura | `color` (urdidura), `weft_color` (trama), `sheen_color` 0,25, `sheen_roughness` 0,9, `diffuse_roughness` 1, `relief`, `pattern_scale` | Estevez e Kulla 2017 (sheen "Charlie") |
| `wool` | difuso + brilho de fibra forte e largo; tricô em ponto meia (`pattern.knit`, 30 colunas de pontos em V) de fio grosso e torcido, mesclado e felpudo; o relevo em milímetros (`relief.wool`: o fio de 1,4 mm e a penugem) na normal e, com `Displacements.wool()`, na geometria | `color` (0,24; 0,15; 0,09), `sheen_color`, `sheen_roughness` 0,9, `diffuse_roughness` 1, `height` 1,4 mm, `scale` 1, `pattern_scale` | idem |
| `denim` | difuso + brilho de fibra; sarja 3/1 (120 fios): a urdidura índigo por cima da trama crua, na diagonal; o desgaste — onde o pano dobra (a curvatura convexa da superfície, nas geometrias com geometria diferencial) o índigo da casca do fio gasta e o miolo claro aparece, em manchas | `color` índigo, `weft_color` cru, `sheen_roughness` 0,85, `wear_color` (0,3; 0,36; 0,48), `wear_low` 5, `wear_high` 22 (curvatura, por unidade) | idem |
| `velvet` | difuso escuro + brilho de fibra, sem especular: o centro escuro e fosco, a borda rasante com um halo claro e macio; o pelo penteado — `pattern.grain` largo e suave inclina de leve a normal do pelo (o halo se desloca em regiões largas) e um fino dá o granulado | `color` (0,085; 0,006; 0,022), `sheen_color` (0,6; 0,07; 0,17), `sheen_roughness` 0,45, `diffuse_roughness`, `nap`, `pile`, `pattern_scale` | idem (pelo em pé: o brilho só de lado) |
| `silk` | difuso + dielétrico anisotrópico + brilho de fibra; cetim 4/1 (150 fios), a tangente do brilho na direção da fibra do fio à vista (`fiber` da trama por `surface.direction`: o eixo do fio com a torção) — o realce corre ao longo do fio e pelas dobras do pano | `color`, `weft_color`, `roughness` 0,3, `anisotropy` 0,8, `ior` 1,56, `sheen_color`, `sheen_roughness`, `relief`, `pattern_scale` | fibroína, n ≈ 1,56 |
| `sheerFabric` | difuso misturado à parede fina translúcida + brilho de fibra; tela aberta (60 fios, metade do passo sem fio): a luz passa inteira pelos vãos, que são buracos — a cobertura cai neles a `gap_opacity`: o que está atrás aparece, e duas camadas sobrepostas deixam passar menos | `color`, `weft_color`, `translucency` 0,5, `gap_opacity` 0,15, `sheen_color`, `sheen_roughness`, `relief`, `pattern_scale` | — |
| `leather` | dielétrico + difuso; o grão (`pattern.cells`, 64 células com sulcos), fosco nos sulcos e liso nos platôs, com rugas largas; o relevo em milímetros (`relief.leather`) na normal e, com `Displacements.leather()`, na geometria | `color`, `roughness` 0,42 (os platôs), `ior` 1,5, `diffuse_roughness`, `height` 0,35 mm (os sulcos), `wrinkle_height` 0,5 mm, `scale` 1, `pattern_scale` | colágeno e acabamento, n ≈ 1,5 |
| `rubber` | dielétrico + difuso; grão fino de relevo leve | `color` 0,03, `roughness` 0,75, `ior` 1,519, `relief`, `pattern_scale` | poli-isopreno, n_D 1,519 |
| `ceramic` | corpo difuso com as pintas do ferro (`pattern.cells`) sob o esmalte em camada, de espessura irregular | `color`, `roughness` 0,08 (o esmalte), `ior` 1,5, `diffuse_roughness`, `glaze_color`, `pattern_scale` | esmalte de silicato |
| `porcelain` | dielétrico + subsuperfície | `color` (0,9; 0,9; 0,87), `radius` (0,3; 0,27; 0,22) mm, `scale` 1, `roughness` 0,05, `ior` 1,5 | esmalte de silicato; raio estimado (curto: só a borda fina deixa passar luz) |
| `plasticMatte` | dielétrico + difuso; a textura de molde (grão fino em relevo) | `roughness` 0,6, `ior` 1,49, `relief`, `pattern_scale` | polipropileno/PMMA, n_D 1,49 |
| `plasticGloss` | dielétrico + difuso, liso | `roughness` 0,08, `ior` 1,49 | PMMA, n_D 1,49 |
| `metalPolished` | condutor, liso: o que se vê é o reflexo do ambiente — nítido (o céu, o horizonte, o chão, os vizinhos) pelo reflexo traçado numa cena com a estrutura de raios (ver "Reflexo nítido dos lisos"); sem ela, borrado (as sondas da `GlobalIllumination` ou o hemisfério céu/chão) | `color` (F0 0,912; 0,914; 0,920), `edge_tint` (F82 0,970; 0,979; 0,988), `roughness` 0,05, `anisotropy` 0, `tangent` | alumínio do exemplo OpenPBR do MaterialX |
| `metalBrushed` | aço inoxidável escovado (o acetinado de lixa passada à mão): cinza-chumbo, sem imagem de espelho — o tom vem do que está em volta (escuro onde reflete o ambiente escuro, claro nas manchas das fontes). Os riscos são os de `pattern.brush`: quatro passadas de riscos finos ao longo de u, a direção variando alguns graus de lugar para lugar (levemente curvos, cruzando-se em ângulos pequenos), comprimento e fundura variados, e riscos fundos isolados; mais as faixas das passadas da lixa (`pattern.grain`). O lobo é largo e moderadamente anisotrópico, com a tangente na direção dos riscos no ponto: a luz de um painel (`RectLight`) aparece como mancha grande e macia, esticada através da escova, quebrada em fios pelos riscos (que inclinam a normal e mudam a rugosidade). O ambiente vem das sondas (o lobo é áspero: sem raio — ver "Reflexo nítido dos lisos") | `color`, `edge_tint`, `roughness` 0,33, `scratch_roughness` 0,47, `anisotropy` 0,25, `relief` 0,001, `spread` 0,11 (rad), `deep` 0,11, `pattern_scale` | aço: F0 (0,56; 0,57; 0,58) — o ferro e o cromo de Akenine-Möller et al., tabela 9.2 |
| `carPaint` | metal sob verniz: a base são as plaquetas de alumínio no aglutinante tingido — um condutor da cor da tinta, de lobo médio (a distribuição das orientações dos flocos), que cobre 92 % da base (o resto, pigmento difuso escuro): o brilho largo, liso e sedoso que segue a luz; clara perto do reflexo, escura e saturada fora dele (`flake_edge_tint`). O floco tem tamanho físico: `flake_size` em micrômetros (15: o automotivo fino, de 10 a 30 µm), `flake_density` flocos por área de floco (6: as camadas de plaquetas sobrepostas na espessura da tinta), numa peça em que uma unidade do padrão mede `pattern_size` metros. A um metro são milhares de flocos por pixel: a contagem dos alinhados com a luz (`pattern.glints` + `closure.glints`) vai à média e não há grão nem ponto isolado longe do realce — só de muito perto, junto do realce, um cintilar fino; mais perto ainda, com o floco maior que o pixel, cada um aparece com a normal inclinada (`flake_tilt`, a tangente da inclinação máxima) e o seu tom (± 35 %). Por cima, o verniz espelhado em camada com a normal própria, lisa, e a casca de laranja leve | `base_color` (0,2; 0,006; 0,008), `flake_color` (0,56; 0,035; 0,03), `flake_edge_tint` (0,3; 0,01; 0,015), `flake_roughness` 0,38, `flake_weight` 0,92, `flake_size` 15 µm, `flake_density` 6, `flake_tilt` 0,1, `sparkle_roughness` 0,3, `pattern_size` 0,5 m, `coat_color`, `coat_roughness` 0,02, `coat_ior` 1,5, `coat_weight` 1, `orange_peel` 0,0005, `pattern_scale` | a receita das outras engines (Principled BSDF do Blender com `metallic` 1 e `coat` de normal própria; verniz de duas normais da Unreal; base, flocos e verniz do V-Ray); `open_pbr_carpaint.mtlx`; a densidade e o lobo do floco, estimados |
| `carPaintSilver` | a mesma receita, prata | `flake_color` (0,72; 0,73; 0,75), `flake_edge_tint` (0,45; 0,45; 0,47), `base_color` 0,1 | alumínio pouco tingido |
| `carPaintFlake` | pintura de floco grosso (o "metal flake" dos capacetes e dos barcos), azul: a receita de `carPaint` com plaquetas de 300 µm, mais inclinadas e mais espalhadas — a um metro são poucos flocos por pixel, e os alinhados com a luz acendem um a um, pela peça toda | os de `carPaint`; `flake_size` 300 µm, `flake_density` 3, `flake_tilt` 0,26, `flake_roughness` 0,5, `sparkle_roughness` 0,18 | estimado |
| `metalOxidized` | chapa de aço com ferrugem: o metal que sobra liso e refletivo (escurece e fica áspero perto da ferrugem) misturado ao óxido em pó (difuso, do quase preto ao castanho, ao alaranjado e a pontos amarelados) pela máscara — manchas largas (`pattern.grain` de cinco oitavas), riscos que escorrem ao longo de v e pites (`pattern.cells`), mais o avanço `oxidation`; a ferrugem em relevo: a crosta granulada (`relief`) e a borda inchada (`swell`) | `color` (F0 do ferro 0,562; 0,565; 0,578), `roughness` 0,13 (o metal limpo), `oxide_color` (0,26; 0,085; 0,022), `oxide_roughness` 0,95, `oxidation` 0,55, `relief`, `swell`, `pattern_scale` | Real-Time Rendering 4ª ed., tabela 9.2 |
| `glass` | dielétrico + transmissão | `ior` 1,52, `roughness` 0, `color`, `depth` 0, `abbe` 58 | vidro sodo-cálcico |
| `skin` | dielétrico + subsuperfície | `color` (0,63; 0,44; 0,34), `radius` (0,91; 0,60; 0,52) mm, `scale` 1, `roughness` 0,45, `ior` 1,4 | Jensen et al. 2001 (skin2: R_d e ℓ = 1/(σ_s′ + σ_a)) |
| `wax` | dielétrico + subsuperfície | `color` (0,9; 0,82; 0,62), `radius` (2,8; 2,0; 1,2) mm, `scale` 1, `roughness` 0,3, `ior` 1,44 | parafina, n_D 1,44; raio estimado (uma vela de 2 cm deixa passar ~7 % do vermelho) |
| `marble` | dielétrico + subsuperfície; os veios (as linhas em que um `pattern.grain` de cinco oitavas passa por zero) na cor do corpo | `color`, `vein_color`, `radius` (0,46; 0,38; 0,33) mm, `scale` 1, `roughness` 0,1, `ior` 1,5, `pattern_scale` | Jensen et al. 2001 (mármore) |
| `jade` | dielétrico + subsuperfície | `color` (0,36; 0,62; 0,38), `radius` (0,9; 1,8; 1,0) mm, `scale` 1, `roughness` 0,08, `ior` 1,61 | nefrita, n ≈ 1,61; raio estimado (o verde vai mais longe) |
| `milk` | dielétrico + subsuperfície | `color` (0,91; 0,88; 0,76), `radius` (0,39; 0,31; 0,26) mm, `scale` 1, `roughness` 0,03, `ior` 1,35 | Jensen et al. 2001 (wholemilk); serve de sabão branco ou plástico leitoso |
| `gold` | condutor liso (rugosidade 0,05) | `color` (0,944; 0,776; 0,373), `edge_tint` (0,998; 0,981; 0,751), `roughness`, `anisotropy`, `tangent` | `standard_surface_gold.mtlx` |
| `copper` | condutor liso (0,06) | `color` (0,955; 0,638; 0,538), `edge_tint` (0,98; 0,96; 0,95) | F0: Real-Time Rendering 4ª ed., tabela 9.2; a tinta da borda calculada do índice complexo |
| `brass` | condutor liso (0,07) | `color` (0,910; 0,778; 0,423), `edge_tint` (0,99; 0,98; 0,9) | F0: a mesma tabela (latão C260); a tinta da borda estimada |
| `chrome` | condutor liso (0,02): o espelho escuro e neutro | `color` (0,549; 0,556; 0,554), `edge_tint` (0,75; 0,75; 0,81) | a mesma tabela; a tinta da borda calculada do índice complexo |
| `aluminiumAnodized` | alumínio jateado (condutor, 0,3, grão fino em relevo) sob a camada anódica tingida — dielétrico acetinado em camada com a cor do corante | `color` (0,06; 0,25; 0,8: o corante), `roughness` 0,3, `coat_roughness` 0,28, `coat_ior` 1,65, `relief`, `pattern_scale` | alumina porosa, n ≈ 1,6–1,65 |
| `metalHammered` | condutor polido (cobre) com as mossas do martelo (`pattern.dents`, 16 por unidade): cada mossa um espelho côncavo | `color`, `edge_tint`, `roughness` 0,06, `relief` 0,02, `pattern_scale` | cobre da tabela 9.2 |
| `castIron` | condutor escuro e áspero (a carepa de fundição) com a textura do molde de areia em relevo, manchas pardas e poros de gás (`pattern.cells`) | `color` 0,17, `stain_color`, `roughness` 0,5, `relief`, `pattern_scale` | estimado |
| `bronzePatina` | bronze castanho nos baixos e polido nos altos (condutor) misturado à pátina verde em pó (difuso) pelo relevo: a pátina fica nos recessos, com a borda quebrada e os escorridos | `color`, `worn_color` (0,85; 0,62; 0,40), `patina_color`, `patina` 0,42, `roughness` 0,34, `relief`, `pattern_scale` | F0 estimado entre o cobre e o latão |
| `carbonFiber` | sarja 2/2 (`pattern.weave`, 30 mechas) de especular escuro e anisotrópico com a tangente pelos filamentos, sob a resina epóxi polida em camada | `color` 0,14, `roughness` 0,45, `anisotropy` 0,85, `coat_roughness` 0,03, `coat_ior` 1,55, `relief`, `pattern_scale` | epóxi n ≈ 1,55; o F0 da mecha estimado |
| `concrete` | dielétrico fosco + difuso; manchas largas da cura, areia em relevo, bolhas de ar da fôrma (`pattern.cells`) | `color` (0,37; 0,36; 0,34), `roughness` 0,85, `relief`, `pit_depth`, `pattern_scale` | albedo do concreto 0,3–0,5 |
| `granite` | cristais de três minerais (`pattern.cells`: quartzo, feldspato rosado e claro) e lamelas de biotita sob uma interface polida (o reflexo nítido) | `color`, `pale_color`, `quartz_color`, `mica_color`, `roughness` 0,05, `ior` 1,55, `pattern_scale` | quartzo n 1,544 |
| `sandstone` | estratos (`pattern.grain` esticado) do ocre ao ferruginoso e ao creme, grãos de areia; relevo em milímetros (`relief.sandstone`) | `color`, `dark_color`, `pale_color`, `roughness` 0,9, `layer_height` 4, `weather_height` 3, `grain_height` 0,3, `scale` 1, `pattern_scale` | — |
| `brick` | tijolo maciço com junta (`pattern.bricks`, 4 × 12): o tom de tijolo para tijolo, os requeimados, a argamassa; relevo em milímetros (`relief.brick`) | `color`, `dark_color`, `mortar_color`, `roughness` 0,9, `joint_depth` 5, `face_height` 0,9, `scale` 1, `pattern_scale` | — |
| `plaster` | reboco branco fosco: as passadas da desempenadeira, a areia e os furinhos em relevo | `color` 0,8, `roughness` 0,9, `relief`, `grain_relief`, `pattern_scale` | — |
| `asphalt` | britas (`pattern.cells`, 80) de tom próprio no betume preto, em relevo | `color`, `stone_color`, `binder_color`, `roughness` 0,85, `relief`, `pattern_scale` | — |
| `tile` | azulejo esmaltado em grade (`pattern.bricks` sem deslocamento, 5 × 5): corpo sob o esmalte em camada, de borda abaulada; rejunte fosco | `color` (0,04; 0,2; 0,42), `grout_color`, `glaze_color`, `roughness` 0,04, `ior` 1,5, `bevel`, `pattern_scale` | vidro de silicato n 1,5 |
| `terracotta` | barro queimado fosco: manchas da queima, marcas do torno, eflorescência clara, poros | `color` (0,5; 0,2; 0,1), `bloom_color`, `roughness` 0,85, `relief`, `pattern_scale` | — |
| `driedMud` | placas de argila (`pattern.cells`) com rachaduras de retração; relevo em milímetros (`relief.driedMud`) | `color`, `roughness` 0,95, `crack_depth` 9, `face_height` 0,8, `cavity` 0,3, `scale` 1, `pattern_scale` | — |
| `sand` | grãos (`pattern.cells`, 170) de cor própria e faceta própria, marcas onduladas do vento; de longe, os brilhos pontuais das facetas de quartzo (`pattern.glints`, 420) | `color`, `warm_color`, `dark_color`, `roughness` 0,4, `sparkle_roughness` 0,18, `relief`, `ripple`, `pattern_scale` | quartzo n 1,544 |
| `woodPine` | pinho encerado: anéis largos e irregulares, bolsas de resina, **nós** com o veio desviando em volta (`knots` de `pattern.rings`) | `color`, `late_color`, `knot_color`, `knots` 3, `knot_size` 0,04, `roughness` 0,55, `coat_color`, `coat_roughness`, `coat_weight` 0, `pore_relief`, `pattern_scale` | — |
| `woodOak` | carvalho claro fosco: anéis em arcos, vasos escuros, raios medulares | os de `woodPine`; `roughness` 0,6 | — |
| `woodWalnut` | nogueira oleada: castanho-chocolate, as linhas dos anéis finas e de espaçamento irregular (ovais e catedrais), faixas claras e escuras, poros compridos | os de `woodPine`; `roughness` 0,42 | — |
| `woodOakVarnished` | carvalho escurecido sob verniz âmbar em camada: linhas de anel de pouco contraste, faixas largas de cor, muitos vasos escuros e alongados; o verniz acompanha o poro aberto e a fibra (a normal dele desce em cada vaso e ondula com a fibra fina: o realce largo cortado em tracinhos) | os de `woodPine`; `coat_weight` 1, `coat_roughness` 0,13, `pore_relief` 0,0034 | verniz n 1,5 |
| `woodMahogany` | mogno envernizado: laranja-avermelhado, linhas de anel castanhas, finas e irregulares, faixas da grã revessa, tracinhos escuros dos poros | os de `woodPine`; `coat_weight` 1, `coat_roughness` 0,07, `pore_relief` 0,002 | — |
| `woodAsh` | freixo cru, lixado e escovado de leve, sem verniz: madeira clara e fosca — creme, de veio discreto e irregular, com os vasos abertos do lenho inicial em tracinhos escuros. O corpo é **subsuperfície** (`bsdf.subsurface`): a luz entra, espalha-se nas fibras e sai perto — o terminador fica mais macio e o relevo fino, menos duro; uma peça fina deixa passar luz. Sem verniz, o lobo da interface é largo e alongado através da fibra (o realce de fibra). Relevo em milímetros (`relief.woodAsh`): o lenho tardio saliente, os poros abertos, a fibra levantada | `color` (0,66; 0,53; 0,37), `late_color`, `pore_color`, `roughness` 0,62, `anisotropy` 0,6, `radius` (1,1; 0,7; 0,35) mm, `ring_height` 0,12, `pore_depth` 0,25, `fiber_height` 0,08, `furrow_depth` 0, `scale` 1, `pattern_scale` | o raio estimado (ordem de 1 mm, mais longo no vermelho); Marschner et al. 2005, "Measuring and Modeling the Appearance of Finished Wood" (o espalhamento sob a superfície da madeira e a anisotropia dele pela fibra) |
| `woodAshBrushed` | freixo escovado a fundo (escova de aço ou jato, cru): a mesma madeira de `woodAsh` — clara, fosca, corpo de **subsuperfície** — com o relevo de `relief.woodAshBrushed`: a fibra macia do lenho inicial removida em sulcos ao longo do veio, o lenho tardio saliente em cristas, os vasos abertos. Com `Displacements.woodAshBrushed()` o relevo vai à geometria: a silhueta fica serrilhada pelas cristas e os sulcos fazem sombra na luz rasante; a subsuperfície clareia o fundo dos sulcos (a luz atravessa as cristas, da ordem do raio de espalhamento) | os de `woodAsh`; `ring_height` 0,8, `pore_depth` 0,5, `fiber_height` 0,15, `furrow_depth` 1,1 (mm) | as alturas estimadas (0,5 a 1,5 mm do fundo dos sulcos às cristas numa tábua escovada); o raio, o de `woodAsh` |
| `woodFloorPlanks` | assoalho de réguas de carvalho (`pattern.planks`, 1 × 6): cada tábua com os seus anéis, nós e tom, junta escura, verniz acetinado | os de `woodPine`; `coat_roughness` 0,22 | — |
| `woodFloorHerringbone` | taco em espinha de peixe (`pattern.planks`, 1 × 4, alternado a 90°) | os de `woodPine` | — |
| `bark` | casca de carvalho: placas escamosas ao longo de v separadas por fissuras fundas que se ramificam (`pattern.fissures`) e cortadas em blocos, cada placa e cada escama de um tom, cristas gastas claras, a casca interna avermelhada na parede da fissura, fundo escuro, líquen; relevo em milímetros e em várias escalas (`relief.bark`): as fissuras, as quebras, as cristas ao longo do tronco e a face das placas em degraus (cada escama é um platô no seu nível) — deslocada, a silhueta fica irregular e há sombra dentro das fissuras e entre as escamas | `color`, `ridge_color`, `furrow_color`, `inner_color`, `lichen_color`, `lichen` 0,24, `roughness` 0,95, `furrow_depth` 16, `ridge_height` 3,4, `scale_height` 2,8, `scale` 1, `pattern_scale` | — |
| `barkPine` | casca de pinheiro: placas largas cobertas de escamas em camadas, cada uma no seu nível (a borda da cor da camada de baixo), fissuras estreitas e fundas de parede avermelhada; relevo em milímetros (`relief.barkPine`) | os de `bark`; `furrow_depth` 12, `ridge_height` 1,2, `scale_height` 3,4, `lichen` 0,08 | — |
| `barkBirch` | casca de bétula: branca e acetinada, lenticelas escuras e salientes em volta do tronco, tiras que descascam sobre a camada rosada, com a borda enrolada, levantada da superfície; relevo em milímetros (`relief.barkBirch`) | `color`, `under_color`, `lenticel_color`, `roughness` 0,45, `peel_height` 4, `lenticel_height` 1,2, `swell_height` 2, `scale` 1, `pattern_scale` | — |
| `cork` | cortiça aglomerada: grânulos (`pattern.cells`, 84) de tom próprio, lenticelas escuras, grão fino | `color`, `dark_color`, `pore_color`, `roughness` 0,9, `relief`, `pattern_scale` | — |
| `corkStopper` | cortiça natural (a rolha): castanho-clara em faixas, as lenticelas — canais escuros e alongados, de borda irregular, afundados —, as cavidades pequenas (`pattern.dents`) e o granulado das células (`pattern.cells`, 110); fosca | `color`, `dark_color`, `lenticel_color`, `roughness` 0,9, `relief`, `pattern_scale` | — |
| `leaf` | folha verde cerosa, grande e coriácea (a magnólia, o fícus, o cafeeiro): a nervura central, que afina para a ponta; as secundárias, que saem dela a uns 60° e **curvam para a ponta**, com o espaçamento e o ângulo irregulares; as terciárias em escada entre duas secundárias; e a rede das vênulas, de aréolas **arredondadas** (`pattern.veins`) — na cor (as nervuras mais claras, cada aréola com o seu tom, a margem amarelada, pintas) e no relevo em milímetros (`relief.leaf`): as nervuras afundadas, o limbo abaulado em almofadas redondas entre as vênulas (`pattern.areoles`), a lâmina ondulada. A cutícula de cera (dielétrico, IOR 1,45) tem a rugosidade variável — lisa no meio de cada almofada, fosca nas vênulas, nas nervuras, na margem e em manchas —: o realce aparece em pedaços, um por almofada inclinada para a luz. Sob ela, o difuso misturado à parede fina translúcida — a luz de trás atravessa verde-amarelada, menos nas nervuras | `color`, `edge_color`, `vein_color`, `spot_color`, `transmission_color`, `translucency` 0,42, `roughness` 0,2, `vein_roughness` 0,45, `vein_height` −0,7, `bulge_height` −0,35, `pad_height` 0,3, `wave_height` 1, `scale` 1, `pattern_scale` | cutina n ≈ 1,45; as alturas, estimadas (lâmina coriácea de 0,3 a 0,6 mm, nervura central de 1 a 2 mm) |
| `leafMatte` | folha fosca (a sálvia, a folha do carvalho, a face de baixo de muitas): verde-acinzentada, sem realce especular (a cutícula áspera no limbo todo), com a penugem leve dos tricomas (`bsdf.sheen`), o limbo empolado em almofadas redondas miúdas; as mesmas nervuras de `leaf` | os de `leaf` e `down_color`; `roughness` 0,82, `vein_roughness` 0,9, `translucency` 0,3, `vein_height` −0,55, `bulge_height` −0,2, `pad_height` 0,3, `wave_height` 1 | estimado |
| `leafDry` | folha seca de outono: castanho-alaranjada, a margem queimada, muitas pintas, as nervuras salientes (a lâmina encolheu entre elas), a lâmina amassada e fosca; as mesmas nervuras de `leaf` | os de `leaf`; `translucency` 0,3, `roughness` 0,6, `vein_roughness` 0,75, `vein_height` 0,7, `bulge_height` 0,25, `pad_height` −0,15, `wave_height` 1,6 | — |
| `roofTile` | telhado de telha de barro de capa e canal: fiadas sobrepostas (`pattern.shingles` com o perfil da capa e do canal), a queima de telha para telha, manchas escuras no pé de cada fiada, líquen; relevo em milímetros (`relief.roofTile`): a sobreposição faz sombra | `color`, `pale_color`, `dark_color`, `stain_color`, `lichen_color`, `lichen` 0,28, `roughness` 0,75, `lift` 18, `face_height` 0,7, `tiles` (14; −9), `scale` 1, `pattern_scale` | — |
| `roofSlate` | telhado de ardósia: placas planas em fiadas desencontradas, o pé recuado ao acaso, o vão entre duas, a clivagem na face; relevo em milímetros (`relief.roofSlate`) | os de `roofTile`; `roughness` 0,45, `lift` 9, `face_height` 0,9, `tiles` (9; −12), `lichen` 0,1 | — |
| `paper` | difuso misturado à parede fina translúcida: a formação e as fibras aparecem contra a luz | `color` 0,8, `translucency` 0,35, `relief`, `pattern_scale` | — |
| `ice` | transparente: dielétrico liso + transmissão com refração traçada (IOR 1,31), a absorção mais forte no vermelho (azulado só na espessura); as trincas, as bolhas e a geada brancas e opacas, de borda viva, misturadas por máscara (as da face de trás aparecem refratadas); superfície ondulada. O espalhamento do meio é parâmetro (`scatter`, 0): uniforme, uma vez só e sorteado | `color` (0,74; 0,92; 0,98) a `depth` 1, `scatter` 0, `flaw_color`, `roughness` 0,04, `ior` 1,31, `relief`, `pattern_scale` | gelo n 1,31 |
| `soap` | dielétrico acetinado + subsuperfície tingida, com as nuvens da massa | `color` (0,3; 0,66; 0,52), `swirl_color`, `radius` (1,4; 2,2; 1,7) mm, `scale` 1, `roughness` 0,3, `ior` 1,47, `relief`, `pattern_scale` | estimado |
| `ivory` | dielétrico polido + subsuperfície curta; veio fino, manchas amareladas, fissuras da idade | `color`, `age_color`, `radius` (0,32; 0,22; 0,14) mm, `scale` 1, `roughness` 0,2, `ior` 1,54, `pattern_scale` | estimado |
| `motherOfPearl` | filme fino (`closure.thinFilm`, 320 a 640 nm pelas faixas de crescimento) sobre um refletor parcial e o corpo leitoso | `color`, `reflectance` 0,5, `thickness_min`, `thickness_max`, `film_ior` 1,43, `roughness` 0,16, `relief`, `pattern_scale` | aragonita n 1,53–1,69, conchiolina 1,43; modelo efetivo de um filme só |
| `snow` | subsuperfície clara sob as facetas de gelo: um lobo largo e fraco com os brilhos pontuais (`pattern.glints`, 520 + `closure.glints`): a faceta alinhada com o sol acende num ponto | `color`, `radius` (1,6; 2; 2,6) mm, `scale` 1, `sparkle_scale` 520, `sparkle_roughness` 0,26, `sparkle_spread` 0,6, `relief`, `pattern_scale` | gelo n 1,31; o raio estimado |

O relevo usa as tangentes do uv da amostra (`dpdu`, `dpdv`), que existem no desenho; nos acertos dos raios (a
iluminação global, o que se vê através de um vidro, o `sheerFabric`) o padrão de cor continua e o relevo some. Os
padrões seguem o uv da geometria: onde ele converge (os polos da esfera) o padrão aperta, e a filtragem o leva à média
ali — a amostra de superfície não traz a posição no espaço do objeto, então não há projeção do padrão pela posição
(triplanar); numa `ParametricSurface` a parametrização é sua, e uma `SurfaceFunction` que não converge na face à vista
resolve (ver "Relevo e deslocamento"). `plasticGloss`, `metalPolished`, `porcelain`, `skin`, `wax`, `jade`, `milk` e `glass` são lisos (o que se vê neles é
a luz e o ambiente). `glass`, `ice`, `sheerFabric`, `paper`, `leaf`, `leafMatte` e `leafDry` são transmissivos: o que está atrás vem da refração traçada
([Refração](./refraction.md)).

## Relevo e deslocamento (spec 011, T115)

O relevo na normal só inclina a luz: a superfície continua lisa, a silhueta é a da forma e o relevo não faz sombra em
si mesmo. Nos materiais de relevo forte — `woodRough`, `woodAsh`, `leather`, `wool`, `sandstone`, `brick`, `driedMud`,
as cascas (`bark`, `barkPine`, `barkBirch`), as folhas (`leaf`, `leafMatte`, `leafDry`) e os telhados (`roofTile`,
`roofSlate`: a sobreposição de cada fiada faz sombra) — a altura é dada em **milímetros** e pode
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

`Displacements` tem um deslocamento por relevo pronto (`nodes.relief.<nome>`, o do material de mesmo nome):
`woodRough` (`ring_height`, `wear_height`, `fiber_height`, `crack_depth`), `woodAsh` e `woodAshBrushed` (`ring_height`, `pore_depth`, `furrow_depth`,
`fiber_height`), `leather` (`height`, `wrinkle_height`), `wool` (`height`, `fluff_height`), `sandstone`, `brick`,
`driedMud`, as cascas `bark` e `barkPine` (`furrow_depth`, `ridge_height`, `scale_height`) e `barkBirch`
(`peel_height`, `lenticel_height`, `swell_height`), as folhas `leaf`, `leafMatte` e `leafDry` (`vein_height`,
`bulge_height`, `pad_height`, `wave_height`) e os telhados `roofTile` e `roofSlate` (`lift`, `face_height`, `tiles`),
todos com `pattern_scale` e `scale`.

- **A escala do objeto**: o relevo é físico, em milímetros — só vira silhueta quando é uma fração visível do tamanho
  do objeto. As fissuras de 16 mm de uma casca são 7,5 % do raio de um tronco de 42 cm; as nervuras de uma folha, de
  décimos de milímetro, mal mexem o contorno de uma bola de 7 cm (aparecem na luz, pela normal, e nas almofadas do
  limbo); os poros de uma madeira lixada, de 0,25 mm, só de muito perto.
- **Onde o uv converge**: na esfera pronta (longitude e latitude) o uv aperta nos polos, e as placas de uma casca
  convergem ali. A galeria desenha as cascas, as folhas e a madeira clara numa esfera de outra parametrização, por
  `SurfaceFunction`: o quadrado do uv vai ao disco (a grade elíptica) e o disco à esfera pela projeção azimutal de
  área igual de Lambert, com o centro do uv voltado para a câmera e a borda inteira no ponto oposto — uma unidade de
  uv mede 4 raios no centro e o padrão tem o mesmo tamanho em toda a face à vista (`FRONT_SPHERE_CODE` no smoke
  `materials`).

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
  só a luz indireta (as sondas, o hemisfério). No lobo anisotrópico (o metal escovado) conta a rugosidade do eixo largo
  (a rugosidade vezes √(1 + |anisotropia|)): um raio só por pixel não representa um lobo largo num eixo — sorteado, vira
  ruído; na direção dominante, vira um espelho que o lobo não é —, e ele fica com a radiância das sondas, já filtrada,
  e com o realce analítico das luzes: limpo com MSAA e com o antisserrilhado temporal.
- **O sol** não vem pelo raio: é a luz direta no lobo (o realce), como antes — no metal polido, o ponto que estoura.
- **Custo**: um raio por bloco de 2 × 2 pixels lisos por quadro (parado, cada pixel fica com o valor exato dele em até 6
  quadros). Sem `RayScene` ou com `renderer.lightPaths.reflection = false`, nada roda e o lobo fica com a luz indireta.
- **Limites**: um reflexo só (o espelho visto num espelho mostra a luz indireta do segundo); as bordas do que é
  refletido se alisam pelo antisserrilhado temporal (com MSAA ficam em degraus, uma amostra por pixel); só entidades com
  função `material` (o `StandardMaterial` de constantes fica com a luz indireta).

```ts
app.defaults.renderer.lightPaths.reflection = false; // desliga o reflexo traçado dos opacos
```

## Brilhos pontuais (spec 011, T118)

Os flocos da pintura metálica, os cristais da neve e as facetas de quartzo da areia são espelhos pequenos. De perto o
padrão os resolve (cada floco com a sua normal); de longe, com o floco menor que o pixel, o filtro levava tudo à média
e o brilho sumia. `pattern.glints` e `closure.glints` põem no lugar a contagem dos flocos alinhados com cada luz:

```ts
const sparkle = nodes.pattern.glints.with({ scale: 2800 }); // flocos por unidade do padrão
const flakes = nodes.bsdf.conductor.with({ roughness: 0.5 }); // a distribuição das orientações dos flocos
const glinting = nodes.closure.glints.with({ roughness: 0.18 }); // o espelho de cada floco
// ligações: ['flakes.value', 'glinting.c'], ['sparkle.cells', 'glinting.cells'], ['sparkle.count', 'glinting.count']
```

- A rugosidade do especular passa a ser a **distribuição das orientações** dos flocos; `roughness` de `closure.glints`
  é a do **espelho de cada floco** (o ângulo sólido Ω = π · α², α = rugosidade²). Um floco está alinhado com o vetor
  do meio com a probabilidade p = D · (n·h) · Ω.
- Dos N flocos da célula do pixel, k estão alinhados — k sorteado da binomial (Poisson com poucos, normal com muitos)
  com um valor fixo da célula (no espaço do objeto: os brilhos não andam com a câmera) e da direção (outra luz, outro
  ângulo: outros flocos) —, e a densidade do lobo é k / (N · (n·h) · Ω). A média é o lobo liso (a mesma energia); longe
  do realce sobram poucos pontos fortes, e dentro dele o chuvisco denso. Com muitos flocos por pixel volta o lobo liso.
- A célula é a de uma grade de 0,7 a 1,4 pixel de lado e a do nível seguinte, misturadas: a troca com a distância é
  contínua (Jakob et al. 2014, "Discrete Stochastic Microfacet Models"; os níveis de Zirr e Kaplanyan 2016).
- Vale no lobo isotrópico e nas luzes diretas; a luz indireta e o reflexo traçado ficam com o lobo médio. Nos acertos
  dos raios (sem a largura do pixel) não há sorteio.
- **O tamanho do floco decide o grão.** O desvio da contagem sobre a média é 1/√(N · p): com poucos flocos por pixel
  (os de 300 µm de `carPaintFlake`: uns dez por pixel a um metro) a pintura é granulada pela peça toda; com milhares
  (os de 15 µm de `carPaint`, em seis camadas sobrepostas) a contagem vai à média e o lobo fica liso — sem grão nem
  ponto isolado longe do realce. Nas pinturas o floco é físico: `flake_size` em micrômetros, `flake_density` flocos
  por área de floco e `pattern_size`, o tamanho em metros de uma unidade do padrão na peça (os flocos por unidade do
  padrão saem daí: `pattern_size` · 10⁶ / `flake_size` · √`flake_density`).

## Subsuperfície: a luz que entra no corpo

Pele, cera, mármore, jade e leite não refletem a luz no ponto em que ela chega: ela entra, espalha-se dentro do corpo e
sai em volta. O lobo `bsdf.subsurface` (e os materiais prontos `skin`, `wax`, `marble`, `porcelain`, `jade`, `milk`,
`soap`, `ivory`, `snow` e a madeira clara `woodAsh`)
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
