import { NodeGraph } from '../../../scene/graph/NodeGraph';
import type { NodeDefinition } from '../../../scene/graph/NodeDefinition';
import { Subgraph } from '../../../scene/graph/Subgraph';
import { bsdf } from '../bsdf';
import { closure } from '../closure';
import { color } from '../color';
import { map } from '../map';
import { math } from '../math';
import { pattern } from '../pattern';
import { surface } from '../surface';
import {
    bumpLinks,
    PATTERN_SCALE,
    patternLinks,
    patternSpace,
    SAMPLE_INPUT,
    SPACE_LINKS,
} from './pattern';

// Metais (spec 011, R11): o especular de condutor (`bsdf.conductor`), com a refletância de frente F0 na cor e a tinta
// da borda F82. Alumínio: F0 (0,912, 0,914, 0,920) e F82 (0,970, 0,979, 0,988) — o exemplo
// `open_pbr_aluminum_brushed.mtlx` do MaterialX (OpenPBR). Outros metais pelos parâmetros, ex.: ouro F0 (0,944, 0,776,
// 0,373) e F82 (0,998, 0,981, 0,751) (`standard_surface_gold.mtlx`). Os riscos da escova, os flocos da pintura e as
// manchas da ferrugem são calculados por pixel pelos nós de padrão sobre o uv (`pattern_scale` repetições por unidade
// de uv; numa esfera, (2, 1)).

const ALUMINIUM_F0 = [0.912, 0.914, 0.92] as const;
const ALUMINIUM_F82 = [0.97, 0.979, 0.988] as const;

type Rgb = readonly [number, number, number];

/** Sub-grafo de um metal nu: um `bsdf.conductor` (F0 `f0`, tinta da borda `f82`) com todos os parâmetros expostos. */
function metal(
    name: string,
    roughness: number,
    anisotropy: number,
    f0: Rgb = ALUMINIUM_F0,
    f82: Rgb = ALUMINIUM_F82,
): NodeDefinition {
    return Subgraph.point(
        new NodeGraph({
            nodes: {
                out: bsdf.conductor.with({
                    color: [...f0],
                    edge_tint: [...f82],
                    roughness,
                    anisotropy,
                }),
            },
            links: [],
            output: 'out.value',
        }),
        {
            name,
            expose: [
                ['out.color', 'color'],
                ['out.edge_tint', 'edge_tint'],
                ['out.roughness', 'roughness'],
                ['out.anisotropy', 'anisotropy'],
                ['out.tangent', 'tangent'],
            ],
        },
    );
}

/**
 * `material.metalPolished` — metal polido (alumínio): condutor de rugosidade 0,05, isotrópico; liso, sem padrão — o
 * que se vê nele é o reflexo do ambiente. Parâmetros: `color` (F0), `edge_tint` (F82), `roughness`, `anisotropy`,
 * `tangent`.
 */
export const metalPolished = metal('material.metalPolished', 0.05, 0);

// Os metais puros polidos: a refletância de frente F0 por canal (RGB linear) de Akenine-Möller et al., "Real-Time
// Rendering" 4ª ed., tabela 9.2 (o ouro, do exemplo `standard_surface_gold.mtlx` do MaterialX); a tinta da borda (o
// fator do Fresnel a 82°, o `specular_color` do OpenPBR) calculada das equações de Fresnel com o índice complexo a 650,
// 550 e 450 nm (valores aproximados de Johnson e Christy 1972 para o cobre e a prata, de Johnson e Christy 1974 para o
// cromo) dividido pelo Schlick do F0; a do latão é estimada (liga sem medida tabelada), entre a do cobre e a do ouro.

/** Os valores de um metal nobre acetinado. */
interface NobleValues {
    readonly f0: Rgb;
    readonly f82: Rgb;
    /** A rugosidade do polimento e a das passadas mais gastas. */
    readonly roughness: readonly [number, number];
    readonly seed: number;
}

/**
 * Sub-grafo de um metal nobre com o polimento acetinado da joalheria: um condutor cuja rugosidade varia entre
 * `roughness` e `worn_roughness` pelas passadas do pano (um grão largo) e pelos riscos miúdos (um grão fino alongado,
 * também em relevo, `relief` em unidades do padrão) — o realce das luzes sai largo e desigual, com a cor do metal, em
 * vez do reflexo de espelho do ambiente. Parâmetros: `color`, `edge_tint`, `roughness`, `worn_roughness`, `relief`,
 * `pattern_scale`.
 */
