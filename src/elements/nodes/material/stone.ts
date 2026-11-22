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
import {
    BRICK_BOND,
    BRICK_FACE,
    BRICK_SAND,
    MUD_CHECKS,
    MUD_FACE,
    MUD_PLATES,
    relief,
    SANDSTONE_GRAIN,
    SANDSTONE_STRATA,
    SANDSTONE_WEATHER,
} from './relief';

// Pedra, construção e terra (spec 011, T117): dielétricos opacos — um difuso áspero sob uma interface mineral (IOR 1,5
// a 1,55: o quartzo 1,544, o feldspato 1,52 a 1,53, a calcita 1,49 a 1,66; a pasta de cimento e a argila queimada na
// mesma faixa) —, cada um com a estrutura que o nome promete, calculada por pixel pelos nós de padrão sobre o uv
// (`pattern_scale` repetições por unidade de uv; numa esfera, (2, 1)). O arenito, o tijolo e o barro seco têm o relevo
// em milímetros (`relief.*`: na normal, e na geometria com `Displacements`), com `scale` unidades do mundo por metro.

/**
 * `material.concrete` — concreto aparente: a pasta de cimento cinza (`color`, albedo 0,36) com as manchas largas da
 * cura e da umidade (`pattern.grain` de cinco oitavas: ± 24 % no tom), a areia à vista (um grão fino em relevo,
 * `relief` em unidades do padrão) e as bolhas de ar da fôrma (`pattern.cells`: uma célula em catorze, escura no miolo e
 * funda — `pit_depth`); fosco, sem realce (rugosidade 0,85). Parâmetros: `color`, `roughness`, `relief`, `pit_depth`,
 * `pattern_scale`.
 */
export const concrete = Subgraph.point(
    new NodeGraph({
        nodes: {
            ...patternSpace(),
            stain: pattern.grain.with({ scale: [2.6, 2.6], octaves: 5, gain: 0.55, seed: 111 }),
            sand: pattern.grain.with({ scale: [170, 170], octaves: 2, seed: 112 }),
            bubble: pattern.cells.with({ scale: 64, jitter: 1, crease: 0.5, seed: 113 }),
            cement: math.value3.with({ value: [0.37, 0.36, 0.34] }),
            cure: map.range.with({ in_min: -0.6, in_max: 0.6, out_min: 0.74, out_max: 1.22 }),
            speck: map.range.with({ in_min: -0.6, in_max: 0.6, out_min: 0.9, out_max: 1.1 }),
            chosen: map.range.with({ in_min: 0.925, in_max: 0.935 }),
            core: map.range.with({ in_min: 0.25, in_max: 0.7 }),
            hole: math.mul,
            hollow: map.range.with({ out_min: 1, out_max: 0.3 }),
            tone_a: math.mul,
            tone: math.mul,
            lit: math.scale3,
            relief: surface.bump.with({ strength: 0.0009 }),
            depth: math.value.with({ value: 0.007 }),
            sunk: math.mul,
            down: map.range.with({ out_min: 0, out_max: -1 }),
            pit: surface.bump,
            body: bsdf.diffuse.with({ roughness: 0.9 }),
            specular: bsdf.dielectric.with({ ior: 1.5, roughness: 0.85 }),
            sum: closure.add,
            out: closure.normal,
        },
        links: [
            ...SPACE_LINKS,
            ...patternLinks('stain', 'sand', 'bubble'),
            ['stain.value', 'cure.x'],
            ['sand.value', 'speck.x'],
            ['bubble.cell', 'chosen.x'],
            ['bubble.height', 'core.x'],
            ['chosen.value', 'hole.a'],
            ['core.value', 'hole.b'],
            ['hole.value', 'hollow.x'],
            ['cure.value', 'tone_a.a'],
            ['speck.value', 'tone_a.b'],
            ['tone_a.value', 'tone.a'],
            ['hollow.value', 'tone.b'],
            ['cement.value', 'lit.v'],
            ['tone.value', 'lit.s'],
            ['lit.value', 'body.color'],
            ...bumpLinks('relief', 'sand.gradient'),
            ['chosen.value', 'down.x'],
            ['down.value', 'sunk.a'],
            ['depth.value', 'sunk.b'],
            ...bumpLinks('pit', 'bubble.gradient', 'relief.value'),
            ['sunk.value', 'pit.strength'],
            ['specular.value', 'sum.a'],
            ['body.value', 'sum.b'],
            ['sum.value', 'out.c'],
            ['pit.value', 'out.normal'],
        ],
        output: 'out.value',
    }),
    {
        name: 'material.concrete',
        ...SAMPLE_INPUT,
        expose: [
            ['cement.value', 'color'],
            ['specular.roughness', 'roughness'],
            ['relief.strength', 'relief'],
            ['depth.value', 'pit_depth'],
            PATTERN_SCALE,
        ],
    },
);

