import { defineNode } from '../../../scene/graph/NodeDefinition';
import { nodeClosure } from '../shaders';

// Nós de composição de fechamentos (spec 011, R5). Os lobos do mesmo tipo no mesmo "bin" fundem os parâmetros pelo peso
// (rugosidade em α², cores e direções lineares), como o Blender EEVEE quando os fechamentos excedem os bins.

/** Mistura `a` e `b` por `t` em [0, 1] (0 = `a`): a máscara entre dois materiais. */
const mix = defineNode({
    name: 'closure.mix',
    inputs: { a: 'Closure', b: 'Closure', t: 'f32' },
    outputs: { value: 'Closure' },
    params: { t: { type: 'f32', default: 0.5 } },
    code: nodeClosure,
    fn: 'node_closure_mix',
});

/** Soma `a` e `b` (os lobos nos seus bins; um dielétrico fica sobre o difuso). */
const add = defineNode({
    name: 'closure.add',
    inputs: { a: 'Closure', b: 'Closure' },
    outputs: { value: 'Closure' },
    code: nodeClosure,
    fn: 'node_closure_add',
});

/**
 * Camada: o especular dielétrico de `top` como verniz sobre `base`, atenuando-a pelo que reflete e pela cor de absorção
 * `top_color`, com o peso `top_weight` (o verniz da madeira, a pintura de carro).
 */
const layer = defineNode({
    name: 'closure.layer',
    inputs: { top: 'Closure', base: 'Closure', top_color: 'vec3f', top_weight: 'f32' },
    outputs: { value: 'Closure' },
    params: {
        top_color: { type: 'vec3f', default: [1, 1, 1] },
        top_weight: { type: 'f32', default: 1 },
    },
    code: nodeClosure,
    fn: 'node_closure_layer',
    tags: ['lobe:coat'],
});

/** Filme fino (iridescência) de espessura em nm e IOR do filme sobre o especular de base. */
const thinFilm = defineNode({
    name: 'closure.thinFilm',
    inputs: { c: 'Closure', thickness: 'f32', ior: 'f32' },
    outputs: { value: 'Closure' },
    params: { thickness: { type: 'f32', default: 400 }, ior: { type: 'f32', default: 1.3 } },
    code: nodeClosure,
    fn: 'node_closure_thin_film',
    tags: ['lobe:thinFilm'],
});

/** Opacidade (recorte parcial) em [0, 1]: o material vai ao passe de transmissivos. */
const opacity = defineNode({
    name: 'closure.opacity',
    inputs: { c: 'Closure', alpha: 'f32' },
    outputs: { value: 'Closure' },
    params: { alpha: { type: 'f32', default: 1 } },
    code: nodeClosure,
    fn: 'node_closure_opacity',
    tags: ['lobe:opacity'],
});

/** Normal própria dos lobos de base (de um nó ou de um campo); comprimento 0 = a geométrica. */
const normal = defineNode({
    name: 'closure.normal',
    inputs: { c: 'Closure', normal: 'vec3f' },
    outputs: { value: 'Closure' },
    params: { normal: { type: 'vec3f', default: [0, 0, 0] } },
    code: nodeClosure,
    fn: 'node_closure_normal',
});

/** Nós de composição de fechamentos. */
export const closure = { mix, add, layer, thinFilm, opacity, normal } as const;