function noble(name: string, v: NobleValues): NodeDefinition {
    return Subgraph.point(
        new NodeGraph({
            nodes: {
                ...patternSpace(),
                polish: pattern.grain.with({
                    scale: [420, 90],
                    octaves: 3,
                    gain: 0.6,
                    seed: v.seed,
                }),
                swirl: pattern.grain.with({ scale: [5, 5], octaves: 3, seed: v.seed + 1 }),
                both: math.add,
                rough: map.range.with({
                    in_min: -1.5,
                    in_max: 1.5,
                    out_min: v.roughness[0],
                    out_max: v.roughness[1],
                }),
                relief: surface.bump.with({ strength: 0.00025 }),
                metal: bsdf.conductor.with({ color: [...v.f0], edge_tint: [...v.f82] }),
                out: closure.normal,
            },
            links: [
                ...SPACE_LINKS,
                ...patternLinks('polish', 'swirl'),
                ['polish.value', 'both.a'],
                ['swirl.value', 'both.b'],
                ['both.value', 'rough.x'],
                ['rough.value', 'metal.roughness'],
                ...bumpLinks('relief', 'polish.gradient'),
                ['metal.value', 'out.c'],
                ['relief.value', 'out.normal'],
            ],
            output: 'out.value',
        }),
        {
            name,
            ...SAMPLE_INPUT,
            expose: [
                ['metal.color', 'color'],
                ['metal.edge_tint', 'edge_tint'],
                ['rough.out_min', 'roughness'],
                ['rough.out_max', 'worn_roughness'],
                ['relief.strength', 'relief'],
                PATTERN_SCALE,
            ],
        },
    );
}

/**
 * `material.gold` — ouro de joalheria (24 quilates, acetinado): F0 (1,0, 0,77, 0,34) — a refletância do ouro puro de
 * frente (Johnson e Christy 1972, em sRGB linear: quase todo o vermelho, três quartos do verde, um terço do azul) —, a
 * tinta da borda (1,0, 0,95, 0,75); rugosidade de 0,16 a 0,26: o amarelo quente e cheio vem do realce largo das luzes
 * na cor do metal (num espelho, o ouro só tinge o que reflete: num ambiente cinza fica pardo). Parâmetros: os de
 * `noble`.
 */
export const gold = noble('material.gold', {
    f0: [1, 0.77, 0.34],
    f82: [1, 0.95, 0.75],
    roughness: [0.16, 0.26],
    seed: 31,
});

/**
 * `material.silver` — prata de lei acetinada: F0 (0,972, 0,960, 0,915) — o metal mais refletivo, de branco levemente
 * quente (a tabela 9.2 de "Real-Time Rendering", 4ª ed.) —, a tinta da borda (1,0, 1,0, 0,99); rugosidade de 0,12 a
 * 0,22. Parâmetros: os de `noble`.
 */
export const silver = noble('material.silver', {
    f0: [0.972, 0.96, 0.915],
    f82: [1, 1, 0.99],
    roughness: [0.12, 0.22],
    seed: 35,
});

/**
 * `material.goldLeaf` — folha de ouro: as folhas quadradas assentadas uma a uma (`pattern.bricks` em grade, 6 × 6 por
 * unidade do padrão), cada uma de um tom (± 12 %), amassada (um grão de quatro oitavas em relevo, `relief` em unidades
 * do padrão: o realce quebra em facetas miúdas) e com a borda levantada; nas emendas e onde a folha gastou (as manchas
 * em que o grão do desgaste passa de um nível, `wear` em [0, 1]) aparece o bolo — a base de argila vermelho-escura
 * (`bole_color`), fosca. O ouro é o do `gold` (F0 (1,0, 0,71, 0,29)), mais áspero onde está amassado. Parâmetros:
 * `color`, `edge_tint`, `bole_color`, `roughness`, `wear`, `relief`, `pattern_scale`.
 */
