import { describe, expect, it } from 'vitest';
import { extensionRecordSchema } from '../descriptors/ExtensionRecord';
import { bindPoints } from '../shaders/bindPoints';
import { composeWgsl } from '../shaders/composeWgsl';
import { WgslCompositionError } from '../shaders/WgslCompositionError';
import { wgslModule, type WgslModule } from '../shaders/WgslModule';
import { POINT_PARAMS, wgslPoint } from '../shaders/WgslPoint';

function errorOf(f: () => unknown): WgslCompositionError {
    try {
        f();
    } catch (e) {
        if (e instanceof WgslCompositionError) return e;
        throw e;
    }
    throw new Error('não lançou');
}

const mod = (name: string, source: string, requires: WgslModule[] = []): WgslModule =>
    wgslModule({ name, source, requires });

const record = extensionRecordSchema('ProbeFnRecord');
const core = mod('probe_core', 'fn core_scale(x: f32) -> f32 { return 2.0 * x; }');
const ready = mod(
    'probe_ready',
    'struct ProbeFnParams { k: f32 }\nfn probe_fn(x: f32, data: ProbeFnParams, time: f32) -> f32 { return core_scale(x); }',
    [core],
);
const helper = mod('probe_helper', 'fn probe_helper_fn() -> f32 { return 1.0; }');
const kernel = mod(
    'probe_kernel',
    '@group(0) @binding(0) var<storage, read_write> out: array<f32>;\n@group(0) @binding(1) var<storage, read> params: array<ProbeFnParams>;\n@compute @workgroup_size(1) fn main() { out[0] = probe_fn(out[0], params[0], 0.0) + probe_helper_fn(); }',
    [helper, ready],
);
const point = wgslPoint({
    name: 'probe',
    required: { name: 'probe_fn', params: ['f32', POINT_PARAMS, 'f32'], returns: 'f32' },
    optional: [{ name: 'probe_du', params: ['f32'], returns: 'f32' }],
    paramsAlias: 'ProbeFnParams',
    record,
    ready,
    hosts: () => [kernel],
});

const user = (source: string, requires: WgslModule[] = []): WgslModule =>
    mod(
        'probe_user_1',
        `struct UserP { k: f32 }\nalias ProbeFnParams = UserP;\n${source}`,
        requires,
    );

describe('bindPoints', () => {
    it('troca o pronto pelo do usuário na árvore, preserva o resto e memoriza', () => {
        const impl = user(
            'fn probe_fn(x: f32, data: UserP, time: f32) -> f32 { return x * data.k; }',
        );
        const bound = bindPoints(kernel, new Map([[point, impl]]));
        expect(bound.name).toBe('probe_kernel@probe_user_1');
        expect(bound.requires[0]).toBe(helper);
        expect(bound.requires[1]).toBe(impl);
        expect(bindPoints(kernel, new Map([[point, impl]]))).toBe(bound);
        const src = composeWgsl(bound).spec.source;
        expect(src).toContain('x * data.k');
        expect(src).not.toContain('core_scale');
    });

    it('sem impls devolve a entrada; ponto fora da árvore é erro', () => {
        expect(bindPoints(kernel, new Map())).toBe(kernel);
        const other = mod('probe_other', 'fn other_main() {}');
        expect(errorOf(() => bindPoints(other, new Map([[point, ready]]))).kind).toBe(
            'point-missing',
        );
    });
});

describe('WgslPoint.check', () => {
    it('aceita a assinatura com o struct da função ou com o alias do ponto, com espaços livres', () => {
        expect(() => {
            point.check(
                user('fn probe_fn(x : f32, data: UserP, time: f32)->f32 { return x; }'),
                'UserP',
            );
        }).not.toThrow();
        expect(() => {
            point.check(
                user('fn probe_fn(x: f32, data: ProbeFnParams, time: f32) -> f32 { return x; }'),
                'UserP',
            );
        }).not.toThrow();
    });

    it('rejeita função ausente, tipos ou retorno errados, nomeando o ponto e as assinaturas', () => {
        const missing = errorOf(() => {
            point.check(user('fn outra(x: f32) -> f32 { return x; }'), 'UserP');
        });
        expect(missing.kind).toBe('point-signature');
        expect(missing.message).toContain("ponto 'probe'");
        expect(missing.message).toContain('fn probe_fn(f32, $P, f32) -> f32');
        const wrong = errorOf(() => {
            point.check(
                user('fn probe_fn(x: f32, data: UserP, time: u32) -> f32 { return x; }'),
                'UserP',
            );
        });
        expect(wrong.message).toContain('esperada fn probe_fn(f32, UserP, f32) -> f32');
        expect(wrong.message).toContain('recebida fn probe_fn(f32, UserP, u32) -> f32');
        const ret = errorOf(() => {
            point.check(
                user('fn probe_fn(x: f32, data: UserP, time: f32) -> vec3f { return vec3f(x); }'),
                'UserP',
            );
        });
        expect(ret.kind).toBe('point-signature');
    });

    it('confere as opcionais definidas e as lista', () => {
        const withDu = user(
            'fn probe_fn(x: f32, data: UserP, time: f32) -> f32 { return x; }\nfn probe_du(x: f32) -> f32 { return 1.0; }',
        );
        expect(() => {
            point.check(withDu, 'UserP');
        }).not.toThrow();
        expect(point.optionalIn(withDu).map((s) => s.name)).toEqual(['probe_du']);
        const badDu = user(
            'fn probe_fn(x: f32, data: UserP, time: f32) -> f32 { return x; }\nfn probe_du(x: vec2f) -> f32 { return 1.0; }',
        );
        expect(
            errorOf(() => {
                point.check(badDu, 'UserP');
            }).kind,
        ).toBe('point-signature');
    });

    it('monta cada kernel com a função: símbolo do núcleo redefinido e chamada sem definição são erros', () => {
        const clash = user(
            'fn probe_helper_fn() -> f32 { return 3.0; }\nfn probe_fn(x: f32, data: UserP, time: f32) -> f32 { return x; }',
        );
        const e = errorOf(() => {
            point.check(clash, 'UserP');
        });
        expect(e.kind).toBe('symbol-conflict');
        expect(e.message).toContain('probe_helper_fn');
        const unresolved = user(
            'fn probe_fn(x: f32, data: UserP, time: f32) -> f32 { return nada(x); }',
        );
        expect(
            errorOf(() => {
                point.check(unresolved, 'UserP');
            }).kind,
        ).toBe('unresolved-reference');
        const usesCore = user(
            'fn probe_fn(x: f32, data: UserP, time: f32) -> f32 { return core_scale(x); }',
            [core],
        );
        expect(() => {
            point.check(usesCore, 'UserP');
        }).not.toThrow();
    });
});
