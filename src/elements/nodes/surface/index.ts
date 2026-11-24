import { defineNode } from '../../../scene/graph/NodeDefinition';
import { nodeSurface } from '../shaders';

// Nós de geometria diferencial (spec 031, R12) sobre os campos `metric`, `curvature`, `principal` e `normal` da amostra
// de superfície (`nodes.input.surfaceSample()`; spec 010 — zeros nas geometrias sem geometria diferencial). Valem em
// todos os estágios; e as ondulações da normal (spec 034). Referência: `reference/surface.ts`.

/** Primeira forma: `e`, `f`, `g` (de `metric`) e o elemento de área `area` = √(EG − F²). */
const metric = defineNode({
    name: 'surface.metric',
    inputs: { metric: 'vec3f' },
    outputs: { e: 'f32', f: 'f32', g: 'f32', area: 'f32' },
    code: nodeSurface,
    fn: 'node_surface_metric',
});

/**
 * Curvaturas (de `curvature` = (K, H, k₁, k₂)): gaussiana, média, principais, a curvatura total √((k₁² + k₂²)/2) e o
 * índice de forma (2/π)·atan2(k₁ + k₂, k₁ − k₂) — 1 calota convexa, 0 sela, −1 calota côncava.
 */
const curvature = defineNode({
    name: 'surface.curvature',
    inputs: { curvature: 'vec4f' },
    outputs: {
        gaussian: 'f32',
        mean: 'f32',
        k1: 'f32',
        k2: 'f32',
        curvedness: 'f32',
        shape_index: 'f32',
    },
    code: nodeSurface,
    fn: 'node_surface_curvature',
});

/**
 * Direções principais tangentes: `d1` = a direção de k₁ (`principal`) projetada no plano tangente de `normal` e
 * normalizada; `d2` = n × d₁. Zeros em ponto umbílico ou degenerado.
 */
const principal = defineNode({
    name: 'surface.principal',
    inputs: { principal: 'vec3f', normal: 'vec3f' },
    outputs: { d1: 'vec3f', d2: 'vec3f' },
    code: nodeSurface,
    fn: 'node_surface_principal',
});

/**
 * Ondulações (spec 034, T065b): a normal perturbada por oito trens de onda no plano perpendicular a `up` — a altura
 * h = Σ s/(8kᵢ)·sen(φᵢ), comprimentos de `size` (m) a cerca de um terço dele, fase pela dispersão de águas profundas
 * (ω = √(g k)·`speed`) e o tempo `time` (ligar no `time` da amostra: o tempo simulado). A inclinação tem módulo até
 * `strength` e vale só nas faces voltadas para `up`. Liga no `closure.normal`. Referência: `reference/surface.ts`.
 */
const ripple = defineNode({
    name: 'surface.ripple',
    inputs: { position: 'vec3f', normal: 'vec3f', time: 'f32' },
    outputs: { value: 'vec3f' },
    params: {
        strength: { type: 'f32', default: 0.3 },
        size: { type: 'f32', default: 0.05 },
        speed: { type: 'f32', default: 1 },
        up: { type: 'vec3f', default: [0, 1, 0] },
    },
    code: nodeSurface,
    fn: 'node_surface_ripple',
});

/**
 * Espaço do padrão (spec 011): a coordenada `p` = uv · `scale` + `offset` (repetições por unidade de uv, por eixo — numa
 * esfera, (2, 1) deixa o padrão quadrado no equador), a largura do pixel ou do cone em `p` (`width`), as tangentes de `p` em
 * mundo (`du`, `dv`: ∂posição/∂p) e o período de `p` numa volta do uv (`wrap`) — as entradas dos padrões com relevo
 * (`pattern.weave`, `cells`, `rings`, `grain`) e de `surface.bump`. Sem ligação, lê a amostra (`s.uv`, `s.duvdx`,
 * `s.duvdy`, `s.dpdu`, `s.dpdv`).
 */
