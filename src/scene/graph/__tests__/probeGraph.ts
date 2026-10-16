import {
    ExtensionFunction,
    type ExtensionFunctionOptions,
} from '../../contracts/ExtensionFunction';
import { extensionRecordSchema } from '../../descriptors/ExtensionRecord';
import { wgslModule } from '../../shaders/WgslModule';
import { POINT_PARAMS, wgslPoint, type WgslPoint } from '../../shaders/WgslPoint';
import { wgslResource } from '../../shaders/WgslResource';
import { defineNode } from '../NodeDefinition';

// Ponto e nós de prova dos testes de grafo (spec 031, US2): `probe_fn(s: ProbeSample, k: f32, data) -> vec3f`.

export const record = extensionRecordSchema('GraphProbeRecord');

const types = wgslModule({
    name: 'graph_probe_types',
    source: 'struct ProbeSample { position: vec3f, time: f32 }',
});

const ready = wgslModule({
    name: 'graph_probe_ready',
    source: [
        'struct GraphProbeParams { _unused: u32 }',
        'fn probe_fn_params(r: GraphProbeRecord) -> GraphProbeParams { return GraphProbeParams(0u); }',
        'fn probe_fn(s: ProbeSample, k: f32, data: GraphProbeParams) -> vec3f { return s.position * k; }',
    ].join('\n'),
    requires: [types],
    structs: [record],
});

const kernel = wgslModule({
    name: 'graph_probe_kernel',
    source: [
        '@compute @workgroup_size(1) fn main() {',
        '    let s = ProbeSample(out[0].xyz, out[0].w);',
        '    out[0] = vec4f(probe_fn(s, 2.0, probe_fn_params(params[0])), 1.0);',
        '}',
    ].join('\n'),
    requires: [
        ready,
        types,
        wgslResource({
            name: 'out',
            binding: { storage: 'read_write' },
            type: { wgsl: 'vec4f', array: true },
            frequency: 'draw',
            provider: 'private',
        }),
        wgslResource({
            name: 'params',
            binding: { storage: 'read' },
            type: { schema: record, array: true },
            frequency: 'draw',
            provider: 'private',
        }),
    ],
});

/** Ponto de prova, avaliado em `compute`. */
export const probePoint: WgslPoint = wgslPoint({
    name: 'graph_probe',
    required: {
        name: 'probe_fn',
        params: ['ProbeSample', 'f32', POINT_PARAMS],
        returns: 'vec3f',
        names: ['s', 'k', 'data'],
    },
    paramsAlias: 'GraphProbeParams',
    record,
    context: 'compute',
    ready,
    hosts: () => [kernel],
});

/** Função do ponto de prova (código ou grafo). */
export class ProbeGraphFunction extends ExtensionFunction {
    constructor(options: ExtensionFunctionOptions) {
        super(probePoint, options);
    }
}

export const nodeCode = wgslModule({
    name: 'graph_probe_nodes',
    source: [
        'fn n_scale(x: vec3f, factor: f32) -> vec3f { return x * factor; }',
        'fn n_add(a: f32, b: f32) -> f32 { return a + b; }',
        'fn n_wave(t: f32, amp: f32, freq: f32) -> f32 { return amp * sin(freq * t); }',
        'struct SplitOut { x: f32, rest: vec2f }',
        'fn n_split(v: vec3f) -> SplitOut { return SplitOut(v.x, v.yz); }',
        'fn n_combine(x: f32, rest: vec2f) -> vec3f { return vec3f(x, rest); }',
        'fn n_ddx(x: f32) -> f32 { return dpdx(x); }',
    ].join('\n'),
});

export const scale = defineNode({
    name: 'probe.scale',
    inputs: { x: 'vec3f' },
    outputs: { value: 'vec3f' },
    params: { factor: { type: 'f32', default: 1 } },
    code: nodeCode,
    fn: 'n_scale',
});
export const add = defineNode({
    name: 'probe.add',
    inputs: { a: 'f32', b: 'f32' },
    outputs: { value: 'f32' },
    defaults: { b: '0.0' },
    code: nodeCode,
    fn: 'n_add',
});
export const wave = defineNode({
    name: 'probe.wave',
    inputs: { t: 'f32' },
    outputs: { value: 'f32' },
    params: { amp: { type: 'f32', default: 1 }, freq: { type: 'f32', default: 1 } },
    code: nodeCode,
    fn: 'n_wave',
});
export const split = defineNode({
    name: 'probe.split',
    inputs: { v: 'vec3f' },
    outputs: { x: 'f32', rest: 'vec2f' },
    code: nodeCode,
    fn: 'n_split',
});
export const combine = defineNode({
    name: 'probe.combine',
    inputs: { x: 'f32', rest: 'vec2f' },
    outputs: { value: 'vec3f' },
    code: nodeCode,
    fn: 'n_combine',
});
export const ddx = defineNode({
    name: 'probe.ddx',
    inputs: { x: 'f32' },
    outputs: { value: 'f32' },
    code: nodeCode,
    fn: 'n_ddx',
    contexts: ['fragment'],
});