export const goldLeaf = Subgraph.point(
    new NodeGraph({
        nodes: {
            ...patternSpace(),
            sheet: pattern.bricks.with({
                scale: [6, 6],
                shift: 0,
                gap: 0.02,
                bevel: 0.08,
                seed: 41,
            }),
            crumple: pattern.grain.with({ scale: [34, 34], octaves: 4, gain: 0.55, seed: 42 }),
            worn: pattern.grain.with({ scale: [11, 11], octaves: 4, gain: 0.6, seed: 43 }),
            tone: map.range.with({ out_min: 0.88, out_max: 1.12 }),
            pure: math.value3.with({ value: [1, 0.71, 0.29] }),
            toned: math.scale3,
            rough: map.range.with({ in_min: -1, in_max: 1, out_min: 0.16, out_max: 0.34 }),
            edge: surface.bump.with({ strength: 0.006 }),
            fold: surface.bump.with({ strength: 0.0022 }),
            leaf: bsdf.conductor.with({ edge_tint: [1, 0.92, 0.66] }),
            leaf_surface: closure.normal,
            bole: bsdf.diffuse.with({ color: [0.2, 0.05, 0.035], roughness: 0.9 }),
            wear: math.value.with({ value: 0.25 }),
            // O desgaste: 1 onde o grão passa do nível (mais desgaste, nível mais baixo).
            level: map.range.with({ in_min: 0, in_max: 1, out_min: 1.2, out_max: 0.1 }),
            above: math.sub,
            bare: map.range.with({ in_min: 0, in_max: 0.08, out_min: 0, out_max: 1 }),
            shown: math.max,
            out: closure.mix,
        },
        links: [
            ...SPACE_LINKS,
            ...patternLinks('sheet', 'crumple', 'worn'),
            ['sheet.brick', 'tone.x'],
            ['pure.value', 'toned.v'],
            ['tone.value', 'toned.s'],
            ['toned.value', 'leaf.color'],
            ['crumple.value', 'rough.x'],
            ['rough.value', 'leaf.roughness'],
            ...bumpLinks('edge', 'sheet.gradient'),
            ...bumpLinks('fold', 'crumple.gradient', 'edge.value'),
            ['leaf.value', 'leaf_surface.c'],
            ['fold.value', 'leaf_surface.normal'],
            ['wear.value', 'level.x'],
            ['worn.value', 'above.a'],
            ['level.value', 'above.b'],
            ['above.value', 'bare.x'],
            ['sheet.mortar', 'shown.a'],
            ['bare.value', 'shown.b'],
            ['leaf_surface.value', 'out.a'],
            ['bole.value', 'out.b'],
            ['shown.value', 'out.t'],
        ],
        output: 'out.value',
    }),
    {
        name: 'material.goldLeaf',
        ...SAMPLE_INPUT,
        expose: [
            ['pure.value', 'color'],
            ['leaf.edge_tint', 'edge_tint'],
            ['bole.color', 'bole_color'],
            ['rough.out_min', 'roughness'],
            ['wear.value', 'wear'],
            ['fold.strength', 'relief'],
            PATTERN_SCALE,
        ],
    },
);

/**
 * `material.copper` — cobre polido: F0 (0,955, 0,638, 0,538), tinta da borda (0,98, 0,96, 0,95); rugosidade 0,06 —
 * espelho rosado. Parâmetros: os de `metalPolished`.
 */
export const copper = metal('material.copper', 0.06, 0, [0.955, 0.638, 0.538], [0.98, 0.96, 0.95]);

/**
 * `material.brass` — latão polido (C260, 70 % cobre e 30 % zinco): F0 (0,910, 0,778, 0,423), tinta da borda
 * (0,99, 0,98, 0,9) estimada; rugosidade 0,07 — amarelo mais pálido e esverdeado que o ouro. Parâmetros: os de
 * `metalPolished`.
 */
export const brass = metal('material.brass', 0.07, 0, [0.91, 0.778, 0.423], [0.99, 0.98, 0.9]);

/**
 * `material.chrome` — cromo (a camada eletrodepositada): F0 (0,549, 0,556, 0,554) — reflete pouco mais da metade, o
 * espelho escuro e neutro —, tinta da borda (0,75, 0,75, 0,81): o cromo escurece antes de clarear na borda; rugosidade
 * 0,02. Parâmetros: os de `metalPolished`.
 */
export const chrome = metal('material.chrome', 0.02, 0, [0.549, 0.556, 0.554], [0.75, 0.75, 0.81]);

// O aço inoxidável (liga de ferro e cromo): a refletância de frente do ferro (0,560, 0,570, 0,580) e a do cromo
// (0,549, 0,556, 0,554) quase coincidem (Akenine-Möller et al., tabela 9.2); a tinta da borda é a do cromo, a camada
// passiva da superfície.
const STEEL_F0 = [0.56, 0.57, 0.58] as const;
const STEEL_F82 = [0.76, 0.76, 0.81] as const;

/**
 * `material.metalBrushed` — aço inoxidável escovado (o acabamento acetinado, de lixa passada à mão): cinza-chumbo,
 * sem imagem de espelho — reflete a metade da luz (F0 0,56), e o tom vem do que está em volta: escuro onde reflete o
 * ambiente escuro, claro nas manchas das fontes de luz. Os riscos são os de `pattern.brush`: quatro passadas de riscos
 * finos ao longo de u, cada uma com a direção variando alguns graus de lugar para lugar (`spread`, 0,2 rad: levemente
 * curvos, cruzando-se em ângulos pequenos), de comprimento e fundura variados, e os riscos fundos isolados (`deep`: uma
 * célula em trinta, curtos), mais as faixas largas das passadas da lixa (`pattern.grain`). O lobo é largo e anisotrópico
 * (`anisotropy`, 0,15; rugosidade de `roughness`, 0,33, a `scratch_roughness`, 0,47, de risco para risco e mais nos
 * fundos), com a tangente na direção dos riscos no ponto (`pattern.brush.direction`): a luz de uma fonte larga (uma
 * janela, um painel: `RectLight`) aparece como uma mancha grande e macia, esticada através da escova, e os riscos
 * inclinam a normal (`relief`, a altura em unidades do padrão) e quebram a mancha em fios claros e escuros. O reflexo
 * do ambiente não é traçado (o lobo é áspero: `closure_base_mirror`): vem da radiância das sondas. Parâmetros: `color`
 * (F0), `edge_tint` (F82), `roughness`, `scratch_roughness`, `anisotropy`, `relief`, `spread`, `deep`,
 * `pattern_scale`.
 */
