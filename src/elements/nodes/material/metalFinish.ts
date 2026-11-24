import { NodeGraph } from '../../../scene/graph/NodeGraph';
import { Subgraph } from '../../../scene/graph/Subgraph';
import { bsdf } from '../bsdf';
import { closure } from '../closure';
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

// Metais com acabamento (spec 011, T117): a camada anódica tingida sobre o alumínio, a pele de fundição do ferro, a
// pátina do bronze nos recessos e as mossas do martelo. A estrutura é calculada por pixel pelos nós de padrão sobre o
// uv (`pattern_scale` repetições por unidade de uv; numa esfera, (2, 1)).

/**
 * `material.aluminiumAnodized` — alumínio anodizado colorido: o alumínio jateado (F0 (0,912, 0,914, 0,920); rugosidade
 * 0,3, com o grão fino do jato em relevo) sob a camada anódica — alumina porosa (IOR 1,65) tingida, um dielétrico
 * acetinado em camada (`closure.layer`, rugosidade 0,28): a luz atravessa a camada, reflete no metal e volta com a cor
 * do corante (`color`, a cor depois da ida e da volta), com o brilho branco e largo da camada por cima. Parâmetros:
 * `color`, `roughness`, `coat_roughness`, `coat_ior`, `relief`, `pattern_scale`.
 */
export const aluminiumAnodized = Subgraph.point(
    new NodeGraph({
        nodes: {
            ...patternSpace(),
            blast: pattern.grain.with({ scale: [260, 260], octaves: 2, seed: 41 }),
            relief: surface.bump.with({ strength: 0.0004 }),
            metal: bsdf.conductor.with({
                color: [0.912, 0.914, 0.92],
                edge_tint: [0.97, 0.979, 0.988],
                roughness: 0.3,
            }),
            base: closure.normal,
            film: bsdf.dielectric.with({ ior: 1.65, roughness: 0.28 }),
            out: closure.layer.with({ top_color: [0.06, 0.25, 0.8] }),
        },
        links: [
            ...SPACE_LINKS,
            ...patternLinks('blast'),
            ...bumpLinks('relief', 'blast.gradient'),
            ['metal.value', 'base.c'],
            ['relief.value', 'base.normal'],
            ['film.value', 'out.top'],
            ['base.value', 'out.base'],
        ],
        output: 'out.value',
    }),
    {
        name: 'material.aluminiumAnodized',
        ...SAMPLE_INPUT,
        expose: [
            ['out.top_color', 'color'],
            ['metal.roughness', 'roughness'],
            ['film.roughness', 'coat_roughness'],
            ['film.ior', 'coat_ior'],
            ['relief.strength', 'relief'],
            PATTERN_SCALE,
        ],
    },
);

/**
 * `material.castIron` — ferro fundido bruto (a pele de fundição em areia): o ferro (F0 (0,562, 0,565, 0,578)) coberto
 * pela carepa escura de óxido — tratado como um condutor escuro e áspero (`color`, F0 0,17, estimado; rugosidade de 0,5
 * a 0,72 pelo grão) —, com a textura do molde de areia em relevo (`pattern.grain` de três oitavas, `relief` em unidades
 * do padrão), manchas largas mais pardas (o óxido vermelho que começa) e os poros de gás (`pattern.cells`: uma célula
 * em dezesseis, escura e funda). Parâmetros: `color`, `stain_color`, `roughness`, `relief`, `pattern_scale`.
 */
