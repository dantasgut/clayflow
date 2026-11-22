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

// Orgânicos e outros (spec 011, T117): o papel (parede fina), a fibra de carbono (sarja sob verniz), o gelo (transmissão
// com o meio que espalha), o sabão, o marfim e a neve (subsuperfície: o albedo e o caminho livre médio por canal em milímetros, com `scale` unidades do
// mundo por metro — os valores são estimados, sem medida tabelada, e dizem em que espessura a peça acende em contraluz)
// e a madrepérola (filme fino). A estrutura é calculada por pixel pelos nós de padrão sobre o uv (`pattern_scale`
// repetições por unidade de uv; numa esfera, (2, 1)).

/**
 * `material.paper` — papel (a folha de sulfite, o cartão fino): fosco, branco (`color`, albedo 0,8; difuso áspero, sem
 * realce), de parede fina — a luz de trás atravessa espalhada (`bsdf.translucent`), mais onde a folha é rala: a
 * formação (as nuvens das fibras, `pattern.grain` largo) e as fibras de celulose (as linhas finas em que um grão de
 * três oitavas passa por zero: mais opacas e claras) aparecem contra a luz. `translucency` (0,35) é a fração que passa
 * na média. O grão do papel está em relevo (`relief`, em unidades do padrão). Parâmetros: `color`, `translucency`,
 * `relief`, `pattern_scale`.
 */
export const paper = Subgraph.point(
    new NodeGraph({
        nodes: {
            ...patternSpace(),
            formation: pattern.grain.with({ scale: [9, 9], octaves: 4, gain: 0.6, seed: 191 }),
            fibers: pattern.grain.with({ scale: [30, 30], octaves: 3, gain: 0.6, seed: 192 }),
            tooth: pattern.grain.with({ scale: [200, 200], octaves: 2, seed: 193 }),
            white: math.value3.with({ value: [0.8, 0.79, 0.75] }),
            distance: math.abs,
            fiber: map.range.with({ in_min: 0, in_max: 0.05, out_min: 1, out_max: 0 }),
            cloud: map.range.with({ in_min: -0.6, in_max: 0.6, out_min: 1.5, out_max: 0.5 }),
            thin: math.value.with({ value: 0.35 }),
            passing: math.mul,
            dense: map.range.with({ out_min: 1, out_max: 0.55 }),
            through_weight: math.mul,
            tint: map.range.with({ out_min: 0.96, out_max: 1.05 }),
            lit: math.scale3,
            sheet: bsdf.diffuse.with({ roughness: 1 }),
            through: bsdf.translucent,
            mixed: closure.mix,
            relief: surface.bump.with({ strength: 0.0004 }),
            out: closure.normal,
        },
        links: [
            ...SPACE_LINKS,
            ...patternLinks('formation', 'fibers', 'tooth'),
            ['fibers.value', 'distance.x'],
            ['distance.value', 'fiber.x'],
            ['formation.value', 'cloud.x'],
            ['thin.value', 'passing.a'],
            ['cloud.value', 'passing.b'],
            ['fiber.value', 'dense.x'],
            ['passing.value', 'through_weight.a'],
            ['dense.value', 'through_weight.b'],
            ['fiber.value', 'tint.x'],
            ['white.value', 'lit.v'],
            ['tint.value', 'lit.s'],
            ['lit.value', 'sheet.color'],
            ['white.value', 'through.color'],
            ['sheet.value', 'mixed.a'],
            ['through.value', 'mixed.b'],
            ['through_weight.value', 'mixed.t'],
            ...bumpLinks('relief', 'tooth.gradient'),
            ['mixed.value', 'out.c'],
            ['relief.value', 'out.normal'],
        ],
        output: 'out.value',
    }),
    {
        name: 'material.paper',
        ...SAMPLE_INPUT,
        expose: [
            ['white.value', 'color'],
            ['thin.value', 'translucency'],
            ['relief.strength', 'relief'],
            PATTERN_SCALE,
        ],
    },
);