export const metalBrushed = Subgraph.point(
    new NodeGraph({
        nodes: {
            ...patternSpace(),
            scratch: pattern.brush.with({
                scale: [3, 380],
                spread: 0.2,
                bend_scale: [0.5, 1],
                deep: 0.035,
                seed: 6,
            }),
            pass: pattern.grain.with({ scale: [0.6, 38], octaves: 3, gain: 0.6, seed: 16 }),
            both: math.add,
            rough: map.range.with({ in_min: -1.6, in_max: 1, out_min: 0.33, out_max: 0.47 }),
            gouged: map.range.with({ out_min: 0, out_max: 0.18 }),
            rougher: math.add,
            along: surface.direction,
            relief: surface.bump.with({ strength: 0.001 }),
            pass_relief: surface.bump.with({ strength: 0.0003 }),
            metal: bsdf.conductor.with({
                color: [...STEEL_F0],
                edge_tint: [...STEEL_F82],
                anisotropy: 0.15,
            }),
            out: closure.normal,
        },
        links: [
            ...SPACE_LINKS,
            ...patternLinks('scratch', 'pass'),
            ['scratch.value', 'both.a'],
            ['pass.value', 'both.b'],
            ['both.value', 'rough.x'],
            ['scratch.deep', 'gouged.x'],
            ['rough.value', 'rougher.a'],
            ['gouged.value', 'rougher.b'],
            ['rougher.value', 'metal.roughness'],
            ['scratch.direction', 'along.direction'],
            ['uv.du', 'along.du'],
            ['uv.dv', 'along.dv'],
            ['along.value', 'metal.tangent'],
            ...bumpLinks('relief', 'scratch.gradient'),
            ...bumpLinks('pass_relief', 'pass.gradient', 'relief.value'),
            ['metal.value', 'out.c'],
            ['pass_relief.value', 'out.normal'],
        ],
        output: 'out.value',
    }),
    {
        name: 'material.metalBrushed',
        ...SAMPLE_INPUT,
        expose: [
            ['metal.color', 'color'],
            ['metal.edge_tint', 'edge_tint'],
            ['rough.out_min', 'roughness'],
            ['rough.out_max', 'scratch_roughness'],
            ['metal.anisotropy', 'anisotropy'],
            ['relief.strength', 'relief'],
            ['scratch.spread', 'spread'],
            ['scratch.deep', 'deep'],
            PATTERN_SCALE,
        ],
    },
);

/** Valores de uma pintura metálica: o F0 e a tinta da borda dos flocos tingidos, o pigmento do fundo e o floco. */
interface PaintValues {
    readonly color: Rgb;
    readonly edge_tint: Rgb;
    readonly base_color: Rgb;
    /** O tamanho do floco (µm), os flocos por área de floco e a inclinação máxima dele (a tangente). */
    readonly flake_size: number;
    readonly flake_density: number;
    readonly flake_tilt: number;
    /** A rugosidade da distribuição das orientações dos flocos e a do lobo de cada floco. */
    readonly flake_roughness: number;
    readonly sparkle_roughness: number;
}

/**
 * Sub-grafo da pintura de carro metálica: a base é metal — as plaquetas de alumínio no aglutinante tingido, um
 * condutor colorido de lobo médio que cobre `flake_weight` da base, sobre um resto de pigmento difuso escuro —, e por
 * cima o verniz, um dielétrico liso em camada com a normal própria. Os flocos têm tamanho físico: `flake_size`
 * micrômetros, `flake_density` flocos por área de floco, numa peça em que uma unidade do padrão mede `pattern_size`
 * metros — o espaço dos flocos (`flake_uv`) é o do padrão vezes os flocos por unidade dele. Menores que o pixel, são
 * os brilhos pontuais (`pattern.glints` e `closure.glints`: a contagem dos alinhados com cada luz); maiores (de muito
 * perto), cada um aparece com a sua inclinação e o seu tom (`pattern.cells`).
 */
