import { describe, expect, it } from 'vitest';
import { specHash } from '../specHash';
import type { ResourceSpec } from '../../contracts/specs/ResourceSpec';

const buf = (size: number, disc: string): ResourceSpec => ({
    kind: 'buffer', subkind: 'storage', byteSize: size, discriminator: disc,
});

describe('specHash', () => {
    it('é determinístico', () => {
        const a = specHash(buf(64, 'a'));
        const b = specHash(buf(64, 'a'));
        expect(a).toBe(b);
    });

    it('produz hashes distintos para campos distintos', () => {
        expect(specHash(buf(64, 'a'))).not.toBe(specHash(buf(128, 'a')));
        expect(specHash(buf(64, 'a'))).not.toBe(specHash(buf(64, 'b')));
    });

    it('discriminator distingue specs estruturalmente iguais', () => {
        const a = specHash(buf(64, 'cam_main'));
        const b = specHash(buf(64, 'cam_mirror'));
        expect(a).not.toBe(b);
    });

    it('ordem das chaves não importa (serialização estável)', () => {
        const a: ResourceSpec = { kind: 'buffer', subkind: 'uniform', byteSize: 32, discriminator: 'x' };
        const b: ResourceSpec = { discriminator: 'x', byteSize: 32, subkind: 'uniform', kind: 'buffer' };
        expect(specHash(a)).toBe(specHash(b));
    });

    it('formato UUIDv5 (xxxxxxxx-xxxx-5xxx-yxxx-xxxxxxxxxxxx)', () => {
        const h = specHash(buf(64, 'test'));
        expect(h).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });

    it('lida com cycles sem stack overflow', () => {
        type Cyclic = { kind: string; self?: Cyclic };
        const a: Cyclic = { kind: 'test' };
        a.self = a;
        // O specHash não deveria ser chamado com objetos cíclicos em prática (specs são planos),
        // mas o stableStringify tem proteção contra ciclos via WeakSet.
        expect(() => specHash(a as unknown as ResourceSpec)).not.toThrow();
    });
});
