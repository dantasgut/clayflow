import { describe, expect, it } from 'vitest';
import { ExtensionFunction, type ExtensionFunctionOptions } from '../contracts/ExtensionFunction';
import { extensionRecordSchema } from '../descriptors/ExtensionRecord';
import { bindPoints } from '../shaders/bindPoints';
import { composeWgsl } from '../shaders/composeWgsl';
import { WgslCompositionError } from '../shaders/WgslCompositionError';
import { wgslModule } from '../shaders/WgslModule';
import { POINT_PARAMS, wgslPoint } from '../shaders/WgslPoint';

const record = extensionRecordSchema('ProbeFnRecord');
const ready = wgslModule({
    name: 'probe_ready',
    source: [
        'struct ProbeFnParams { _unused: u32 }',
        'fn probe_fn_params(r: ProbeFnRecord) -> ProbeFnParams { return ProbeFnParams(0u); }',
        'fn probe_fn(x: f32, data: ProbeFnParams) -> f32 { return x; }',
    ].join('\n'),
    structs: [record],
});
const kernel = wgslModule({
    name: 'probe_kernel',
    source: [
        '@group(0) @binding(0) var<storage, read_write> out: array<f32>;',
        '@group(0) @binding(1) var<storage, read> params: array<ProbeFnRecord>;',
        '@compute @workgroup_size(1) fn main() { out[0] = probe_fn(out[0], probe_fn_params(params[0])); }',
    ].join('\n'),
    requires: [ready],
});
const point = wgslPoint({
    name: 'probe',
    required: { name: 'probe_fn', params: ['f32', POINT_PARAMS], returns: 'f32' },
    paramsAlias: 'ProbeFnParams',
    record,
    ready,
    hosts: () => [kernel],
});

class ProbeFunction extends ExtensionFunction {
    constructor(options: ExtensionFunctionOptions, renamed = false) {
        super(point, options, renamed);
    }
}

const CODE =
    'fn probe_fn(x: f32, data: ProbeFnParams) -> f32 { return x * data.k + data.offset.y; }';

describe('ExtensionFunction', () => {
    it('gera struct, carregador e módulo que monta no kernel do ponto', () => {
        const fn = new ProbeFunction({
            code: CODE,
            params: { k: 'f32', n: 'u32', offset: 'vec3f', s: 'i32' },
            values: { k: 2, n: 7, offset: [1, 2, 3], s: -4 },
        });
        expect(fn.module.source).toContain(`struct ${fn.paramsStruct} {`);
        expect(fn.module.source).toContain('alias ProbeFnParams = ');
        expect(fn.module.source).toContain('bitcast<f32>(r.v0[0])');
        expect(fn.module.source).toContain(
            'vec3f(bitcast<f32>(r.v0[2]), bitcast<f32>(r.v0[3]), bitcast<f32>(r.v1[0]))',
        );
        expect(fn.module.source).toContain('bitcast<i32>(r.v1[1])');
        const src = composeWgsl(bindPoints(kernel, new Map([[point, fn.module]]))).spec.source;
        expect(src).toContain('x * data.k');
        expect(fn.codeLine(fn.module.source.split('\n').indexOf(CODE) + 1)).toBe(1);
    });

    it('valores: bits no registro (f32, u32, i32, vetores) e leitura de volta', () => {
        const fn = new ProbeFunction({
            code: CODE,
            params: { k: 'f32', n: 'u32', offset: 'vec3f', s: 'i32' },
            values: { k: 2, n: 7, offset: [1, 2, 3], s: -4 },
        });
        const f32 = new Float32Array(1);
        const u32 = new Uint32Array(f32.buffer);
        f32[0] = 2;
        expect(fn.data.v0[0]).toBe(u32[0]);
        expect(fn.data.v0[1]).toBe(7);
        expect(fn.data.v1[1]).toBe(0xfffffffc);
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
            { id: 'params', role: 'storage-ro', schema: record, storage: 'pool' },
        ]);
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

    it('parâmetros: nome inválido, tipo desconhecido, capacidade e valor para parâmetro inexistente', () => {
        expect(() => new ProbeFunction({ code: CODE, params: { 'a-b': 'f32' } })).toThrow(
            /identificador/,
        );
        expect(() => new ProbeFunction({ code: CODE, params: { a: 'mat4x4f' as never } })).toThrow(
            /não suportado/,
        );
        const many = Object.fromEntries(
            Array.from({ length: 9 }, (_, i) => [`p${i}`, 'vec4f' as const]),
        );
        expect(() => new ProbeFunction({ code: CODE, params: many })).toThrow(/máximo 32/);
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
            source: `fn probe_sum(x: f32, r: ProbeFnRecord) -> f32 { return ${a.functionName}(x, ${a.loaderName}(r)) + ${b.functionName}(x, ${b.loaderName}(r)); }`,
            requires: [a.module, b.module],
        });
        expect(() => composeWgsl(sum)).not.toThrow();
    });
});