/**
 * `material.granite` — granito polido: os cristais dos três minerais (`pattern.cells`: 62 por unidade do padrão, cada
 * célula um cristal) — o quartzo cinza e translúcido (`quartz_color`, 30 % dos cristais), o feldspato rosado
 * (`color`, 45 %) e o claro (`pale_color`, 25 %) — com as lamelas pretas da biotita (`mica_color`: células menores, uma
 * em seis) e o tom variando dentro de cada cristal (um grão fino); por cima, o polimento: uma interface só, lisa (IOR
 * 1,55, rugosidade 0,05 — o reflexo nítido do ambiente por cima dos grãos), um pouco mais áspera nas juntas dos
 * cristais. Parâmetros: `color`, `pale_color`, `quartz_color`, `mica_color`, `roughness`, `ior`, `pattern_scale`.
 */
export const granite = Subgraph.point(
    new NodeGraph({
        nodes: {
            ...patternSpace(),
            crystal: pattern.cells.with({ scale: 62, jitter: 1, crease: 0.08, seed: 121 }),
            flake: pattern.cells.with({ scale: 120, jitter: 1, crease: 0.3, seed: 122 }),
            cloud: pattern.grain.with({ scale: [120, 120], octaves: 2, seed: 123 }),
            quartz: math.value3.with({ value: [0.3, 0.29, 0.28] }),
            feldspar: math.value3.with({ value: [0.6, 0.42, 0.35] }),
            pale: math.value3.with({ value: [0.74, 0.71, 0.66] }),
            mica: math.value3.with({ value: [0.025, 0.025, 0.03] }),
            is_feldspar: map.range.with({ in_min: 0.295, in_max: 0.305 }),
            is_pale: map.range.with({ in_min: 0.745, in_max: 0.755 }),
            two: math.mix3,
            three: math.mix3,
            within: map.range.with({ in_min: -0.6, in_max: 0.6, out_min: 0.86, out_max: 1.14 }),
            toned: math.scale3,
            is_mica: map.range.with({ in_min: 0.83, in_max: 0.84 }),
            mica_core: map.range.with({ in_min: 0.2, in_max: 0.5 }),
            mica_mask: math.mul,
            stone: math.mix3,
            rough: map.range.with({ out_min: 0.16, out_max: 0.05 }),
            body: bsdf.diffuse.with({ roughness: 0.3 }),
            specular: bsdf.dielectric.with({ ior: 1.55 }),
            out: closure.add,
        },
        links: [
            ...SPACE_LINKS,
            ...patternLinks('crystal', 'flake', 'cloud'),
            ['crystal.cell', 'is_feldspar.x'],
            ['crystal.cell', 'is_pale.x'],
            ['quartz.value', 'two.a'],
            ['feldspar.value', 'two.b'],
            ['is_feldspar.value', 'two.t'],
            ['two.value', 'three.a'],
            ['pale.value', 'three.b'],
            ['is_pale.value', 'three.t'],
            ['cloud.value', 'within.x'],
            ['three.value', 'toned.v'],
            ['within.value', 'toned.s'],
            ['flake.cell', 'is_mica.x'],
            ['flake.height', 'mica_core.x'],
            ['is_mica.value', 'mica_mask.a'],
            ['mica_core.value', 'mica_mask.b'],
            ['toned.value', 'stone.a'],
            ['mica.value', 'stone.b'],
            ['mica_mask.value', 'stone.t'],
            ['stone.value', 'body.color'],
            ['crystal.height', 'rough.x'],
            ['rough.value', 'specular.roughness'],
            ['specular.value', 'out.a'],
            ['body.value', 'out.b'],
        ],
        output: 'out.value',
    }),
    {
        name: 'material.granite',
        ...SAMPLE_INPUT,
        expose: [
            ['feldspar.value', 'color'],
            ['pale.value', 'pale_color'],
            ['quartz.value', 'quartz_color'],
            ['mica.value', 'mica_color'],
            ['rough.out_max', 'roughness'],
            ['specular.ior', 'ior'],
            PATTERN_SCALE,
        ],
    },
);

/**
 * `material.sandstone` — arenito bruto: os estratos (`pattern.grain` esticado ao longo de u) dão a cor, do ocre
 * (`color`) ao castanho ferruginoso (`dark_color`) e ao creme (`pale_color`), com os grãos de areia (`pattern.cells`:
 * o tom de grão para grão) e o fundo dos alvéolos mais escuro; fosco (rugosidade 0,9). O relevo é o de
 * `relief.sandstone`, em milímetros — os estratos moles recuados (`layer_height`, 4), os alvéolos da erosão
 * (`weather_height`, 3) e os grãos (`grain_height`, 0,3), com `scale` unidades do mundo por metro —, na normal; com
 * `Displacements.sandstone()` na entidade de uma `ParametricSurface`, na geometria. Parâmetros: `color`, `dark_color`,
 * `pale_color`, `roughness`, `layer_height`, `weather_height`, `grain_height`, `scale`, `pattern_scale`.
 */