const uvSpace = defineNode({
    name: 'surface.uvSpace',
    inputs: {
        uv: 'vec2f',
        duvdx: 'vec2f',
        duvdy: 'vec2f',
        dpdu: 'vec3f',
        dpdv: 'vec3f',
        scale: 'vec2f',
    },
    outputs: { p: 'vec2f', width: 'f32', du: 'vec3f', dv: 'vec3f', wrap: 'vec2f' },
    params: {
        scale: { type: 'vec2f', default: [1, 1] },
        offset: { type: 'vec2f', default: [0, 0] },
    },
    defaults: {
        uv: 's.uv',
        duvdx: 's.duvdx',
        duvdy: 's.duvdy',
        dpdu: 's.dpdu',
        dpdv: 's.dpdv',
    },
    code: nodeSurface,
    fn: 'node_surface_uv_space',
});

/**
 * Relevo (spec 011): a normal perturbada pela altura de gradiente `gradient` (∂h/∂p, de um padrão) sobre as tangentes
 * `du`, `dv` de `surface.uvSpace` — o gradiente de superfície de Mikkelsen (2020). `strength` é a altura em unidades de
 * `p`: o relevo acompanha o tamanho do padrão. Liga no `closure.normal` (ou na `normal` de outro `surface.bump`, para
 * somar dois relevos). Sem tangentes (os acertos dos raios), devolve a normal.
 */
const bump = defineNode({
    name: 'surface.bump',
    inputs: { normal: 'vec3f', du: 'vec3f', dv: 'vec3f', gradient: 'vec2f', strength: 'f32' },
    outputs: { value: 'vec3f' },
    params: { strength: { type: 'f32', default: 1 } },
    defaults: { normal: 's.normal' },
    code: nodeSurface,
    fn: 'node_surface_bump',
});

/**
 * Relevo em milímetros (spec 011): a altura de um padrão (`value` e o `gradient` ∂/∂p dele, com a escala `wrap` de
 * `surface.uvSpace`) vira o relevo (altura, ∂altura/∂u, ∂altura/∂v) em milímetros, no uv da superfície: (`value` −
 * `level`) · `height` — `height` a altura em milímetros de uma unidade do padrão (também entrada: liga a outro nó),
 * `level` o nível do padrão que fica na superfície (0: o relevo só sobe; 1: só desce). Relevos somam-se (`math.add3`).
 * A mesma saída alimenta `surface.reliefNormal` (no material) e `surface.displacement` (na geometria): uma função de
 * altura para os dois.
 */
const relief = defineNode({
    name: 'surface.relief',
    inputs: { value: 'f32', gradient: 'vec2f', wrap: 'vec2f', height: 'f32' },
    outputs: { value: 'vec3f' },
    params: { height: { type: 'f32', default: 1 }, level: { type: 'f32', default: 0 } },
    code: nodeSurface,
    fn: 'node_surface_relief',
});

/**
 * Normal do relevo (spec 011): a normal da superfície deslocada pelo relevo `relief` (de `surface.relief`, em
 * milímetros) com `scale` unidades do mundo por metro (1: cena em metros; a mesma convenção da subsuperfície) — a
 * inclinação da geometria que `surface.displacement` gera com o mesmo relevo, até a largura do pixel (presa em 76°:
 * uma parede mais íngreme viraria a normal para trás). Liga no
 * `closure.normal`. Sem ligação, a normal e as tangentes do uv são as da amostra; sem tangentes (os acertos dos raios),
 * devolve a normal.
 */
const reliefNormal = defineNode({
    name: 'surface.reliefNormal',
    inputs: { normal: 'vec3f', dpdu: 'vec3f', dpdv: 'vec3f', relief: 'vec3f', scale: 'f32' },
    outputs: { value: 'vec3f' },
    params: { scale: { type: 'f32', default: 1 } },
    defaults: { normal: 's.normal', dpdu: 's.dpdu', dpdv: 's.dpdv' },
    code: nodeSurface,
    fn: 'node_surface_relief_normal',
});

/**
 * Saída do ponto `displacement` (spec 011): a altura do relevo `relief` (milímetros) nas unidades do mundo, com `scale`
 * unidades por metro — o que a `DisplacementFunction` devolve para mover os vértices da `ParametricSurface`.
 */