function paint(name: string, v: PaintValues): NodeDefinition {
    return Subgraph.point(
        new NodeGraph({
            nodes: {
                ...patternSpace(),
                // Flocos por unidade do padrão (por lado): `pattern_size` · 10⁶ / `flake_size` · √`flake_density`.
                size: math.value.with({ value: 0.5 }),
                micron: math.value.with({ value: v.flake_size }),
                density: math.value.with({ value: v.flake_density }),
                mega: math.value.with({ value: 1e6 }),
                span: math.mul,
                pitch: math.div,
                packed: math.sqrt,
                per_unit: math.mul,
                repeats: math.split2,
                flakes_u: math.mul,
                flakes_v: math.mul,
                flake_scale: math.combine2,
                flake_uv: surface.uvSpace,
                flake: pattern.cells.with({ scale: 1, jitter: 1, crease: 0.1, seed: 8 }),
                // Os flocos menores que o pixel: a contagem dos alinhados com cada luz (os brilhos pontuais).
                sparkle: pattern.glints.with({ scale: 1, seed: 10 }),
                glinting: closure.glints.with({ roughness: v.sparkle_roughness }),
                // O floco resolvido (mais de dois pixels de lado): 1; menor que o pixel: 0 — o tom e a inclinação de
                // cada floco só aparecem quando ele aparece (abaixo do pixel, a média deles é o lobo do condutor).
                resolved: map.range.with({ in_min: 0.4, in_max: 0.9, out_min: 1, out_max: 0 }),
                peel: pattern.grain.with({ scale: [7, 7], octaves: 2, seed: 9 }),
                pigment: math.value3.with({ value: [...v.color] }),
                tone: map.range.with({ out_min: 0.65, out_max: 1.35 }),
                even: math.value.with({ value: 1 }),
                seen_tone: math.mix,
                tinted: math.scale3,
                slope: math.value.with({ value: v.flake_tilt }),
                seen_slope: math.mul,
                tilt: surface.bump,
                flakes: bsdf.conductor.with({
                    roughness: v.flake_roughness,
                    edge_tint: [...v.edge_tint],
                }),
                layer_of_flakes: closure.normal,
                body: bsdf.diffuse.with({ color: [...v.base_color], roughness: 0.5 }),
                base: closure.mix.with({ t: 0.92 }),
                wave: surface.bump.with({ strength: 0.0005 }),
                coat: bsdf.dielectric.with({ ior: 1.5, roughness: 0.02 }),
                coat_surface: closure.normal,
                out: closure.layer,
            },
            links: [
                ...SPACE_LINKS,
                ...patternLinks('peel'),
                ['size.value', 'span.a'],
                ['mega.value', 'span.b'],
                ['span.value', 'pitch.a'],
                ['micron.value', 'pitch.b'],
                ['density.value', 'packed.x'],
                ['pitch.value', 'per_unit.a'],
                ['packed.value', 'per_unit.b'],
                ['uv.wrap', 'repeats.v'],
                ['repeats.x', 'flakes_u.a'],
                ['per_unit.value', 'flakes_u.b'],
                ['repeats.y', 'flakes_v.a'],
                ['per_unit.value', 'flakes_v.b'],
                ['flakes_u.value', 'flake_scale.x'],
                ['flakes_v.value', 'flake_scale.y'],
                ['flake_scale.value', 'flake_uv.scale'],
                ...(['flake', 'sparkle'] as const).flatMap((id): [string, string][] => [
                    ['flake_uv.p', `${id}.p`],
                    ['flake_uv.width', `${id}.width`],
                    ['flake_uv.wrap', `${id}.wrap`],
                ]),
                ['flake_uv.width', 'resolved.x'],
                ['flake.cell', 'tone.x'],
                ['even.value', 'seen_tone.a'],
                ['tone.value', 'seen_tone.b'],
                ['resolved.value', 'seen_tone.t'],
                ['pigment.value', 'tinted.v'],
                ['seen_tone.value', 'tinted.s'],
                ['tinted.value', 'flakes.color'],
                ['slope.value', 'seen_slope.a'],
                ['resolved.value', 'seen_slope.b'],
                ['s.normal', 'tilt.normal'],
                ['flake_uv.du', 'tilt.du'],
                ['flake_uv.dv', 'tilt.dv'],
                ['flake.random', 'tilt.gradient'],
                ['seen_slope.value', 'tilt.strength'],
                ['flakes.value', 'glinting.c'],
                ['sparkle.cells', 'glinting.cells'],
                ['sparkle.count', 'glinting.count'],
                ['glinting.value', 'layer_of_flakes.c'],
                ['tilt.value', 'layer_of_flakes.normal'],
                ['body.value', 'base.a'],
                ['layer_of_flakes.value', 'base.b'],
                ...bumpLinks('wave', 'peel.gradient'),
                ['coat.value', 'coat_surface.c'],
                ['wave.value', 'coat_surface.normal'],
                ['coat_surface.value', 'out.top'],
                ['base.value', 'out.base'],
            ],
            output: 'out.value',
        }),
        {
            name,
            ...SAMPLE_INPUT,
            expose: [
                ['body.color', 'base_color'],
                ['pigment.value', 'flake_color'],
                ['flakes.edge_tint', 'flake_edge_tint'],
                ['flakes.roughness', 'flake_roughness'],
                ['base.t', 'flake_weight'],
                ['micron.value', 'flake_size'],
                ['density.value', 'flake_density'],
                ['slope.value', 'flake_tilt'],
                ['glinting.roughness', 'sparkle_roughness'],
                ['size.value', 'pattern_size'],
                ['out.top_color', 'coat_color'],
                ['coat.roughness', 'coat_roughness'],
                ['coat.ior', 'coat_ior'],
                ['out.top_weight', 'coat_weight'],
                ['wave.strength', 'orange_peel'],
                PATTERN_SCALE,
            ],
        },
    );
}