export const sandstone = Subgraph.point(
    new NodeGraph({
        nodes: {
            ...patternSpace(),
            strata: pattern.grain.with(SANDSTONE_STRATA),
            weather: pattern.grain.with(SANDSTONE_WEATHER),
            grain: pattern.cells.with(SANDSTONE_GRAIN),
            ochre: math.value3.with({ value: [0.52, 0.4, 0.26] }),
            rusty: math.value3.with({ value: [0.4, 0.24, 0.13] }),
            cream: math.value3.with({ value: [0.66, 0.58, 0.45] }),
            to_rusty: map.range.with({ in_min: -0.42, in_max: -0.24, out_min: 1, out_max: 0 }),
            to_cream: map.range.with({ in_min: 0.2, in_max: 0.42 }),
            banded: math.mix3,
            layered: math.mix3,
            speck: map.range.with({ out_min: 0.72, out_max: 1.2 }),
            hollow: map.range.with({ in_min: -0.7, in_max: 0.2, out_min: 0.72, out_max: 1 }),
            tone: math.mul,
            lit: math.scale3,
            body: bsdf.diffuse.with({ roughness: 1 }),
            specular: bsdf.dielectric.with({ ior: 1.54, roughness: 0.9 }),
            sum: closure.add,
            tile: math.value2.with({ value: [1, 1] }),
            height: relief.sandstone,
            normal: surface.reliefNormal,
            out: closure.normal,
        },
        links: [
            ...SPACE_LINKS,
            ...patternLinks('strata', 'weather', 'grain'),
            ['tile.value', 'uv.scale'],
            ['strata.value', 'to_rusty.x'],
            ['strata.value', 'to_cream.x'],
            ['ochre.value', 'banded.a'],
            ['rusty.value', 'banded.b'],
            ['to_rusty.value', 'banded.t'],
            ['banded.value', 'layered.a'],
            ['cream.value', 'layered.b'],
            ['to_cream.value', 'layered.t'],
            ['grain.cell', 'speck.x'],
            ['weather.value', 'hollow.x'],
            ['speck.value', 'tone.a'],
            ['hollow.value', 'tone.b'],
            ['layered.value', 'lit.v'],
            ['tone.value', 'lit.s'],
            ['lit.value', 'body.color'],
            ['specular.value', 'sum.a'],
            ['body.value', 'sum.b'],
            ['s.value', 'height.s'],
            ['tile.value', 'height.pattern_scale'],
            ['height.value', 'normal.relief'],
            ['sum.value', 'out.c'],
            ['normal.value', 'out.normal'],
        ],
        output: 'out.value',
    }),
    {
        name: 'material.sandstone',
        ...SAMPLE_INPUT,
        expose: [
            ['ochre.value', 'color'],
            ['rusty.value', 'dark_color'],
            ['cream.value', 'pale_color'],
            ['specular.roughness', 'roughness'],
            ['height.layer_height', 'layer_height'],
            ['height.weather_height', 'weather_height'],
            ['height.grain_height', 'grain_height'],
            ['normal.scale', 'scale'],
            ['tile.value', 'pattern_scale'],
        ],
    },
);

/**
 * `material.brick` — parede de tijolo maciço com junta de argamassa (`pattern.bricks`: 4 tijolos e 12 fiadas por
 * unidade do padrão, amarração de meio tijolo): o barro queimado, do vermelho (`color`) ao castanho (`dark_color`) de
 * tijolo para tijolo, com alguns requeimados quase pretos (um em dez) e as manchas da queima dentro de cada um (um
 * grão); a argamassa de cimento e areia (`mortar_color`), salpicada. Fosco (rugosidade 0,9). O relevo é o de
 * `relief.brick`, em milímetros — a junta recuada (`joint_depth`, 5) e a face áspera (`face_height`, 0,9), com `scale`
 * unidades do mundo por metro —, na normal; com `Displacements.brick()` na entidade de uma `ParametricSurface`, na
 * geometria. Parâmetros: `color`, `dark_color`, `mortar_color`, `roughness`, `joint_depth`, `face_height`, `scale`,
 * `pattern_scale`.
 */