const displacement = defineNode({
    name: 'surface.displacement',
    inputs: { relief: 'vec3f', scale: 'f32' },
    outputs: { value: 'f32' },
    params: { scale: { type: 'f32', default: 1 } },
    code: nodeSurface,
    fn: 'node_surface_displacement',
});

/**
 * Direção do padrão em mundo (spec 011): a direção `direction` na coordenada do padrão (a saída `fiber` de
 * `pattern.weave` e de `pattern.knit`) sobre as tangentes `du`, `dv` de `surface.uvSpace`, normalizada — a `tangent`
 * dos especulares anisotrópicos (o brilho corre ao longo da fibra). Sem tangentes, zero.
 */
const direction = defineNode({
    name: 'surface.direction',
    inputs: { du: 'vec3f', dv: 'vec3f', direction: 'vec2f' },
    outputs: { value: 'vec3f' },
    code: nodeSurface,
    fn: 'node_surface_direction',
});

/**
 * Espaço dos padrões maciços (spec 011): a posição no objeto no referencial do bloco de onde a peça é talhada — o eixo
 * `axis` (a direção da fibra no objeto) vira `p.y` —, × `scale` (unidades do padrão por unidade do objeto) + `offset`
 * (onde a peça está no bloco). Saídas: `p` (a coordenada dos padrões maciços, `pattern.trunk` e `pattern.grain3`),
 * `width` (a largura do pixel em `p`) e `du`, `dv` (∂p/∂u, ∂p/∂v: as entradas de `surface.solidRelief`). O padrão
 * acompanha o objeto e não depende do uv: sem emenda nem aperto nos polos. Sem ligação, lê a amostra.
 */
const solidSpace = defineNode({
    name: 'surface.solidSpace',
    inputs: {
        position: 'vec3f',
        dodu: 'vec3f',
        dodv: 'vec3f',
        duvdx: 'vec2f',
        duvdy: 'vec2f',
        footprint: 'f32',
        scale: 'f32',
        offset: 'vec3f',
        axis: 'vec3f',
    },
    outputs: { p: 'vec3f', width: 'f32', du: 'vec3f', dv: 'vec3f' },
    params: {
        scale: { type: 'f32', default: 1 },
        offset: { type: 'vec3f', default: [0, 0, 0] },
        axis: { type: 'vec3f', default: [0, 1, 0] },
    },
    defaults: {
        position: 's.object_position',
        dodu: 's.dodu',
        dodv: 's.dodv',
        duvdx: 's.duvdx',
        duvdy: 's.duvdy',
        footprint: 's.footprint',
    },
    code: nodeSurface,
    fn: 'node_surface_solid_space',
});

/**
 * Relevo em milímetros de um padrão maciço (spec 011): (`value` − `level`) · `height` e as derivadas no uv, do
 * `gradient` em 3D do padrão sobre `du`, `dv` de `surface.solidSpace`. A mesma saída de `surface.relief`: soma-se a
 * outros relevos e alimenta `surface.reliefNormal` (no material) e `surface.displacement` (na geometria).
 */
const solidRelief = defineNode({
    name: 'surface.solidRelief',
    inputs: { value: 'f32', gradient: 'vec3f', du: 'vec3f', dv: 'vec3f', height: 'f32' },
    outputs: { value: 'vec3f' },
    params: { height: { type: 'f32', default: 1 }, level: { type: 'f32', default: 0 } },
    code: nodeSurface,
    fn: 'node_surface_solid_relief',
});

/**
 * Superfície: métrica, curvaturas, direções principais, ondulações, o espaço dos padrões no uv, o relevo na normal
 * (`bump`), o relevo em milímetros com a normal e o deslocamento dele (`relief`, `reliefNormal`, `displacement`) e a
 * direção de um padrão em mundo (`direction`).
 */
export const surface = {
    metric,
    curvature,
    principal,
    ripple,
    uvSpace,
    solidSpace,
    bump,
    relief,
    solidRelief,
    reliefNormal,
    displacement,
    direction,
} as const;