/**
 * `material.carbonFiber` — laminado de fibra de carbono: o tecido em sarja 2/2 (`pattern.weave`: 30 mechas por unidade
 * do padrão, duas por cima e duas por baixo, deslocadas uma a cada mecha — a diagonal) sob a resina epóxi polida — um
 * dielétrico liso em camada (IOR 1,55, rugosidade 0,03: o reflexo nítido do ambiente). Cada mecha é um feixe de
 * filamentos de grafite paralelos: um especular escuro (`color`, F0 0,14) e fortemente anisotrópico (0,85) com a
 * tangente ao longo dos filamentos (a saída `fiber` da trama) — o realce se alonga através da mecha e, como a urdidura
 * e a trama correm a 90° uma da outra, acende numas e apaga nas outras: o xadrez em diagonal que troca de claro para
 * escuro com o ângulo. As mechas ondulam de leve sob a resina (`relief`, em unidades do padrão). Parâmetros: `color`,
 * `roughness`, `anisotropy`, `coat_roughness`, `coat_ior`, `relief`, `pattern_scale`.
 */
export const carbonFiber = Subgraph.point(
    new NodeGraph({
        nodes: {
            ...patternSpace(),
            weave: pattern.weave.with({ scale: 30, over: 2, under: 2, shift: 1, gap: 0.02 }),
            fiber_direction: surface.direction,
            relief: surface.bump.with({ strength: 0.0016 }),
            tows: bsdf.conductor.with({
                color: [0.14, 0.14, 0.145],
                edge_tint: [0.6, 0.6, 0.62],
                roughness: 0.45,
                anisotropy: 0.85,
            }),
            laminate: closure.normal,
            resin: bsdf.dielectric.with({ ior: 1.55, roughness: 0.03 }),
            out: closure.layer,
        },
        links: [
            ...SPACE_LINKS,
            ...patternLinks('weave'),
            ['uv.du', 'fiber_direction.du'],
            ['uv.dv', 'fiber_direction.dv'],
            ['weave.fiber', 'fiber_direction.direction'],
            ['fiber_direction.value', 'tows.tangent'],
            ...bumpLinks('relief', 'weave.gradient'),
            ['tows.value', 'laminate.c'],
            ['relief.value', 'laminate.normal'],
            ['resin.value', 'out.top'],
            ['laminate.value', 'out.base'],
        ],
        output: 'out.value',
    }),
    {
        name: 'material.carbonFiber',
        ...SAMPLE_INPUT,
        expose: [
            ['tows.color', 'color'],
            ['tows.roughness', 'roughness'],
            ['tows.anisotropy', 'anisotropy'],
            ['resin.roughness', 'coat_roughness'],
            ['resin.ior', 'coat_ior'],
            ['relief.strength', 'relief'],
            PATTERN_SCALE,
        ],
    },
);

/**
 * `material.ice` — gelo (o bloco de gelo trincado): transparente — a luz atravessa com refração traçada (IOR 1,31) e é
 * absorvida mais no vermelho: o tom azulado só aparece na espessura (`color`, a cor a `depth` unidades de percurso). A
 * interface é lisa e molhada (rugosidade 0,04: o reflexo nítido), ondulada pelo degelo (`pattern.grain` largo,
 * `relief` em unidades do padrão). O que espalha é branco e opaco (`flaw_color`), de borda viva: as trincas grandes
 * (as linhas em que um grão de quatro oitavas passa por zero) e as finas (outro grão, mais miúdo), as bolhas de ar
 * (`pattern.cells`: mais juntas nas nuvens de um grão largo) e os flocos de geada; as da face de trás aparecem
 * refratadas através da peça. Ficam na casca: trinca e bolha no meio do volume, com paralaxe, e o miolo leitoso pedem
 * um meio heterogêneo no traçado — o espalhamento do meio do fechamento (`scatter`, por unidade de percurso; 0 por
 * padrão) é uniforme, dá só a luz espalhada uma vez (sai fraca: escurece o miolo em vez de clareá-lo) e é sorteado
 * (granulado sem o filtro do antisserrilhado temporal). `depth` e `scatter` são em unidades do mundo: os padrões
 * servem a uma peça de cerca de uma unidade. Parâmetros: `color`, `depth`, `scatter`, `flaw_color`, `roughness`,
 * `ior`, `relief`, `pattern_scale`.
 */
