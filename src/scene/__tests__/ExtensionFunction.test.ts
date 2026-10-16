import { describe, expect, it } from 'vitest';
import { ExtensionFunction, type ExtensionFunctionOptions } from '../contracts/ExtensionFunction';
import { bindPoints } from '../shaders/bindPoints';
import { composeWgsl } from '../shaders/composeWgsl';
import { WgslCompositionError } from '../shaders/WgslCompositionError';
import { wgslModule } from '../shaders/WgslModule';
import { POINT_PARAMS, wgslPoint } from '../shaders/WgslPoint';
import { wgslResource } from '../shaders/WgslResource';

const ready = wgslModule({
    name: 'probe_ready',
    source: [
        'struct ProbeFnParams { _unused: u32 }',
        'fn probe_fn_params(slot: u32) -> ProbeFnParams { return ProbeFnParams(0u); }',
        'fn probe_fn(x: f32, data: ProbeFnParams) -> f32 { return x; }',
    ].join('\n'),
});
const outRes = wgslResource({
    name: 'out',
    binding: { storage: 'read_write' },
    type: { wgsl: 'f32', array: true },
    frequency: 'draw',
    provider: 'private',
});
const kernel = wgslModule({
    name: 'probe_kernel',
    source: '@compute @workgroup_size(1) fn main() { out[0] = probe_fn(out[0], probe_fn_params(0u)); }',
    requires: [ready, outRes],
});
const point = wgslPoint({
    name: 'probe',
    required: { name: 'probe_fn', params: ['f32', POINT_PARAMS], returns: 'f32' },
    paramsAlias: 'ProbeFnParams',
    ready,
    hosts: () => [kernel],
});

/** O mesmo ponto como ponto de cena (funções renomeadas com o hash). */
const scenePoint = wgslPoint({
    name: 'probe',
    required: { name: 'probe_fn', params: ['f32', POINT_PARAMS], returns: 'f32' },
    paramsAlias: 'ProbeFnParams',
    ready: wgslModule({ ...ready, name: 'probe_scene_ready' }),
    scene: { globals: {}, combine: () => ready },
});

class ProbeFunction extends ExtensionFunction {
    constructor(options: ExtensionFunctionOptions, scene = false) {
        super(scene ? scenePoint : point, options);
    }
}

const CODE =
    'fn probe_fn(x: f32, data: ProbeFnParams) -> f32 { return x * data.k + data.offset.y; }';

describe('ExtensionFunction', () => {
    it('gera alias e carregador do registro tipado; o módulo monta no kernel do ponto', () => {
        const fn = new ProbeFunction({
            code: CODE,
            params: { k: 'f32', n: 'u32', offset: 'vec3f', s: 'i32' },
            values: { k: 2, n: 7, offset: [1, 2, 3], s: -4 },
        });
        expect(fn.module.source).toContain(`alias ProbeFnParams = ${fn.paramsStruct};`);
        expect(fn.module.source).toContain(`fn probe_fn_params(slot: u32) -> ${fn.paramsStruct} {`);
        expect(fn.module.source).not.toContain('bitcast');
        const src = composeWgsl(bindPoints(kernel, new Map([[point, fn.module]]))).spec.source;
        expect(src).toContain('x * data.k');
        expect(src).toContain('offset: vec3f,');
        expect(fn.codeLine(fn.module.source.split('\n').indexOf(CODE) + 1)).toBe(1);
    });

    it('valores: campos tipados no registro (f32, u32, i32, vetores) e leitura de volta', () => {
        const fn = new ProbeFunction({
            code: CODE,
            params: { k: 'f32', n: 'u32', offset: 'vec3f', s: 'i32' },
            values: { k: 2, n: 7, offset: [1, 2, 3], s: -4 },
        });
        expect(fn.data.k).toBe(2);
        expect(fn.data.n).toBe(7);
        expect(fn.data.offset).toEqual([1, 2, 3]);
        expect(fn.data.s).toBe(-4);
        expect(fn.data.revision).toBe(0);
        expect(fn.values.k).toBe(2);
        expect(fn.values.offset).toEqual([1, 2, 3]);
        expect(fn.values.s).toBe(-4);
        fn.values.k = 0.5;
        expect(fn.values.k).toBe(0.5);
        expect(() => {
            fn.values.offset = [1, 2];
        }).toThrow(/vec3f/);
        expect(() => {
            fn.values.k = Number.NaN;
        }).toThrow(/finito/);
        expect(fn.getDescriptors()).toEqual([
            { id: 'params', role: 'storage-ro', schema: fn.record, storage: 'pool' },
        ]);
        expect(fn.record.name).toMatch(/^probe:[0-9a-f]{8}$/);
    });

    it('rejeita assinatura errada na criação e em setCode (o código anterior continua)', () => {
        expect(
            () =>
                new ProbeFunction({
                    code: 'fn probe_fn(x: u32, data: ProbeFnParams) -> f32 { return 1.0; }',
                }),
        ).toThrow(WgslCompositionError);
        const fn = new ProbeFunction({ code: CODE, params: { k: 'f32', offset: 'vec3f' } });
        const before = fn.module;
        expect(() => {
            fn.setCode('fn outra() {}');
        }).toThrow(/probe_fn/);
        expect(fn.module).toBe(before);
        expect(fn.revision).toBe(0);
        fn.setCode('fn probe_fn(x: f32, data: ProbeFnParams) -> f32 { return x + data.k; }');
        expect(fn.revision).toBe(1);
        expect(fn.module).not.toBe(before);
    });

    it('parâmetros: nome inválido ou reservado, tipo desconhecido e valor para parâmetro inexistente', () => {
        expect(() => new ProbeFunction({ code: CODE, params: { 'a-b': 'f32' } })).toThrow(
            /identificador/,
        );
        expect(() => new ProbeFunction({ code: CODE, params: { a: 'mat4x4f' as never } })).toThrow(
            /não suportado/,
        );
        expect(() => new ProbeFunction({ code: CODE, params: { revision: 'u32' } })).toThrow(
            /reservado/,
        );
        expect(() => new ProbeFunction({ code: CODE, values: { z: 1 } })).toThrow(/desconhecido/);
    });

    it('renomeada: função, alias e carregador com o sufixo do hash; duas no mesmo shader sem conflito', () => {
        const a = new ProbeFunction({ code: CODE, params: { k: 'f32', offset: 'vec3f' } }, true);
        const b = new ProbeFunction(
            { code: 'fn probe_fn(x: f32, data: ProbeFnParams) -> f32 { return -x; }' },
            true,
        );
        expect(a.functionName).toMatch(/^probe_fn_[0-9a-f]{8}$/);
        expect(a.loaderName).toMatch(/^probe_fn_params_[0-9a-f]{8}$/);
        expect(a.module.source).toContain(`fn ${a.functionName}(x: f32, data: ProbeFnParams_`);
        const sum = wgslModule({
            name: 'probe_sum',
            source: `fn probe_sum(x: f32) -> f32 { return ${a.functionName}(x, ${a.loaderName}(0u)) + ${b.functionName}(x, ${b.loaderName}(1u)); }`,
            requires: [a.module, b.module],
        });
        expect(() => composeWgsl(sum)).not.toThrow();
    });
});