export const brick = Subgraph.point(
    new NodeGraph({
        nodes: {
            ...patternSpace(),
            bond: pattern.bricks.with(BRICK_BOND),
            face: pattern.grain.with(BRICK_FACE),
            sand: pattern.grain.with(BRICK_SAND),
            red: math.value3.with({ value: [0.46, 0.17, 0.1] }),
            brown: math.value3.with({ value: [0.3, 0.13, 0.085] }),
            burnt: math.value3.with({ value: [0.15, 0.075, 0.06] }),
            pick: map.range.with({ in_min: 0, in_max: 0.9 }),
            is_burnt: map.range.with({ in_min: 0.9, in_max: 0.91 }),
            fired: math.mix3,
            clay: math.mix3,
            blotch: map.range.with({ in_min: -0.6, in_max: 0.6, out_min: 0.78, out_max: 1.2 }),
            clay_lit: math.scale3,
            mortar: math.value3.with({ value: [0.5, 0.48, 0.43] }),
            gritty: map.range.with({ in_min: -0.6, in_max: 0.6, out_min: 0.8, out_max: 1.15 }),
            mortar_lit: math.scale3,
            wall: math.mix3,
            body: bsdf.diffuse.with({ roughness: 1 }),
            specular: bsdf.dielectric.with({ ior: 1.5, roughness: 0.9 }),
            sum: closure.add,
            tile: math.value2.with({ value: [1, 1] }),
            height: relief.brick,
            normal: surface.reliefNormal,
            out: closure.normal,
        },
        links: [
            ...SPACE_LINKS,
            ...patternLinks('bond', 'face', 'sand'),
            ['tile.value', 'uv.scale'],
            ['bond.brick', 'pick.x'],
            ['bond.brick', 'is_burnt.x'],
            ['red.value', 'fired.a'],
            ['brown.value', 'fired.b'],
            ['pick.value', 'fired.t'],
            ['fired.value', 'clay.a'],
            ['burnt.value', 'clay.b'],
            ['is_burnt.value', 'clay.t'],
            ['face.value', 'blotch.x'],
            ['clay.value', 'clay_lit.v'],
            ['blotch.value', 'clay_lit.s'],
            ['sand.value', 'gritty.x'],
            ['mortar.value', 'mortar_lit.v'],
            ['gritty.value', 'mortar_lit.s'],
            ['clay_lit.value', 'wall.a'],
            ['mortar_lit.value', 'wall.b'],
            ['bond.mortar', 'wall.t'],
            ['wall.value', 'body.color'],
            ['specular.value', 'sum.a'],
            ['body.value', 'sum.b'],
            ['s.value', 'height.s'],
            ['tile.value', 'height.pattern_scale'],
            ['height.value', 'normal.relief'],
            ['sum.value', 'out.c'],
            ['normal.value', 'out.normal'],
        ],
        output: 'out.value',
    }),
    {
        name: 'material.brick',
        ...SAMPLE_INPUT,
        expose: [
            ['red.value', 'color'],
            ['brown.value', 'dark_color'],
            ['mortar.value', 'mortar_color'],
            ['specular.roughness', 'roughness'],
            ['height.joint_depth', 'joint_depth'],
            ['height.face_height', 'face_height'],
            ['normal.scale', 'scale'],
            ['tile.value', 'pattern_scale'],
        ],
    },
);

/**
 * `material.plaster` — reboco de gesso desempenado à mão: branco fosco (`color`, albedo 0,8; rugosidade 0,9), com as
 * passadas da desempenadeira — ondas largas e baixas alongadas em arcos (`pattern.grain` anisotrópico de quatro
 * oitavas, `relief` em unidades do padrão) —, a areia fina em relevo (`grain_relief`) e os furinhos das bolhas (um grão
 * fino acima de um nível). Sem padrão de cor: o que se lê é a luz rasante no relevo. Parâmetros: `color`, `roughness`,
 * `relief`, `grain_relief`, `pattern_scale`.
 */
export const plaster = Subgraph.point(
    new NodeGraph({
        nodes: {
            ...patternSpace(),
            trowel: pattern.grain.with({ scale: [3.5, 10], octaves: 4, gain: 0.55, seed: 131 }),
            sand: pattern.grain.with({ scale: [150, 150], octaves: 2, seed: 132 }),
            pin: pattern.grain.with({ scale: [60, 60], octaves: 1, seed: 133 }),
            hole: pattern.threshold.with({ low: 0.8, high: 0.64 }),
            white: math.value3.with({ value: [0.8, 0.78, 0.74] }),
            shade: map.range.with({ in_min: -0.6, in_max: 0.6, out_min: 0.9, out_max: 1.06 }),
            pinned: map.range.with({ out_min: 0.7, out_max: 1 }),
            tone: math.mul,
            lit: math.scale3,
            relief: surface.bump.with({ strength: 0.03 }),
            grain_relief: surface.bump.with({ strength: 0.0009 }),
            pin_relief: surface.bump.with({ strength: 0.0035 }),
            body: bsdf.diffuse.with({ roughness: 0.9 }),
            specular: bsdf.dielectric.with({ ior: 1.52, roughness: 0.9 }),
            sum: closure.add,
            out: closure.normal,
        },
        links: [
            ...SPACE_LINKS,
            ...patternLinks('trowel', 'sand', 'pin'),
            ['pin.value', 'hole.value'],
            ['pin.gradient', 'hole.gradient'],
            ['trowel.value', 'shade.x'],
            ['hole.value', 'pinned.x'],
            ['shade.value', 'tone.a'],
            ['pinned.value', 'tone.b'],
            ['white.value', 'lit.v'],
            ['tone.value', 'lit.s'],
            ['lit.value', 'body.color'],
            ...bumpLinks('relief', 'trowel.gradient'),
            ...bumpLinks('grain_relief', 'sand.gradient', 'relief.value'),
            ...bumpLinks('pin_relief', 'hole.gradient', 'grain_relief.value'),
            ['specular.value', 'sum.a'],
            ['body.value', 'sum.b'],
            ['sum.value', 'out.c'],
            ['pin_relief.value', 'out.normal'],
        ],
        output: 'out.value',
    }),
    {
        name: 'material.plaster',
        ...SAMPLE_INPUT,
        expose: [
            ['white.value', 'color'],
            ['specular.roughness', 'roughness'],
            ['relief.strength', 'relief'],
            ['grain_relief.strength', 'grain_relief'],
            PATTERN_SCALE,
        ],
    },
);

