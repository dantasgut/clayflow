import { describe, expect, it } from 'vitest';
import { validateWgslReferences } from '../flows/validateWgslReferences';

describe('validateWgslReferences', () => {
    it('source vazio passa', () => {
        expect(() => {
            validateWgslReferences('', 'empty');
        }).not.toThrow();
    });

    it('builtins WGSL não disparam erro (textureSample, dot, normalize, etc.)', () => {
        const src = `
            fn shade(uv: vec2f) -> vec4f {
                let c = textureSample(albedo, samp, uv);
                let n = normalize(vec3f(0.0, 1.0, 0.0));
                return vec4f(dot(c.xyz, n), 0.0, 0.0, 1.0);
            }
        `;
        expect(() => {
            validateWgslReferences(src, 'ctx');
        }).not.toThrow();
    });

    it('detecta chamada a fn ausente com mensagem clara', () => {
        const src = `
            fn shade(p: vec3f) -> f32 {
                return mat3_from_cols(p);
            }
        `;
        expect(() => {
            validateWgslReferences(src, 'kernel A');
        }).toThrowError(/mat3_from_cols/);
    });

    it('keyword (if, for, return) não conta como call', () => {
        const src = `
            fn loop_test(n: u32) -> u32 {
                var s: u32 = 0u;
                for (var i: u32 = 0u; i < n; i++) {
                    s = s + i;
                    if (s > 100u) { return s; }
                }
                return s;
            }
        `;
        expect(() => {
            validateWgslReferences(src, 'ctx');
        }).not.toThrow();
    });

    it('comentários ignorados', () => {
        const src = `
            // chamada que não existe é só comment
            // call_to_missing()
            /* multi-line
               with_missing_call() */
            fn ok() -> i32 { return 0; }
        `;
        expect(() => {
            validateWgslReferences(src, 'ctx');
        }).not.toThrow();
    });

    it('múltiplas funções faltantes listadas no erro', () => {
        const src = `
            fn driver() -> f32 {
                return helper_a(0.0) + helper_b(1.0);
            }
        `;
        expect(() => {
            validateWgslReferences(src, 'ctx');
        }).toThrowError(/helper_a|helper_b/);
    });

    it('fn definida + chamada na mesma source não dispara', () => {
        const src = `
            fn add(a: f32, b: f32) -> f32 { return a + b; }
            fn driver() -> f32 { return add(1.0, 2.0); }
        `;
        expect(() => {
            validateWgslReferences(src, 'ctx');
        }).not.toThrow();
    });
});