export const ice = Subgraph.point(
    new NodeGraph({
        nodes: {
            ...patternSpace(),
            fracture: pattern.grain.with({ scale: [3.2, 3.2], octaves: 4, gain: 0.55, seed: 201 }),
            hairline: pattern.grain.with({ scale: [9, 9], octaves: 3, gain: 0.5, seed: 205 }),
            bubble: pattern.cells.with({ scale: 70, jitter: 1, crease: 0.6, seed: 202 }),
            melt: pattern.grain.with({ scale: [6, 6], octaves: 2, seed: 203 }),
            haze: pattern.grain.with({ scale: [1.7, 1.7], octaves: 4, gain: 0.55, seed: 204 }),
            white: math.value3.with({ value: [0.9, 0.93, 0.95] }),
            distance: math.abs,
            crack: map.range.with({ in_min: 0.008, in_max: 0.016, out_min: 1, out_max: 0 }),
            fine_distance: math.abs,
            // As trincas finas só onde o grão das grandes está perto de zero (em volta delas).
            fine_crack: map.range.with({ in_min: 0.01, in_max: 0.02, out_min: 1, out_max: 0 }),
            near: map.range.with({ in_min: 0.1, in_max: 0.14, out_min: 1, out_max: 0 }),
            branch: math.mul,
            // As bolhas: o miolo das células cujo valor, somado à nuvem, passa de um nível.
            cloudy: map.range.with({ in_min: -0.6, in_max: 0.6, out_min: -0.3, out_max: 0.3 }),
            level: math.add,
            some: map.range.with({ in_min: 0.68, in_max: 0.69 }),
            core: map.range.with({ in_min: 0.55, in_max: 0.65 }),
            air: math.mul,
            flaw_a: math.max,
            flaw: math.max,
            ior: math.value.with({ value: 1.31 }),
            refraction: bsdf.transmission.with({ color: [0.74, 0.92, 0.98], depth: 1 }),
            milky: closure.mediumScatter.with({ scatter: [0, 0, 0], anisotropy: 0.2 }),
            frost: bsdf.diffuse.with({ roughness: 0.3 }),
            inside: closure.mix,
            wave: surface.bump.with({ strength: 0.004 }),
            specular: bsdf.dielectric.with({ roughness: 0.04 }),
            sum: closure.add,
            out: closure.normal,
        },
        links: [
            ...SPACE_LINKS,
            ...patternLinks('fracture', 'hairline', 'bubble', 'melt', 'haze'),
            ['fracture.value', 'distance.x'],
            ['distance.value', 'crack.x'],
            ['hairline.value', 'fine_distance.x'],
            ['fine_distance.value', 'fine_crack.x'],
            ['distance.value', 'near.x'],
            ['fine_crack.value', 'branch.a'],
            ['near.value', 'branch.b'],
            ['haze.value', 'cloudy.x'],
            ['bubble.cell', 'level.a'],
            ['cloudy.value', 'level.b'],
            ['level.value', 'some.x'],
            ['bubble.height', 'core.x'],
            ['some.value', 'air.a'],
            ['core.value', 'air.b'],
            ['crack.value', 'flaw_a.a'],
            ['branch.value', 'flaw_a.b'],
            ['flaw_a.value', 'flaw.a'],
            ['air.value', 'flaw.b'],
            ['ior.value', 'refraction.ior'],
            ['ior.value', 'specular.ior'],
            ['refraction.value', 'milky.c'],
            ['white.value', 'frost.color'],
            ['milky.value', 'inside.a'],
            ['frost.value', 'inside.b'],
            ['flaw.value', 'inside.t'],
            ...bumpLinks('wave', 'melt.gradient'),
            ['specular.value', 'sum.a'],
            ['inside.value', 'sum.b'],
            ['sum.value', 'out.c'],
            ['wave.value', 'out.normal'],
        ],
        output: 'out.value',
    }),
    {
        name: 'material.ice',
        ...SAMPLE_INPUT,
        expose: [
            ['refraction.color', 'color'],
            ['refraction.depth', 'depth'],
            ['milky.scatter', 'scatter'],
            ['white.value', 'flaw_color'],
            ['specular.roughness', 'roughness'],
            ['ior.value', 'ior'],
            ['wave.strength', 'relief'],
            PATTERN_SCALE,
        ],
    },
);