/**
 * `material.asphalt` — asfalto (concreto betuminoso): as britas (`pattern.cells`: 80 por unidade do padrão, cada célula
 * uma pedra de tom próprio, do cinza escuro `color` ao claro `stone_color`) presas no betume preto (`binder_color`, nos
 * sulcos entre elas), que brilha mais (rugosidade 0,45) que a pedra gasta (`roughness`, 0,85); as pedras ficam em
 * relevo (`relief`, em unidades do padrão) e a areia entre elas pica a face (um grão fino). Parâmetros: `color`,
 * `stone_color`, `binder_color`, `roughness`, `relief`, `pattern_scale`.
 */
export const asphalt = Subgraph.point(
    new NodeGraph({
        nodes: {
            ...patternSpace(),
            stone: pattern.cells.with({ scale: 80, jitter: 1, crease: 0.4, seed: 141 }),
            grit: pattern.grain.with({ scale: [260, 260], octaves: 2, seed: 142 }),
            patch: pattern.grain.with({ scale: [4, 4], octaves: 3, seed: 143 }),
            dark: math.value3.with({ value: [0.045, 0.045, 0.048] }),
            light: math.value3.with({ value: [0.22, 0.21, 0.2] }),
            binder: math.value3.with({ value: [0.012, 0.012, 0.013] }),
            pick_squared: math.pow,
            aggregate: math.mix3,
            worn: map.range.with({ in_min: -0.6, in_max: 0.6, out_min: 0.8, out_max: 1.2 }),
            gritty: map.range.with({ in_min: -0.6, in_max: 0.6, out_min: 0.85, out_max: 1.15 }),
            tone: math.mul,
            toned: math.scale3,
            road: math.mix3,
            rough: map.range.with({ out_min: 0.45, out_max: 0.85 }),
            relief: surface.bump.with({ strength: 0.0035 }),
            grit_relief: surface.bump.with({ strength: 0.0004 }),
            body: bsdf.diffuse.with({ roughness: 0.8 }),
            specular: bsdf.dielectric.with({ ior: 1.55 }),
            sum: closure.add,
            out: closure.normal,
        },
        links: [
            ...SPACE_LINKS,
            ...patternLinks('stone', 'grit', 'patch'),
            ['stone.cell', 'pick_squared.x'],
            ['dark.value', 'aggregate.a'],
            ['light.value', 'aggregate.b'],
            ['pick_squared.value', 'aggregate.t'],
            ['patch.value', 'worn.x'],
            ['grit.value', 'gritty.x'],
            ['worn.value', 'tone.a'],
            ['gritty.value', 'tone.b'],
            ['aggregate.value', 'toned.v'],
            ['tone.value', 'toned.s'],
            ['binder.value', 'road.a'],
            ['toned.value', 'road.b'],
            ['stone.height', 'road.t'],
            ['road.value', 'body.color'],
            ['stone.height', 'rough.x'],
            ['rough.value', 'specular.roughness'],
            ...bumpLinks('relief', 'stone.gradient'),
            ...bumpLinks('grit_relief', 'grit.gradient', 'relief.value'),
            ['specular.value', 'sum.a'],
            ['body.value', 'sum.b'],
            ['sum.value', 'out.c'],
            ['grit_relief.value', 'out.normal'],
        ],
        output: 'out.value',
    }),
    {
        name: 'material.asphalt',
        ...SAMPLE_INPUT,
        expose: [
            ['dark.value', 'color'],
            ['light.value', 'stone_color'],
            ['binder.value', 'binder_color'],
            ['rough.out_max', 'roughness'],
            ['relief.strength', 'relief'],
            PATTERN_SCALE,
        ],
    },
);

/**
 * `material.tile` — azulejo esmaltado com rejunte (`pattern.bricks` em grade: 5 × 5 por unidade do padrão, junta de
 * 6 %): o corpo cerâmico de cor `color` (o tom varia ± 7 % de peça para peça, como nas fornadas) sob o esmalte — um
 * vidro em camada (`closure.layer`: IOR 1,5, rugosidade 0,04; o reflexo nítido do ambiente), com a borda da peça
 * abaulada (a normal do esmalte desce para a junta: o reflexo quebra de azulejo em azulejo) e a superfície de leve
 * ondulada (`pattern.grain` largo). O rejunte é cimentício: fosco, claro (`grout_color`), arenoso e recuado.
 * Parâmetros: `color`, `grout_color`, `glaze_color`, `roughness`, `ior`, `bevel`, `pattern_scale`.
 */