/**
 * `material.carPaint` — pintura de carro metálica (vermelha): metal sob verniz, como nos modelos de pintura das outras
 * engines (o Principled BSDF do Blender com `metallic` 1 e `coat` 1 de normal própria; o verniz de duas normais da
 * Unreal; as três camadas — base, flocos, verniz — do V-Ray e do Arnold). A base são as plaquetas de alumínio no
 * aglutinante tingido: um condutor da cor da tinta (`flake_color`, o F0: o alumínio vezes a cor do aglutinante na ida e
 * na volta) de lobo médio (`flake_roughness`, 0,38: a distribuição das orientações dos flocos) que cobre `flake_weight`
 * (0,92) da base — o brilho largo, liso e sedoso que segue a luz, a cara de metal —, sobre um resto de pigmento difuso
 * escuro (`base_color`). O floco é o automotivo fino: `flake_size` 20 µm (as plaquetas de alumínio das tintas de carro
 * têm de 10 a 30 µm), `flake_density` 1 (flocos por área de floco: a cobertura), numa peça em que uma unidade do padrão
 * mede `pattern_size` metros (0,5) — 25 000 flocos por unidade do padrão. A um metro são centenas de flocos por pixel:
 * a contagem dos alinhados com a luz (`pattern.glints` e `closure.glints`; cada floco um espelho pequeno,
 * `sparkle_roughness` 0,16) vai à média e o que se vê é o lobo liso, sem grão nem ponto isolado longe do realce; só de
 * muito perto, junto do realce, sobra um cintilar fino. Mais perto ainda, com o floco maior que o pixel, cada um
 * aparece (`pattern.cells`) com a normal inclinada (`flake_tilt`, a tangente da inclinação máxima: 0,1, cerca de 6°) e
 * o seu tom (± 35 %). A cor muda com o ângulo (o flop): clara e metálica perto da direção do reflexo; fora dela e no
 * rasante, escura e saturada (`flake_edge_tint`, a tinta da borda — o caminho mais longo no aglutinante). Por cima, o
 * verniz: um dielétrico liso em camada (IOR 1,5, rugosidade 0,02: o reflexo nítido do ambiente) com a normal própria —
 * lisa, separada da dos flocos, com a casca de laranja muito leve (`pattern.grain` largo, `orange_peel` a altura em
 * unidades do padrão). Valores de partida do exemplo `open_pbr_carpaint.mtlx` do MaterialX (a base de condutor sob o
 * verniz). Parâmetros: `base_color`, `flake_color`, `flake_edge_tint`, `flake_roughness`, `flake_weight`,
 * `flake_size`, `flake_density`, `flake_tilt`, `sparkle_roughness`, `pattern_size`, `coat_color`, `coat_roughness`,
 * `coat_ior`, `coat_weight`, `orange_peel`, `pattern_scale`.
 */
export const carPaint = paint('material.carPaint', {
    color: [0.56, 0.035, 0.03],
    edge_tint: [0.3, 0.01, 0.015],
    base_color: [0.2, 0.006, 0.008],
    flake_size: 15,
    flake_density: 6,
    flake_tilt: 0.1,
    flake_roughness: 0.38,
    sparkle_roughness: 0.3,
});

/**
 * `material.carPaintSilver` — pintura de carro prata metálica: a mesma receita de `carPaint` com o aglutinante quase
 * incolor — os flocos com o F0 do alumínio pouco tingido (0,72, 0,73, 0,75) e a tinta da borda cinza (0,45): claro de
 * frente para a luz, cinza-escuro fora do reflexo. Parâmetros: os de `carPaint`.
 */
export const carPaintSilver = paint('material.carPaintSilver', {
    color: [0.72, 0.73, 0.75],
    edge_tint: [0.45, 0.45, 0.47],
    base_color: [0.1, 0.1, 0.105],
    flake_size: 15,
    flake_density: 6,
    flake_tilt: 0.1,
    flake_roughness: 0.38,
    sparkle_roughness: 0.3,
});

