import { describe, expect, it } from 'vitest';
import { composeWgsl } from '../shaders/composeWgsl';
import { wgslModule, type WgslModule } from '../shaders/WgslModule';
import { WgslCompositionError } from '../shaders/WgslCompositionError';
import { StructSchema, fieldStruct } from '../descriptors/StructSchema';
import { FieldType } from '../descriptors/FieldType';
import { wgslResource } from '../shaders/WgslResource';

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

describe('composeWgsl — ordem e deduplicação', () => {
    it('diamante: D uma vez, antes de B e C, que vêm antes de A', () => {
        const d = mod('d', 'fn fd() -> f32 { return 1.0; }');
        const b = mod('b', 'fn fb() -> f32 { return fd(); }', [d]);
        const c = mod('c', 'fn fc() -> f32 { return fd(); }', [d]);
        const a = mod('a', '@compute @workgroup_size(1) fn main_a() { let x = fb() + fc(); }', [
            b,
            c,
        ]);
        const out = composeWgsl(a);
        expect(out.modules).toEqual(['d', 'b', 'c', 'a']);
        expect(out.spec.source.match(/fn fd\(/g)).toHaveLength(1);
        const src = out.spec.source;
        expect(src.indexOf('fn fd(')).toBeLessThan(src.indexOf('fn fb('));
        expect(src.indexOf('fn fb(')).toBeLessThan(src.indexOf('fn fc('));
        expect(src.indexOf('fn fc(')).toBeLessThan(src.indexOf('fn main_a('));
        expect(out.symbols.get('fd')).toBe('d');
    });

    it('ordem de requires preservada entre irmãos', () => {
        const x = mod('x', 'fn fx() {}');
        const y = mod('y', 'fn fy() {}');
        expect(composeWgsl(mod('e1', 'fn e() { fx(); fy(); }', [y, x])).modules).toEqual([
            'y',
            'x',
            'e1',
        ]);
    });

    it('determinística e memorizada: mesmo objeto de spec, congelado', () => {
        const a = mod('mem', 'fn f() {}');
        const first = composeWgsl(a);
        expect(composeWgsl(a)).toBe(first);
        expect(Object.isFrozen(first.spec)).toBe(true);
        expect(first.spec).toEqual({
            kind: 'shader',
            discriminator: 'wgsl:mem',
            source: 'fn f() {}\n',
        });
        // Outro objeto com o mesmo conteúdo produz o mesmo texto.
        expect(composeWgsl(mod('mem', 'fn f() {}')).spec.source).toBe(first.spec.source);
    });
});

describe('composeWgsl — linhas de cada módulo', () => {
    it('ranges apontam para o texto de cada módulo no fonte montado (com structs no topo)', () => {
        const schema = new StructSchema('RangeProbe', { a: FieldType.f32, b: FieldType.f32 });
        const base = wgslModule({
            name: 'range_base',
            source: 'fn base_a() -> f32 {\n    return 1.0;\n}',
            structs: [schema],
        });
        const top = mod(
            'range_top',
            'fn top_b() -> f32 {\n    return base_a();\n}\nfn top_c() {}',
            [base],
        );
        const out = composeWgsl(top);
        const lines = out.spec.source.split('\n');
        for (const m of [base, top]) {
            const r = out.ranges.get(m.name)!;
            expect(lines.slice(r.first - 1, r.last).join('\n')).toBe(m.source);
        }
    });
});

describe('composeWgsl — erros', () => {
    it('ciclo com o caminho completo', () => {
        const a = wgslModule({ name: 'a', source: 'fn fa() {}' });
        const b = wgslModule({ name: 'b', source: 'fn fb() {}', requires: [a] });
        // Ciclo só é construível mutando o array congelado em teste — usa objeto equivalente não congelado.
        const cyclicA = { ...a, requires: [] as WgslModule[] };
        const cyclicB = { ...b, requires: [cyclicA] };
        cyclicA.requires.push(cyclicB);
        const e = errorOf(() => composeWgsl(cyclicA));
        expect(e.kind).toBe('cycle');
        expect(e.detail).toEqual(['a', 'b', 'a']);
    });

    it('ciclo de tamanho 1', () => {
        const self = { ...wgslModule({ name: 's', source: '' }), requires: [] as WgslModule[] };
        self.requires.push(self);
        expect(errorOf(() => composeWgsl(self)).kind).toBe('cycle');
    });

    it('dois módulos distintos com o mesmo nome', () => {
        const m1 = mod('math', 'fn m1() {}');
        const m2 = mod('math', 'fn m2() {}');
        const e = errorOf(() => composeWgsl(mod('user', 'fn u() { m1(); m2(); }', [m1, m2])));
        expect(e.kind).toBe('duplicate-module-name');
        expect(e.detail[0]).toBe('math');
    });

    it('símbolo definido em dois módulos', () => {
        const a = mod('ma', 'fn shared() {}');
        const b = mod('mb', 'fn shared() {}');
        const e = errorOf(() => composeWgsl(mod('top', 'fn t() { shared(); }', [a, b])));
        expect(e.kind).toBe('symbol-conflict');
        expect(e.detail).toEqual(['shared', 'ma', 'mb']);
    });

    it('símbolo definido duas vezes no mesmo módulo (na criação)', () => {
        expect(() => wgslModule({ name: 'dup', source: 'fn f() {}\nfn f() {}' })).toThrow(
            WgslCompositionError,
        );
    });

    it('chamada sem definição nomeia a função', () => {
        const e = errorOf(() =>
            composeWgsl(mod('k', 'fn shade(p: vec3f) -> f32 { return mat3_from_cols(p); }')),
        );
        expect(e.kind).toBe('unresolved-reference');
        expect(e.detail).toEqual(['mat3_from_cols']);
    });
});

describe('composeWgsl — referências (substitui validateWgslReferences)', () => {
    it('nativas, palavras-chave, atributos e comentários não contam como chamada', () => {
        const src = `
            // call_to_missing()
            /* with_missing_call() */
            @fragment fn shade(@location(0) uv: vec2f) -> @location(0) vec4f {
                let c = textureSample(albedo, samp, uv);
                var s = 0u;
                for (var i = 0u; i < 4u; i++) { if (s > 2u) { break; } s = s + i; }
                return vec4f(dot(c.xyz, normalize(vec3f(0.0, 1.0, 0.0))), 0.0, 0.0, 1.0);
            }
        `;
        const samp = wgslResource({
            name: 'samp',
            binding: { sampler: 'filtering' },
            frequency: 'draw',
            provider: 'private',
        });
        const albedo = wgslResource({
            name: 'albedo',
            binding: { texture: { sample: 'f32' } },
            frequency: 'draw',
            provider: 'private',
        });
        // Atributos com parênteses (`@location(0)`, `@group(0) @binding(n)` emitidos pela montagem) não são chamadas.
        const composed = composeWgsl(mod('frag', src, [samp, albedo]));
        expect(composed.spec.source).toContain(
            '@group(0) @binding(0) var albedo: texture_2d<f32>;',
        );
        expect(composed.spec.source).toContain('@group(0) @binding(1) var samp: sampler;');
    });

    it('struct definido no fonte pode ser usado como construtor', () => {
        expect(() =>
            composeWgsl(mod('ctor', 'struct P { a: f32 }\nfn f() -> P { return P(1.0); }')),
        ).not.toThrow();
    });
});

describe('composeWgsl — structs gerados', () => {
    const Inner = new StructSchema('InnerPool', { x: FieldType.f32 }, { wgslName: 'Inner' });
    const Outer = new StructSchema('Outer', { i: fieldStruct(Inner), n: FieldType.u32 });

    it('structs no topo (aninhados antes), uma vez cada; marcador removido', () => {
        const data = wgslResource({
            name: 'data',
            binding: { storage: 'read' },
            type: { schema: Outer, array: true },
            frequency: 'draw',
            provider: 'private',
        });
        const lib = wgslModule({
            name: 'lib',
            source: '{{struct:Outer}}\nfn get(o: Outer) -> f32 { return o.i.x; }',
            structs: [Outer],
        });
        const k = wgslModule({
            name: 'kernel',
            source: '{{struct:Outer}}\nfn k() { let v = get(data[0]); }',
            requires: [lib, data],
            structs: [Outer],
        });
        const src = composeWgsl(k).spec.source;
        expect(src.match(/struct Outer \{/g)).toHaveLength(1);
        expect(src.match(/struct Inner \{/g)).toHaveLength(1);
        expect(src.indexOf('struct Inner {')).toBeLessThan(src.indexOf('struct Outer {'));
        expect(src.indexOf('struct Outer {')).toBeLessThan(src.indexOf('fn get('));
        expect(src).not.toContain('{{struct:');
    });

    it('marcador sem schema alcançável → erro nomeando marcador e módulo', () => {
        const e = errorOf(() =>
            composeWgsl(wgslModule({ name: 'orphan', source: '{{struct:Missing}}' })),
        );
        expect(e.kind).toBe('struct-marker');
        expect(e.detail).toEqual(['Missing', 'orphan']);
    });

    it('marcador alcançado por dependência é aceito', () => {
        const dep = wgslModule({ name: 'dep', source: '', structs: [Outer] });
        expect(() =>
            composeWgsl(wgslModule({ name: 'uses', source: '{{struct:Inner}}', requires: [dep] })),
        ).not.toThrow();
    });

    it('dois schemas com o mesmo wgslName: iguais passam, layouts diferentes falham', () => {
        const same = new StructSchema('OtherPool', { x: FieldType.f32 }, { wgslName: 'Inner' });
        const diff = new StructSchema('DiffPool', { x: FieldType.u32 }, { wgslName: 'Inner' });
        expect(() =>
            composeWgsl(wgslModule({ name: 'ok', source: '', structs: [Inner, same] })),
        ).not.toThrow();
        const e = errorOf(() =>
            composeWgsl(wgslModule({ name: 'bad', source: '', structs: [Inner, diff] })),
        );
        expect(e.kind).toBe('struct-conflict');
    });

    it('símbolo do módulo em conflito com struct gerado', () => {
        const e = errorOf(() =>
            composeWgsl(
                wgslModule({ name: 'clash', source: 'struct Inner { y: f32 }', structs: [Inner] }),
            ),
        );
        expect(e.kind).toBe('symbol-conflict');
        expect(e.detail).toEqual(['Inner', 'struct Inner', 'clash']);
    });
});