export const tile = Subgraph.point(
    new NodeGraph({
        nodes: {
            ...patternSpace(),
            grid: pattern.bricks.with({
                scale: [5, 5],
                shift: 0,
                gap: 0.06,
                bevel: 0.1,
                seed: 151,
            }),
            pooling: pattern.grain.with({ scale: [9, 9], octaves: 2, seed: 152 }),
            sand: pattern.grain.with({ scale: [240, 240], octaves: 2, seed: 153 }),
            ceramic: math.value3.with({ value: [0.04, 0.2, 0.42] }),
            batch: map.range.with({ out_min: 0.86, out_max: 1.14 }),
            toned: math.scale3,
            body: bsdf.diffuse.with({ roughness: 0.2 }),
            edge: surface.bump.with({ strength: 0.012 }),
            wave: surface.bump.with({ strength: 0.0012 }),
            glaze: bsdf.dielectric.with({ ior: 1.5, roughness: 0.04 }),
            glaze_surface: closure.normal,
            glazed: closure.layer.with({ top_color: [0.97, 0.98, 1] }),
            grout_tone: math.value3.with({ value: [0.55, 0.53, 0.49] }),
            gritty: map.range.with({ in_min: -0.6, in_max: 0.6, out_min: 0.82, out_max: 1.12 }),
            grout_lit: math.scale3,
            grout: bsdf.diffuse.with({ roughness: 1 }),
            grout_relief: surface.bump.with({ strength: 0.0006 }),
            grout_surface: closure.normal,
            out: closure.mix,
        },
        links: [
            ...SPACE_LINKS,
            ...patternLinks('grid', 'pooling', 'sand'),
            ['grid.brick', 'batch.x'],
            ['ceramic.value', 'toned.v'],
            ['batch.value', 'toned.s'],
            ['toned.value', 'body.color'],
            ...bumpLinks('edge', 'grid.gradient'),
            ...bumpLinks('wave', 'pooling.gradient', 'edge.value'),
            ['glaze.value', 'glaze_surface.c'],
            ['wave.value', 'glaze_surface.normal'],
            ['glaze_surface.value', 'glazed.top'],
            ['body.value', 'glazed.base'],
            ['sand.value', 'gritty.x'],
            ['grout_tone.value', 'grout_lit.v'],
            ['gritty.value', 'grout_lit.s'],
            ['grout_lit.value', 'grout.color'],
            ...bumpLinks('grout_relief', 'sand.gradient'),
            ['grout.value', 'grout_surface.c'],
            ['grout_relief.value', 'grout_surface.normal'],
            ['glazed.value', 'out.a'],
            ['grout_surface.value', 'out.b'],
            ['grid.mortar', 'out.t'],
        ],
        output: 'out.value',
    }),
    {
        name: 'material.tile',
        ...SAMPLE_INPUT,
        expose: [
            ['ceramic.value', 'color'],
            ['grout_tone.value', 'grout_color'],
            ['glazed.top_color', 'glaze_color'],
            ['glaze.roughness', 'roughness'],
            ['glaze.ior', 'ior'],
            ['edge.strength', 'bevel'],
            PATTERN_SCALE,
        ],
    },
);

/**
 * `material.terracotta` — terracota (barro queimado sem esmalte, o vaso de jardim): o corpo alaranjado (`color`, albedo
 * 0,3), fosco e poroso (rugosidade 0,85), com as manchas largas da queima (± 15 %), as marcas do torno ao longo de u
 * (`pattern.grain` alongado: riscos finos na cor e em relevo), a eflorescência clara dos sais onde a água evapora
 * (`bloom_color`, nas manchas em que um grão largo passa de um nível) e os poros (um grão fino em relevo, `relief` em
 * unidades do padrão). Parâmetros: `color`, `bloom_color`, `roughness`, `relief`, `pattern_scale`.
 */