/**
 * `material.carPaintFlake` — pintura de floco grosso (o "metal flake" dos capacetes, dos barcos e dos carros
 * personalizados), azul: a receita de `carPaint` com plaquetas de 400 µm (`flake_size`) e mais inclinadas
 * (`flake_tilt` 0,26). A um metro são poucos flocos por pixel: os alinhados com a luz acendem um a um — pontos fortes
 * e ralos pela peça toda, o chuvisco denso no realce —, e de perto cada floco aparece com o seu tom. Parâmetros: os de
 * `carPaint`.
 */
export const carPaintFlake = paint('material.carPaintFlake', {
    color: [0.06, 0.16, 0.56],
    edge_tint: [0.01, 0.04, 0.3],
    base_color: [0.004, 0.012, 0.1],
    flake_size: 300,
    flake_density: 3,
    flake_tilt: 0.26,
    flake_roughness: 0.5,
    sparkle_roughness: 0.18,
});

/**
 * `material.metalOxidized` — metal oxidado (chapa de aço com ferrugem). O metal que sobra é o condutor liso e refletivo
 * (ferro, F0 (0,562, 0,565, 0,578) — Akenine-Möller et al., "Real-Time Rendering" 4ª ed., tabela 9.2; rugosidade 0,13),
 * que escurece e fica áspero perto da ferrugem (a mancha que a anuncia). A ferrugem é o óxido em pó (hematita e
 * goethita: difuso, sem brilho), de cor variada — do quase preto ao castanho, ao alaranjado `oxide_color` e a pontos
 * amarelados (uma rampa de quatro cores por dois grãos, um largo e um fino) — e em relevo: a crosta granulada (`relief`, em unidades
 * do padrão, pesada pela máscara) e a borda inchada, que sobe do metal para a crosta (`swell`, na faixa de transição).
 * A máscara soma as manchas largas (`pattern.grain` de cinco oitavas), os riscos que escorrem ao longo de v
 * (`pattern.grain` esticado: na esfera, de polo a polo) e os pites (`pattern.cells`: pontos no centro de algumas
 * células) ao avanço `oxidation` em [0, 1] (0,55: mais da metade tomada, com metal à vista; 0 quase limpo, só pites e
 * riscos; 1 tudo). Parâmetros: `color`, `roughness`, `oxide_color`, `oxide_roughness`, `oxidation`, `relief`, `swell`,
 * `pattern_scale`.
 */