/**
 * `material.soap` — sabão em barra (ou vela colorida): corpo ceroso tingido — albedo verde-água (`color`) e caminho
 * livre médio (1,4, 2,2, 1,7) mm, estimado: a luz entra um par de milímetros e sai com a cor do corante (a aresta fina
 * acende em contraluz) —, com as nuvens da massa mal misturada (`pattern.grain` largo: veios mais claros,
 * `swirl_color`); interface de estearato (IOR 1,47), acetinada (rugosidade 0,3), com o grão fino da prensagem em relevo
 * (`relief`, em unidades do padrão). Parâmetros: `color`, `swirl_color`, `radius` (mm), `scale` (unidades por metro),
 * `roughness`, `ior`, `relief`, `pattern_scale`.
 */
export const soap = Subgraph.point(
    new NodeGraph({
        nodes: {
            ...patternSpace(),
            swirl: pattern.grain.with({ scale: [2.2, 5], octaves: 4, gain: 0.5, seed: 211 }),
            press: pattern.grain.with({ scale: [160, 160], octaves: 2, seed: 212 }),
            dye: math.value3.with({ value: [0.3, 0.66, 0.52] }),
            milk: math.value3.with({ value: [0.74, 0.86, 0.78] }),
            distance: math.abs,
            vein: map.range.with({ in_min: 0, in_max: 0.22, out_min: 0.8, out_max: 0 }),
            mass: math.mix3,
            body: bsdf.subsurface.with({ radius: [1.4, 2.2, 1.7] }),
            relief: surface.bump.with({ strength: 0.0004 }),
            specular: bsdf.dielectric.with({ ior: 1.47, roughness: 0.3 }),
            sum: closure.add,
            out: closure.normal,
        },
        links: [
            ...SPACE_LINKS,
            ...patternLinks('swirl', 'press'),
            ['swirl.value', 'distance.x'],
            ['distance.value', 'vein.x'],
            ['dye.value', 'mass.a'],
            ['milk.value', 'mass.b'],
            ['vein.value', 'mass.t'],
            ['mass.value', 'body.color'],
            ...bumpLinks('relief', 'press.gradient'),
            ['specular.value', 'sum.a'],
            ['body.value', 'sum.b'],
            ['sum.value', 'out.c'],
            ['relief.value', 'out.normal'],
        ],
        output: 'out.value',
    }),
    {
        name: 'material.soap',
        ...SAMPLE_INPUT,
        expose: [
            ['dye.value', 'color'],
            ['milk.value', 'swirl_color'],
            ['body.radius', 'radius'],
            ['body.scale', 'scale'],
            ['specular.roughness', 'roughness'],
            ['specular.ior', 'ior'],
            ['relief.strength', 'relief'],
            PATTERN_SCALE,
        ],
    },
);

/**
 * `material.ivory` — marfim (ou osso polido): corpo denso de dentina — albedo creme (`color`) e caminho livre médio
 * curto, (0,32, 0,22, 0,14) mm, estimado: só a aresta fina acende, e quente — sob uma interface polida (hidroxiapatita
 * e colágeno, IOR 1,54; rugosidade 0,2). A estrutura: o veio fino ao longo de v (`pattern.grain` alongado: as camadas
 * de crescimento, ± 5 % no tom), as manchas largas mais amareladas (`age_color`) e as fissuras finas e escuras da
 * idade (as linhas em que um grão alongado passa por zero). Parâmetros: `color`, `age_color`, `radius` (mm), `scale`
 * (unidades por metro), `roughness`, `ior`, `pattern_scale`.
 */