export const terracotta = Subgraph.point(
    new NodeGraph({
        nodes: {
            ...patternSpace(),
            fire: pattern.grain.with({ scale: [3.5, 3.5], octaves: 4, gain: 0.55, seed: 161 }),
            wheel: pattern.grain.with({ scale: [1.2, 70], octaves: 2, gain: 0.6, seed: 162 }),
            pore: pattern.grain.with({ scale: [190, 190], octaves: 2, seed: 163 }),
            salt: pattern.grain.with({ scale: [6, 9], octaves: 5, gain: 0.6, seed: 164 }),
            clay: math.value3.with({ value: [0.5, 0.2, 0.1] }),
            bloom: math.value3.with({ value: [0.62, 0.48, 0.38] }),
            fired: map.range.with({ in_min: -0.6, in_max: 0.6, out_min: 0.76, out_max: 1.2 }),
            turned: map.range.with({ in_min: -0.6, in_max: 0.6, out_min: 0.9, out_max: 1.08 }),
            pitted: map.range.with({ in_min: -0.6, in_max: 0.6, out_min: 0.92, out_max: 1.06 }),
            tone_a: math.mul,
            tone: math.mul,
            lit: math.scale3,
            bloomed: map.range.with({ in_min: 0.22, in_max: 0.6, out_min: 0, out_max: 0.5 }),
            pot: math.mix3,
            wheel_relief: surface.bump.with({ strength: 0.0011 }),
            relief: surface.bump.with({ strength: 0.0013 }),
            body: bsdf.diffuse.with({ roughness: 0.9 }),
            specular: bsdf.dielectric.with({ ior: 1.5, roughness: 0.85 }),
            sum: closure.add,
            out: closure.normal,
        },
        links: [
            ...SPACE_LINKS,
            ...patternLinks('fire', 'wheel', 'pore', 'salt'),
            ['fire.value', 'fired.x'],
            ['wheel.value', 'turned.x'],
            ['pore.value', 'pitted.x'],
            ['fired.value', 'tone_a.a'],
            ['turned.value', 'tone_a.b'],
            ['tone_a.value', 'tone.a'],
            ['pitted.value', 'tone.b'],
            ['clay.value', 'lit.v'],
            ['tone.value', 'lit.s'],
            ['salt.value', 'bloomed.x'],
            ['lit.value', 'pot.a'],
            ['bloom.value', 'pot.b'],
            ['bloomed.value', 'pot.t'],
            ['pot.value', 'body.color'],
            ...bumpLinks('wheel_relief', 'wheel.gradient'),
            ...bumpLinks('relief', 'pore.gradient', 'wheel_relief.value'),
            ['specular.value', 'sum.a'],
            ['body.value', 'sum.b'],
            ['sum.value', 'out.c'],
            ['relief.value', 'out.normal'],
        ],
        output: 'out.value',
    }),
    {
        name: 'material.terracotta',
        ...SAMPLE_INPUT,
        expose: [
            ['clay.value', 'color'],
            ['bloom.value', 'bloom_color'],
            ['specular.roughness', 'roughness'],
            ['relief.strength', 'relief'],
            PATTERN_SCALE,
        ],
    },
);

/**
 * `material.driedMud` — barro seco rachado (o leito de um açude): as placas de argila (`pattern.cells`: 7 por unidade
 * do padrão) de tom próprio (`color` ± 14 %), clareadas no alto pela poeira e escuras no fundo das rachaduras (a cor
 * cai a `cavity`, 0,3, a 5 mm abaixo da face); fosco (rugosidade 0,95). O relevo é o de `relief.driedMud`, em
 * milímetros — as rachaduras de retração (`crack_depth`, 9), as finas dentro das placas e a face ondulada
 * (`face_height`, 0,8), com `scale` unidades do mundo por metro —, na normal; com `Displacements.driedMud()` na
 * entidade de uma `ParametricSurface`, na geometria. Parâmetros: `color`, `roughness`, `crack_depth`, `face_height`,
 * `cavity`, `scale`, `pattern_scale`.
 */
export const driedMud = Subgraph.point(
    new NodeGraph({
        nodes: {
            ...patternSpace(),
            plates: pattern.cells.with(MUD_PLATES),
            checks: pattern.cells.with(MUD_CHECKS),
            face: pattern.grain.with(MUD_FACE),
            clay: math.value3.with({ value: [0.4, 0.31, 0.22] }),
            plate_tone: map.range.with({ out_min: 0.86, out_max: 1.14 }),
            dusty: map.range.with({ in_min: -0.6, in_max: 0.6, out_min: 0.9, out_max: 1.1 }),
            checked: map.range.with({ out_min: 0.7, out_max: 1 }),
            tone_a: math.mul,
            tone_b: math.mul,
            tile: math.value2.with({ value: [1, 1] }),
            height: relief.driedMud,
            depth: math.split3,
            cavity: map.range.with({ in_min: -5, in_max: -0.5, out_min: 0.3, out_max: 1 }),
            tone: math.mul,
            lit: math.scale3,
            body: bsdf.diffuse.with({ roughness: 1 }),
            specular: bsdf.dielectric.with({ ior: 1.5, roughness: 0.95 }),
            sum: closure.add,
            normal: surface.reliefNormal,
            out: closure.normal,
        },
        links: [
            ...SPACE_LINKS,
            ...patternLinks('plates', 'checks', 'face'),
            ['tile.value', 'uv.scale'],
            ['plates.cell', 'plate_tone.x'],
            ['face.value', 'dusty.x'],
            ['checks.height', 'checked.x'],
            ['plate_tone.value', 'tone_a.a'],
            ['dusty.value', 'tone_a.b'],
            ['tone_a.value', 'tone_b.a'],
            ['checked.value', 'tone_b.b'],
            ['s.value', 'height.s'],
            ['tile.value', 'height.pattern_scale'],
            ['height.value', 'depth.v'],
            ['depth.x', 'cavity.x'],
            ['tone_b.value', 'tone.a'],
            ['cavity.value', 'tone.b'],
            ['clay.value', 'lit.v'],
            ['tone.value', 'lit.s'],
            ['lit.value', 'body.color'],
            ['specular.value', 'sum.a'],
            ['body.value', 'sum.b'],
            ['height.value', 'normal.relief'],
            ['sum.value', 'out.c'],
            ['normal.value', 'out.normal'],
        ],
        output: 'out.value',
    }),
    {
        name: 'material.driedMud',
        ...SAMPLE_INPUT,
        expose: [
            ['clay.value', 'color'],
            ['specular.roughness', 'roughness'],
            ['height.crack_depth', 'crack_depth'],
            ['height.face_height', 'face_height'],
            ['cavity.out_min', 'cavity'],
            ['normal.scale', 'scale'],
            ['tile.value', 'pattern_scale'],
        ],
    },
);

