import { describe, expect, it } from 'vitest';
import { specHash } from '../specHash';
import type { BindGroupSpec } from '../../contracts/specs/BindGroupSpec';
import type { BundleSpec } from '../../contracts/specs/BundleSpec';
import type { ComputePipelineSpec } from '../../contracts/specs/ComputePipelineSpec';
import type { LayoutSpec } from '../../contracts/specs/LayoutSpec';
import type { ResourceSpec } from '../../contracts/specs/ResourceSpec';
import type { ShaderModuleSpec } from '../../contracts/specs/ShaderModuleSpec';
import type { StorageBufferSpec } from '../../contracts/specs/StorageBufferSpec';

/** Spec com um campo enumerável cujo getter conta quantas vezes foi lido pela serialização. */
function countingSpec(): { spec: ResourceSpec; reads: () => number } {
    let reads = 0;
    const spec = { kind: 'buffer', subkind: 'storage', discriminator: 'counted' } as Record<
        string,
        unknown
    >;
    Object.defineProperty(spec, 'byteSize', {
        enumerable: true,
        get: () => {
            reads++;
            return 64;
        },
    });
    return { spec: spec as unknown as ResourceSpec, reads: () => reads };
}

const shader = (source: string, disc = 'sh'): ShaderModuleSpec => ({
    kind: 'shader',
    discriminator: disc,
    source,
});

const layout = (): LayoutSpec => ({
    kind: 'layout',
    discriminator: 'l',
    entries: [{ binding: 0, visibility: 4, kind: 'buffer', type: 'storage' }],
});

const pipeline = (sh: ShaderModuleSpec, l: LayoutSpec): ComputePipelineSpec => ({
    kind: 'pipeline',
    subkind: 'compute',
    discriminator: 'p',
    layouts: [l],
    shader: sh,
    entryPoint: 'main',
});

const bundle = (body: BundleSpec['body']): BundleSpec => ({
    kind: 'bundle',
    discriminator: 'b',
    formats: { colorFormats: ['bgra8unorm'] },
    body,
});

describe('specHash — memorização por referência', () => {
    it('segunda chamada com o mesmo objeto não reserializa', () => {
        const { spec, reads } = countingSpec();
        const first = specHash(spec);
        const afterFirst = reads();
        expect(afterFirst).toBe(1);
        for (let i = 0; i < 1000; i++) expect(specHash(spec)).toBe(first);
        expect(reads()).toBe(afterFirst);
    });

    it('WGSL grande dentro de um pipeline é serializado uma vez por objeto de shader', () => {
        let reads = 0;
        const sh = { kind: 'shader', discriminator: 'big' } as Record<string, unknown>;
        const source = 'x'.repeat(1_000_000);
        Object.defineProperty(sh, 'source', {
            enumerable: true,
            get: () => {
                reads++;
                return source;
            },
        });
        const l = layout();
        for (let i = 0; i < 100; i++) {
            specHash(pipeline(sh as unknown as ShaderModuleSpec, l));
        }
        expect(reads).toBe(1);
    });
});

describe('specHash — identidade composta', () => {
    it('objetos distintos de conteúdo igual → hash igual, inclusive aninhados', () => {
        const a = pipeline(shader('fn main() {}'), layout());
        const b = pipeline(shader('fn main() {}'), layout());
        expect(a.shader).not.toBe(b.shader);
        expect(specHash(a)).toBe(specHash(b));
    });

    it('conteúdo diferente em qualquer nível → hash diferente', () => {
        const base = specHash(pipeline(shader('fn main() {}'), layout()));
        expect(specHash(pipeline(shader('fn main() { }'), layout()))).not.toBe(base);
        const l2: LayoutSpec = {
            ...layout(),
            entries: [{ binding: 1, visibility: 4, kind: 'buffer', type: 'storage' }],
        };
        expect(specHash(pipeline(shader('fn main() {}'), l2))).not.toBe(base);
    });

    it('bind group compõe layout e buffers aninhados', () => {
        const buf = (size: number): StorageBufferSpec => ({
            kind: 'buffer',
            subkind: 'storage',
            discriminator: 'buf',
            byteSize: size,
        });
        const bg = (size: number): BindGroupSpec => ({
            kind: 'bindgroup',
            discriminator: 'bg',
            layout: layout(),
            bindings: [{ binding: 0, kind: 'buffer', buffer: buf(size) }],
        });
        expect(specHash(bg(64))).toBe(specHash(bg(64)));
        expect(specHash(bg(64))).not.toBe(specHash(bg(128)));
    });

    it('a spec aninhada mantém o próprio hash (o mesmo de quando hasheada sozinha)', () => {
        const sh = shader('fn main() {}');
        const alone = specHash(shader('fn main() {}'));
        specHash(pipeline(sh, layout()));
        expect(specHash(sh)).toBe(alone);
    });
});

describe('specHash — funções por identidade', () => {
    it('BundleSpec com corpos diferentes → hashes diferentes', () => {
        const a = bundle(() => undefined);
        const b = bundle(() => undefined);
        expect(specHash(a)).not.toBe(specHash(b));
    });

    it('mesmo corpo → mesmo hash', () => {
        const body = (): void => undefined;
        expect(specHash(bundle(body))).toBe(specHash(bundle(body)));
    });
});

describe('specHash — robustez e estabilidade', () => {
    it('ciclos não travam', () => {
        const a: Record<string, unknown> = { kind: 'test' };
        a.self = a;
        expect(() => specHash(a as unknown as ResourceSpec)).not.toThrow();
    });

    it('spec sem aninhamento mantém o hash de antes da composição (valor fixo)', () => {
        expect(
            specHash({ kind: 'buffer', subkind: 'storage', byteSize: 64, discriminator: 'test' }),
        ).toBe('dd0bcffe-6292-5a86-ae08-a03e30b6ef5b');
        expect(
            specHash({ kind: 'sampler', discriminator: 's', desc: { magFilter: 'linear' } }),
        ).toBe('e2949f4a-c7d9-51c1-828b-0b8cb9ed96d4');
    });
});
