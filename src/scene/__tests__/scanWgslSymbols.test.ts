import { describe, expect, it } from 'vitest';
import { scanWgslSymbols, stripWgslComments } from '../shaders/scanWgslSymbols';

describe('stripWgslComments', () => {
    it('remove comentários de linha e de bloco aninhados, preservando quebras de linha', () => {
        const src = 'a // linha\nb /* bloco /* aninhado */ ainda */ c\nd';
        const out = stripWgslComments(src);
        expect(out.replace(/\s+/g, ' ').trim()).toBe('a b c d');
        expect(out.split('\n')).toHaveLength(3);
    });
});

describe('scanWgslSymbols', () => {
    it('declarações de nível superior de todos os tipos, na ordem', () => {
        const src = `
            enable f16;
            alias Real = f32;
            const PI: f32 = 3.14159;
            override WORKGROUP: u32 = 64u;
            struct Particle { pos: vec4f, vel: vec4f }
            var<private> seed: u32;
            var<workgroup> scratch: array<u32, 256>;
            @group(0) @binding(1) var<storage, read_write> particles: array<Particle>;
            @group(0) @binding(0) var<uniform> params: vec4f;
            fn helper(x: f32) -> f32 { return x * PI; }
            @compute @workgroup_size(64)
            fn main_cs(@builtin(global_invocation_id) id: vec3u) { let y = helper(1.0); }
        `;
        expect(scanWgslSymbols(src)).toEqual([
            { name: 'Real', kind: 'alias' },
            { name: 'PI', kind: 'const' },
            { name: 'WORKGROUP', kind: 'override' },
            { name: 'Particle', kind: 'struct' },
            { name: 'seed', kind: 'var' },
            { name: 'scratch', kind: 'var' },
            { name: 'particles', kind: 'var' },
            { name: 'params', kind: 'var' },
            { name: 'helper', kind: 'fn' },
            { name: 'main_cs', kind: 'fn' },
        ]);
    });

    it('ignora declarações dentro de corpos de função e de comentários', () => {
        const src = `
            // fn comentada() {}
            /* struct Escondida { a: f32 } */
            fn f() {
                const local = 1.0;
                var acc = 0.0;
                for (var i = 0u; i < 4u; i++) { let t = local; }
            }
        `;
        expect(scanWgslSymbols(src)).toEqual([{ name: 'f', kind: 'fn' }]);
    });

    it('mantém símbolos repetidos (quem detecta conflito é o módulo)', () => {
        const src = 'fn a() {}\nfn a() {}';
        expect(scanWgslSymbols(src).map((s) => s.name)).toEqual(['a', 'a']);
    });

    it('template de var com tipos aninhados', () => {
        const src = '@group(0) @binding(0) var<storage, read> grid: array<atomic<i32>>;';
        expect(scanWgslSymbols(src)).toEqual([{ name: 'grid', kind: 'var' }]);
    });

    it('fonte vazio ou só diretivas', () => {
        expect(scanWgslSymbols('')).toEqual([]);
        expect(
            scanWgslSymbols('enable f16;\nrequires readonly_and_readwrite_storage_textures;'),
        ).toEqual([]);
    });
});