/**
 * `material.sand` — areia seca de praia: os grãos (`pattern.cells`: 170 por unidade do padrão), cada um de uma cor — o
 * quartzo claro (`color`), o amarelado (`warm_color`) e os minerais pesados escuros (`dark_color`, um grão em vinte e cinco) —
 * e em relevo (`relief`, em unidades do padrão): cada grão tem a sua faceta e brilha num ponto quando alinha com o sol
 * (interface de quartzo, IOR 1,544, rugosidade 0,4); as marcas onduladas do vento (`pattern.grain` alongado ao longo
 * de u: `ripple`, a altura em unidades do padrão) dão a sombra larga, com os grãos escuros juntos nos vales.
 * Parâmetros: `color`, `warm_color`, `dark_color`, `roughness`, `relief`, `ripple`, `pattern_scale`.
 */
export const sand = Subgraph.point(
    new NodeGraph({
        nodes: {
            ...patternSpace(),
            grain: pattern.cells.with({ scale: 170, jitter: 1, crease: 0.6, seed: 171 }),
            wind: pattern.grain.with({ scale: [1.2, 8], octaves: 2, gain: 0.4, seed: 172 }),
            quartz: math.value3.with({ value: [0.68, 0.58, 0.42] }),
            warm: math.value3.with({ value: [0.55, 0.42, 0.26] }),
            heavy: math.value3.with({ value: [0.09, 0.075, 0.065] }),
            pick: map.range.with({ in_min: 0, in_max: 0.9 }),
            // Os grãos escuros: um em doze, mais nos vales das marcas do vento.
            valley: map.range.with({ in_min: -0.6, in_max: 0.6, out_min: 0.1, out_max: -0.06 }),
            level: math.add,
            is_heavy: map.range.with({ in_min: 0.955, in_max: 0.965 }),
            light: math.mix3,
            mineral: math.mix3,
            between: map.range.with({ out_min: 0.6, out_max: 1 }),
            lit: math.scale3,
            facet: surface.bump.with({ strength: 0.0022 }),
            tilt: surface.bump.with({ strength: 0.1 }),
            ripple: surface.bump.with({ strength: 0.007 }),
            body: bsdf.diffuse.with({ roughness: 0.8 }),
            specular: bsdf.dielectric.with({ ior: 1.544, roughness: 0.4 }),
            sum: closure.add,
            out: closure.normal,
        },
        links: [
            ...SPACE_LINKS,
            ...patternLinks('grain', 'wind'),
            ['grain.cell', 'pick.x'],
            ['wind.value', 'valley.x'],
            ['grain.cell', 'level.a'],
            ['valley.value', 'level.b'],
            ['level.value', 'is_heavy.x'],
            ['quartz.value', 'light.a'],
            ['warm.value', 'light.b'],
            ['pick.value', 'light.t'],
            ['light.value', 'mineral.a'],
            ['heavy.value', 'mineral.b'],
            ['is_heavy.value', 'mineral.t'],
            ['grain.height', 'between.x'],
            ['mineral.value', 'lit.v'],
            ['between.value', 'lit.s'],
            ['lit.value', 'body.color'],
            ...bumpLinks('ripple', 'wind.gradient'),
            ...bumpLinks('facet', 'grain.gradient', 'ripple.value'),
            ...bumpLinks('tilt', 'grain.random', 'facet.value'),
            ['specular.value', 'sum.a'],
            ['body.value', 'sum.b'],
            ['sum.value', 'out.c'],
            ['tilt.value', 'out.normal'],
        ],
        output: 'out.value',
    }),
    {
        name: 'material.sand',
        ...SAMPLE_INPUT,
        expose: [
            ['quartz.value', 'color'],
            ['warm.value', 'warm_color'],
            ['heavy.value', 'dark_color'],
            ['specular.roughness', 'roughness'],
            ['facet.strength', 'relief'],
            ['ripple.strength', 'ripple'],
            PATTERN_SCALE,
        ],
    },
);