export const ivory = Subgraph.point(
    new NodeGraph({
        nodes: {
            ...patternSpace(),
            layer: pattern.grain.with({ scale: [110, 3], octaves: 2, seed: 221 }),
            age: pattern.grain.with({ scale: [3, 3], octaves: 4, seed: 222 }),
            check: pattern.grain.with({ scale: [22, 2.2], octaves: 3, gain: 0.55, seed: 223 }),
            cream: math.value3.with({ value: [0.82, 0.76, 0.6] }),
            yellow: math.value3.with({ value: [0.7, 0.56, 0.32] }),
            aged: map.range.with({ in_min: -0.1, in_max: 0.6, out_min: 0, out_max: 0.7 }),
            toned: math.mix3,
            grain: map.range.with({ in_min: -0.6, in_max: 0.6, out_min: 0.93, out_max: 1.05 }),
            distance: math.abs,
            fissure: map.range.with({ in_min: 0, in_max: 0.012, out_min: 0.45, out_max: 1 }),
            shade: math.mul,
            lit: math.scale3,
            body: bsdf.subsurface.with({ radius: [0.32, 0.22, 0.14] }),
            specular: bsdf.dielectric.with({ ior: 1.54, roughness: 0.2 }),
            out: closure.add,
        },
        links: [
            ...SPACE_LINKS,
            ...patternLinks('layer', 'age', 'check'),
            ['age.value', 'aged.x'],
            ['cream.value', 'toned.a'],
            ['yellow.value', 'toned.b'],
            ['aged.value', 'toned.t'],
            ['layer.value', 'grain.x'],
            ['check.value', 'distance.x'],
            ['distance.value', 'fissure.x'],
            ['grain.value', 'shade.a'],
            ['fissure.value', 'shade.b'],
            ['toned.value', 'lit.v'],
            ['shade.value', 'lit.s'],
            ['lit.value', 'body.color'],
            ['specular.value', 'out.a'],
            ['body.value', 'out.b'],
        ],
        output: 'out.value',
    }),
    {
        name: 'material.ivory',
        ...SAMPLE_INPUT,
        expose: [
            ['cream.value', 'color'],
            ['yellow.value', 'age_color'],
            ['body.radius', 'radius'],
            ['body.scale', 'scale'],
            ['specular.roughness', 'roughness'],
            ['specular.ior', 'ior'],
            PATTERN_SCALE,
        ],
    },
);

/**
 * `material.motherOfPearl` — madrepérola (nácar): lamelas de aragonita (IOR 1,53 a 1,69) de cerca de meio micrômetro
 * empilhadas, com conchiolina (IOR 1,43) entre elas — a interferência entre as lamelas dá as cores que mudam com o
 * ângulo. Modelo efetivo: um filme fino (`closure.thinFilm`, IOR 1,43, espessura de `thickness_min`, 320 nm, a
 * `thickness_max`, 640 nm, pelas faixas de crescimento — `pattern.grain` alongado) sobre a pilha tratada como um
 * refletor parcial (um especular de F0 `reflectance`, 0,5, que cobre metade da base; rugosidade 0,16: o brilho
 * perolado, largo), com o corpo leitoso por baixo (`color`). Uma interferência só, não a pilha inteira: as cores são as
 * de um filme (rosa e verde), sem a saturação que as dezenas de lamelas dão. As faixas de crescimento ondulam a normal
 * (`relief`, em unidades do padrão). Parâmetros: `color`, `reflectance`, `thickness_min`, `thickness_max`, `film_ior`,
 * `roughness`, `relief`, `pattern_scale`.
 */
export const motherOfPearl = Subgraph.point(
    new NodeGraph({
        nodes: {
            ...patternSpace(),
            growth: pattern.grain.with({ scale: [2.2, 9], octaves: 4, gain: 0.55, seed: 231 }),
            thickness: map.range.with({ in_min: -0.6, in_max: 0.6, out_min: 320, out_max: 640 }),
            relief: surface.bump.with({ strength: 0.01 }),
            body: bsdf.diffuse.with({ color: [0.78, 0.76, 0.72], roughness: 0.2 }),
            nacre: bsdf.dielectric.with({ ior: 1.6, roughness: 0.16 }),
            shell: closure.add,
            stack: bsdf.conductor.with({ color: [0.5, 0.5, 0.5], roughness: 0.16 }),
            pearly: closure.mix.with({ t: 0.5 }),
            filmed: closure.thinFilm.with({ ior: 1.43 }),
            out: closure.normal,
        },
        links: [
            ...SPACE_LINKS,
            ...patternLinks('growth'),
            ['growth.value', 'thickness.x'],
            ...bumpLinks('relief', 'growth.gradient'),
            ['nacre.value', 'shell.a'],
            ['body.value', 'shell.b'],
            ['shell.value', 'pearly.a'],
            ['stack.value', 'pearly.b'],
            ['pearly.value', 'filmed.c'],
            ['thickness.value', 'filmed.thickness'],
            ['filmed.value', 'out.c'],
            ['relief.value', 'out.normal'],
        ],
        output: 'out.value',
    }),
    {
        name: 'material.motherOfPearl',
        ...SAMPLE_INPUT,
        expose: [
            ['body.color', 'color'],
            ['stack.color', 'reflectance'],
            ['thickness.out_min', 'thickness_min'],
            ['thickness.out_max', 'thickness_max'],
            ['filmed.ior', 'film_ior'],
            ['stack.roughness', 'roughness'],
            ['relief.strength', 'relief'],
            PATTERN_SCALE,
        ],
    },
);