export const castIron = Subgraph.point(
    new NodeGraph({
        nodes: {
            ...patternSpace(),
            sand: pattern.grain.with({ scale: [110, 110], octaves: 3, gain: 0.6, seed: 43 }),
            mottle: pattern.grain.with({ scale: [5, 5], octaves: 4, gain: 0.55, seed: 44 }),
            pore: pattern.cells.with({ scale: 64, jitter: 1, crease: 0.45, seed: 45 }),
            iron: math.value3.with({ value: [0.17, 0.165, 0.16] }),
            stain: math.value3.with({ value: [0.17, 0.115, 0.08] }),
            stained: map.range.with({ in_min: 0, in_max: 0.5 }),
            toned: math.mix3,
            // Os poros: as células escolhidas, no miolo delas.
            chosen: map.range.with({ in_min: 0.935, in_max: 0.945 }),
            core: map.range.with({ in_min: 0.3, in_max: 0.8 }),
            hole: math.mul,
            shade: map.range.with({ out_min: 1, out_max: 0.25 }),
            lit: math.scale3,
            rough: map.range.with({ in_min: -0.6, in_max: 0.6, out_min: 0.5, out_max: 0.72 }),
            relief: surface.bump.with({ strength: 0.0022 }),
            depth: map.range.with({ out_min: 0, out_max: -0.003 }),
            pit: surface.bump,
            metal: bsdf.conductor.with({ edge_tint: [0.8, 0.8, 0.82] }),
            out: closure.normal,
        },
        links: [
            ...SPACE_LINKS,
            ...patternLinks('sand', 'mottle', 'pore'),
            ['mottle.value', 'stained.x'],
            ['iron.value', 'toned.a'],
            ['stain.value', 'toned.b'],
            ['stained.value', 'toned.t'],
            ['pore.cell', 'chosen.x'],
            ['pore.height', 'core.x'],
            ['chosen.value', 'hole.a'],
            ['core.value', 'hole.b'],
            ['hole.value', 'shade.x'],
            ['toned.value', 'lit.v'],
            ['shade.value', 'lit.s'],
            ['lit.value', 'metal.color'],
            ['sand.value', 'rough.x'],
            ['rough.value', 'metal.roughness'],
            ...bumpLinks('relief', 'sand.gradient'),
            ['chosen.value', 'depth.x'],
            ...bumpLinks('pit', 'pore.gradient', 'relief.value'),
            ['depth.value', 'pit.strength'],
            ['metal.value', 'out.c'],
            ['pit.value', 'out.normal'],
        ],
        output: 'out.value',
    }),
    {
        name: 'material.castIron',
        ...SAMPLE_INPUT,
        expose: [
            ['iron.value', 'color'],
            ['stain.value', 'stain_color'],
            ['rough.out_min', 'roughness'],
            ['relief.strength', 'relief'],
            PATTERN_SCALE,
        ],
    },
);

/**
 * `material.bronzePatina` — bronze com pátina verde: o bronze (liga de cobre e estanho; F0 (0,85, 0,62, 0,40),
 * estimado entre o do cobre e o do latão) escurecido pelo óxido castanho onde não é tocado (`color`, rugosidade 0,34) e
 * polido nos altos (`worn_color`, rugosidade 0,16); a superfície modelada tem altos e recessos (`pattern.grain` largo,
 * `relief` em unidades do padrão) e a pátina — o carbonato básico de cobre, um pó fosco verde-azulado
 * (`patina_color`, do verde ao verde claro por um grão fino) — fica nos recessos, onde a água para: a máscara é o
 * relevo abaixo do nível `patina` (0,42: perto de metade da peça; 0 limpa, 1 tomada), com a borda quebrada por um grão fino e os
 * escorridos ao longo de v. Parâmetros: `color`, `worn_color`, `patina_color`, `patina`, `roughness`, `relief`,
 * `pattern_scale`.
 */