export const metalOxidized = Subgraph.point(
    new NodeGraph({
        nodes: {
            ...patternSpace(),
            // A máscara: manchas largas, riscos ao longo de v e pites, mais o avanço.
            stain: pattern.grain.with({ scale: [3, 3], octaves: 5, gain: 0.55, seed: 13 }),
            drip: pattern.grain.with({ scale: [46, 2.2], octaves: 2, gain: 0.5, seed: 21 }),
            pit: pattern.cells.with({ scale: 110, jitter: 1, crease: 0.5, seed: 22 }),
            spread: map.range.with({ in_min: -1, in_max: 1, out_min: -4, out_max: 4, clamped: 0 }),
            run: map.range.with({ in_min: 0.12, in_max: 0.6, out_min: 0, out_max: 1.4 }),
            run_gate: map.range.with({ in_min: -0.25, in_max: 0.35 }),
            runs: math.mul,
            pit_core: map.range.with({ in_min: 0.35, in_max: 0.9, out_min: 0, out_max: 1 }),
            pit_some: map.range.with({ in_min: 0.7, in_max: 0.8, out_min: 0, out_max: 2.2 }),
            pits: math.mul,
            advance: math.value.with({ value: 0.55 }),
            bias: map.range.with({ out_min: -4.6, out_max: 4.2, clamped: 0 }),
            level_a: math.add,
            level_b: math.add,
            level: math.add,
            mask: map.range.with({ in_min: 0, in_max: 0.55 }),
            // A cor da ferrugem: um grão largo (as zonas) e um fino (os pontos) na rampa de quatro cores.
            zone: pattern.grain.with({ scale: [9, 9], octaves: 4, gain: 0.6, seed: 14 }),
            crust: pattern.grain.with({ scale: [80, 80], octaves: 3, seed: 15 }),
            zone_t: map.range.with({ in_min: -1, in_max: 1, out_min: 0.05, out_max: 0.8 }),
            speck_t: map.range.with({ in_min: -1, in_max: 1, out_min: -0.22, out_max: 0.22 }),
            tone: math.add,
            dark: color.ramp.with({
                color_a: [0.012, 0.006, 0.005],
                color_b: [0.075, 0.026, 0.012],
                low: 0.08,
                high: 0.36,
            }),
            orange: math.value3.with({ value: [0.26, 0.085, 0.022] }),
            to_orange: map.range.with({ in_min: 0.36, in_max: 0.68 }),
            warm: math.mix3,
            yellow: math.value3.with({ value: [0.4, 0.2, 0.05] }),
            to_yellow: map.range.with({ in_min: 0.68, in_max: 0.98 }),
            powder: math.mix3,
            // O metal perto da ferrugem: mais escuro (a mancha) e mais áspero.
            near: map.range.with({ in_min: -1.6, in_max: 0, out_min: 0, out_max: 1 }),
            clean: math.value3.with({ value: [0.562, 0.565, 0.578] }),
            tarnished: math.value3.with({ value: [0.2, 0.13, 0.085] }),
            metal_color: math.mix3,
            metal_rough: map.range.with({ out_min: 0.13, out_max: 0.5 }),
            // O relevo: a crosta granulada sobre a ferrugem e a borda inchada na transição.
            height: math.value.with({ value: 0.0026 }),
            grown: math.mul,
            relief: surface.bump,
            fall: map.range.with({ out_min: 1, out_max: 0 }),
            band: math.mul,
            lift: math.value.with({ value: 0.02 }),
            raised: math.mul,
            edge: surface.bump,
            bare: bsdf.conductor,
            rust: bsdf.diffuse.with({ roughness: 1 }),
            rust_interface: bsdf.dielectric.with({
                ior: 1.5,
                roughness: 0.95,
                tint: [0.3, 0.3, 0.3],
            }),
            oxide: closure.add,
            mixed: closure.mix,
            out: closure.normal,
        },
        links: [
            ...SPACE_LINKS,
            ...patternLinks('stain', 'drip', 'pit', 'zone', 'crust'),
            ['stain.value', 'spread.x'],
            ['drip.value', 'run.x'],
            ['pit.height', 'pit_core.x'],
            ['pit.cell', 'pit_some.x'],
            ['pit_core.value', 'pits.a'],
            ['pit_some.value', 'pits.b'],
            ['advance.value', 'bias.x'],
            ['spread.value', 'level_a.a'],
            ['run.value', 'runs.a'],
            ['zone.value', 'run_gate.x'],
            ['run_gate.value', 'runs.b'],
            ['runs.value', 'level_a.b'],
            ['level_a.value', 'level_b.a'],
            ['pits.value', 'level_b.b'],
            ['level_b.value', 'level.a'],
            ['bias.value', 'level.b'],
            ['level.value', 'mask.x'],
            ['zone.value', 'zone_t.x'],
            ['crust.value', 'speck_t.x'],
            ['zone_t.value', 'tone.a'],
            ['speck_t.value', 'tone.b'],
            ['tone.value', 'dark.t'],
            ['tone.value', 'to_orange.x'],
            ['tone.value', 'to_yellow.x'],
            ['dark.color', 'warm.a'],
            ['orange.value', 'warm.b'],
            ['to_orange.value', 'warm.t'],
            ['warm.value', 'powder.a'],
            ['yellow.value', 'powder.b'],
            ['to_yellow.value', 'powder.t'],
            ['powder.value', 'rust.color'],
            ['level.value', 'near.x'],
            ['clean.value', 'metal_color.a'],
            ['tarnished.value', 'metal_color.b'],
            ['near.value', 'metal_color.t'],
            ['metal_color.value', 'bare.color'],
            ['near.value', 'metal_rough.x'],
            ['metal_rough.value', 'bare.roughness'],
            ['mask.value', 'grown.a'],
            ['height.value', 'grown.b'],
            ...bumpLinks('relief', 'crust.gradient'),
            ['grown.value', 'relief.strength'],
            ['mask.value', 'fall.x'],
            ['mask.value', 'band.a'],
            ['fall.value', 'band.b'],
            ['band.value', 'raised.a'],
            ['lift.value', 'raised.b'],
            ...bumpLinks('edge', 'stain.gradient', 'relief.value'),
            ['raised.value', 'edge.strength'],
            ['rust_interface.value', 'oxide.a'],
            ['rust.value', 'oxide.b'],
            ['bare.value', 'mixed.a'],
            ['oxide.value', 'mixed.b'],
            ['mask.value', 'mixed.t'],
            ['mixed.value', 'out.c'],
            ['edge.value', 'out.normal'],
        ],
        output: 'out.value',
    }),
    {
        name: 'material.metalOxidized',
        ...SAMPLE_INPUT,
        expose: [
            ['clean.value', 'color'],
            ['metal_rough.out_min', 'roughness'],
            ['orange.value', 'oxide_color'],
            ['rust_interface.roughness', 'oxide_roughness'],
            ['advance.value', 'oxidation'],
            ['height.value', 'relief'],
            ['lift.value', 'swell'],
            PATTERN_SCALE,
        ],
    },
);