/**
 * `material.snow` — neve fresca: cristais de gelo e ar — quase tudo o que entra espalha e sai (albedo 0,93 a 0,96,
 * `color`), por um caminho livre médio de (1,6, 2,0, 2,6) mm, estimado: a sombra na neve é azulada e a crista fina
 * acende. Por cima, os cristais: facetas de gelo (IOR 1,31) viradas para todos os lados — um lobo largo
 * (`sparkle_spread`, 0,6: a distribuição das orientações), fraco na média —, cada uma um espelho pequeno
 * (`sparkle_roughness`, 0,26): a faceta alinhada com o sol acende num ponto. São menores que o pixel
 * (`pattern.glints`: `sparkle_scale`, 520 por unidade do padrão): a contagem das alinhadas em cada pixel
 * (`closure.glints`), sorteada de forma estável no objeto, dá os brilhos espalhados pela neve, que mudam com o ângulo.
 * A superfície é ondulada pelo vento (`pattern.grain` largo, `relief` em unidades do padrão). Parâmetros: `color`,
 * `radius` (mm), `scale` (unidades por metro), `sparkle_scale`, `sparkle_roughness`, `sparkle_spread`, `relief`,
 * `pattern_scale`.
 */
export const snow = Subgraph.point(
    new NodeGraph({
        nodes: {
            ...patternSpace(),
            crystal: pattern.glints.with({ scale: 520, seed: 241 }),
            drift: pattern.grain.with({ scale: [4, 4], octaves: 4, gain: 0.55, seed: 242 }),
            fluff: pattern.grain.with({ scale: [90, 90], octaves: 2, seed: 243 }),
            body: bsdf.subsurface.with({ color: [0.93, 0.95, 0.96], radius: [1.6, 2, 2.6] }),
            wave: surface.bump.with({ strength: 0.012 }),
            soft: surface.bump.with({ strength: 0.0012 }),
            facet: bsdf.dielectric.with({ ior: 1.31, roughness: 0.6 }),
            facets: closure.glints.with({ roughness: 0.26 }),
            sum: closure.add,
            out: closure.normal,
        },
        links: [
            ...SPACE_LINKS,
            ...patternLinks('crystal', 'drift', 'fluff'),
            ...bumpLinks('wave', 'drift.gradient'),
            ...bumpLinks('soft', 'fluff.gradient', 'wave.value'),
            ['facet.value', 'facets.c'],
            ['crystal.cells', 'facets.cells'],
            ['crystal.count', 'facets.count'],
            ['facets.value', 'sum.a'],
            ['body.value', 'sum.b'],
            ['sum.value', 'out.c'],
            ['soft.value', 'out.normal'],
        ],
        output: 'out.value',
    }),
    {
        name: 'material.snow',
        ...SAMPLE_INPUT,
        expose: [
            ['body.color', 'color'],
            ['body.radius', 'radius'],
            ['body.scale', 'scale'],
            ['crystal.scale', 'sparkle_scale'],
            ['facets.roughness', 'sparkle_roughness'],
            ['facet.roughness', 'sparkle_spread'],
            ['wave.strength', 'relief'],
            PATTERN_SCALE,
        ],
    },
);
