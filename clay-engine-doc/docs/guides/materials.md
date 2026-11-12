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
| `bsdf.subsurface`     | `color` (0,8; 0,5; 0,4), `radius` por canal (1; 0,4; 0,2): pele, cera, mármore                          |
| `bsdf.emission`       | `color` (branco), `luminance` (1, em nits; sem teto até o limite do formato HDR)                        |

### Nós de composição (`nodes.closure`)

| Nó                        | O que faz                                                                                                  |
| ------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `closure.add`             | soma `a` e `b` (um dielétrico fica sobre o difuso)                                                         |
| `closure.mix`             | mistura `a` e `b` por `t` em [0, 1] (0 = `a`): a máscara entre dois materiais                              |
| `closure.layer`           | o especular de `top` como verniz sobre `base`, atenuando-a pelo que reflete e por `top_color`, com `top_weight` |
| `closure.thinFilm`        | filme fino (iridescência) de `thickness` nm e `ior` sobre o especular de base                              |
| `closure.opacity`         | opacidade `alpha` em [0, 1]: o material vai ao passe dos transmissivos                                     |
| `closure.normal`          | normal própria dos lobos de base (de um nó, como `surface.ripple`, ou de um campo)                          |
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
`subsurface_color`, `subsurface_radius`), verniz (`coat_weight`, `coat_color`, `coat_roughness`, `coat_ior`), fuzz
(`fuzz_weight`, `fuzz_color`, `fuzz_roughness`), filme fino (`thin_film_weight`, `thin_film_thickness`,
`thin_film_ior`), emissão (`emission_luminance`, `emission_color`) e geometria (`geometry_opacity`,
`geometry_thin_walled`).

## Imagens nos materiais: texturas virtuais (spec 034, T060c)

Uma imagem de material (a cor de uma pintura, de um tijolo, de um terreno) entra como `VirtualImage` e é lida no grafo
pelo nó `nodes.image.virtual`. A imagem fica na CPU como pirâmide de níveis; na GPU só existem as páginas que os quadros
pedem, num atlas compartilhado pelas `VirtualTextures` da cena — a imagem pode ser maior que a memória reservada a ela.

```ts
import { MaterialFunction, NodeGraph, nodes, VirtualImage, VirtualTextures } from 'clayflow';

// `pixels`: RGBA de 8 bits em sRGB, decodificados pela aplicação (o motor não lê arquivos).
const wall = new VirtualImage({ width: 8192, height: 8192, pixels, wrap: 'repeat' });
const cache = new VirtualTextures({ images: [wall], atlasPages: 16 }); // 16 × 16 páginas de 128² (2048²)
world.insert(cache);

const material = new MaterialFunction({
    graph: new NodeGraph({
        nodes: { img: nodes.image.virtual.with({ image: 0 }), out: nodes.output.surfaceParams },
        links: [['img.color', 'out.base_color']],
        output: 'out.value',
    }),
});
```

- **Páginas**: 120² texels de conteúdo com borda de 4 (128² no atlas `rgba8unorm`); a pirâmide é a média 2 × 2 em luz
  linear até 1 × 1. A cor (`colorSpace: 'srgb'`, o padrão) é filtrada em luz linear pelo nó (cada texel decodificado
  antes do bilinear); o dado linear (`colorSpace: 'linear'`: rugosidade, metal, normais, máscaras) pelo hardware.
- **Leitura**: o nível pelas derivadas do uv (a pegada do pixel; no acerto de um raio, o cone), a página residente mais
  fina a partir dele e a mistura entre os dois níveis em volta. Sem página residente, a média da imagem.
- **Pedidos**: o nó marca as páginas que queria; o `VirtualTextureFlow` do quadro seguinte aloca as que faltam (do nível
  mais grosso ao mais fino, até `budget` por quadro; despeja as não pedidas há mais tempo quando o atlas está cheio) e a
  lista volta à CPU, que escreve os texels no atlas. A página só vale carimbada na época da série por páginas do atlas.
- **Custo** do `VirtualTextureFlow` (smoke `virtualTextures`, M4; o mesmo nos três perfis, não depende da resolução):
  0,009 ms por quadro com a cena parada (a lista é lida um quadro em 8), 0,3 ms andando. A leitura direta (`vtSample`, a
  referência f64) e a imagem pelas páginas diferem até 0,47 % (RMS 0,08 %) — os 8 bits do atlas. As páginas que faltam
  chegam em 4 a 20 quadros.
- Uma imagem acrescentada depois (`cache.addImage(img)` devolve o índice) recomeça a tabela.
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