export const bronzePatina = Subgraph.point(
    new NodeGraph({
        nodes: {
            ...patternSpace(),
            form: pattern.grain.with({ scale: [11, 11], octaves: 4, gain: 0.5, seed: 51 }),
            edge: pattern.grain.with({ scale: [70, 70], octaves: 3, gain: 0.6, seed: 52 }),
            drip: pattern.grain.with({ scale: [40, 3], octaves: 2, seed: 53 }),
            // O nível da pátina: sobe com o parâmetro, com a borda quebrada e os escorridos.
            advance: math.value.with({ value: 0.42 }),
            level: map.range.with({ out_min: -0.75, out_max: 0.75 }),
            ragged: map.range.with({ in_min: -1, in_max: 1, out_min: -0.16, out_max: 0.16 }),
            run: map.range.with({ in_min: 0.1, in_max: 0.6, out_min: 0, out_max: 0.3 }),
            low_a: math.sub,
            low_b: math.add,
            low: math.add,
            mask: map.range.with({ in_min: -0.14, in_max: 0.14 }),
            // O metal: castanho escuro nos baixos, polido nos altos.
            high: map.range.with({ in_min: 0, in_max: 0.5 }),
            dull: math.value3.with({ value: [0.25, 0.135, 0.06] }),
            worn: math.value3.with({ value: [0.85, 0.62, 0.4] }),
            bare_color: math.mix3,
            bare_rough: map.range.with({ out_min: 0.34, out_max: 0.16 }),
            bare: bsdf.conductor.with({ edge_tint: [0.98, 0.96, 0.9] }),
            // A pátina: do verde ao verde claro.
            tone: map.range.with({ in_min: -0.6, in_max: 0.6 }),
            green: math.value3.with({ value: [0.12, 0.33, 0.27] }),
            pale: math.value3.with({ value: [0.33, 0.55, 0.47] }),
            verdigris: math.mix3,
            powder: bsdf.diffuse.with({ roughness: 1 }),
            mixed: closure.mix,
            relief: surface.bump.with({ strength: 0.016 }),
            crust: surface.bump,
            crust_height: map.range.with({ out_min: 0, out_max: 0.0012 }),
            out: closure.normal,
        },
        links: [
            ...SPACE_LINKS,
            ...patternLinks('form', 'edge', 'drip'),
            ['advance.value', 'level.x'],
            ['edge.value', 'ragged.x'],
            ['drip.value', 'run.x'],
            ['level.value', 'low_a.a'],
            ['form.value', 'low_a.b'],
            ['low_a.value', 'low_b.a'],
            ['ragged.value', 'low_b.b'],
            ['low_b.value', 'low.a'],
            ['run.value', 'low.b'],
            ['low.value', 'mask.x'],
            ['form.value', 'high.x'],
            ['dull.value', 'bare_color.a'],
            ['worn.value', 'bare_color.b'],
            ['high.value', 'bare_color.t'],
            ['bare_color.value', 'bare.color'],
            ['high.value', 'bare_rough.x'],
            ['bare_rough.value', 'bare.roughness'],
            ['edge.value', 'tone.x'],
            ['green.value', 'verdigris.a'],
            ['pale.value', 'verdigris.b'],
            ['tone.value', 'verdigris.t'],
            ['verdigris.value', 'powder.color'],
            ['bare.value', 'mixed.a'],
            ['powder.value', 'mixed.b'],
            ['mask.value', 'mixed.t'],
            ...bumpLinks('relief', 'form.gradient'),
            ['mask.value', 'crust_height.x'],
            ...bumpLinks('crust', 'edge.gradient', 'relief.value'),
            ['crust_height.value', 'crust.strength'],
            ['mixed.value', 'out.c'],
            ['crust.value', 'out.normal'],
        ],
        output: 'out.value',
    }),
    {
        name: 'material.bronzePatina',
        ...SAMPLE_INPUT,
        expose: [
            ['dull.value', 'color'],
            ['worn.value', 'worn_color'],
            ['green.value', 'patina_color'],
            ['advance.value', 'patina'],
            ['bare_rough.out_min', 'roughness'],
            ['relief.strength', 'relief'],
            PATTERN_SCALE,
        ],
    },
);

/**
 * `material.metalHammered` — metal martelado (cobre batido): o condutor polido (cobre, F0 (0,955, 0,638, 0,538), tinta
 * da borda (0,98, 0,96, 0,95); rugosidade de 0,06 a 0,085 de mossa para mossa) com as mossas do martelo —
 * calotas côncavas (`pattern.dents`: 16 por unidade do padrão) de fundo liso e aresta viva onde se encontram; a
 * profundidade é `relief` (unidades do padrão por unidade da altura da mossa). Cada mossa é um espelho côncavo: o
 * reflexo do ambiente se repete, pequeno, de faceta em faceta. Parâmetros: `color` (F0), `edge_tint` (F82),
 * `roughness`, `relief`, `pattern_scale`.
 */
export const metalHammered = Subgraph.point(
    new NodeGraph({
        nodes: {
            ...patternSpace(),
            dent: pattern.dents.with({ scale: 16, jitter: 0.9, seed: 61 }),
            rough: map.range.with({ out_min: 0.06, out_max: 0.085 }),
            relief: surface.bump.with({ strength: 0.02 }),
            metal: bsdf.conductor.with({
                color: [0.955, 0.638, 0.538],
                edge_tint: [0.98, 0.96, 0.95],
            }),
            out: closure.normal,
        },
        links: [
            ...SPACE_LINKS,
            ...patternLinks('dent'),
            ['dent.cell', 'rough.x'],
            ['rough.value', 'metal.roughness'],
            ...bumpLinks('relief', 'dent.gradient'),
            ['metal.value', 'out.c'],
            ['relief.value', 'out.normal'],
        ],
        output: 'out.value',
    }),
    {
        name: 'material.metalHammered',
        ...SAMPLE_INPUT,
        expose: [
            ['metal.color', 'color'],
            ['metal.edge_tint', 'edge_tint'],
            ['rough.out_min', 'roughness'],
            ['relief.strength', 'relief'],
            PATTERN_SCALE,
        ],
    },
);
