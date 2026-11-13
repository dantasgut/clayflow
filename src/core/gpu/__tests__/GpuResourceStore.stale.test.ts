import { describe, expect, it } from 'vitest';
import { GpuResourceStore } from '../GpuResourceStore';

// Um objeto que cita outra entrada (o bind group e o buffer dele) fica velho quando a entrada citada é destruída e
// criada de novo com o mesmo conteúdo (T075: o buffer de vértices compartilhado que a remoção das entidades solta e a
// inserção seguinte recria — o bind group guardado citava o buffer destruído).

function fake(tag: string): GPUBuffer {
    return { tag, destroy: () => undefined } as unknown as GPUBuffer;
}

describe('GpuResourceStore — dependências', () => {
    it('o bind group fica velho quando o buffer citado é recriado com o mesmo hash', () => {
        // Arrange
        const store = new GpuResourceStore();
        const bufferOwner = {};
        store.set('buf', bufferOwner, fake('b1'), 'buffer', 16);
        store.set('bg', {}, fake('g1'));
        store.dependOn('bg', ['buf']);
        expect(store.stale('bg')).toBe(false);
        // Act: o buffer perde o último dono e volta com o mesmo conteúdo.
        store.release('buf', bufferOwner);
        store.set('buf', {}, fake('b2'), 'buffer', 16);
        // Assert
        expect(store.stale('bg')).toBe(true);
    });

    it('replace troca o objeto e a materialização; com as dependências de novo, deixa de ser velho', () => {
        // Arrange
        const store = new GpuResourceStore();
        const bufferOwner = {};
        const groupOwner = {};
        store.set('buf', bufferOwner, fake('b1'), 'buffer', 16);
        store.set('bg', groupOwner, fake('g1'));
        store.dependOn('bg', ['buf']);
        store.release('buf', bufferOwner);
        store.set('buf', {}, fake('b2'), 'buffer', 16);
        const fresh = fake('g2') as unknown as GPUBindGroup;
        // Act
        store.replace('bg', fresh);
        store.dependOn('bg', ['buf']);
        // Assert: o objeto novo, os donos mantidos, nada velho.
        expect(store.get('bg')).toBe(fresh);
        expect(store.ownerCount('bg')).toBe(1);
        expect(store.stale('bg')).toBe(false);
    });

    it('com a entrada citada ausente (destruída e não recriada), não é velho: não há o que materializar', () => {
        const store = new GpuResourceStore();
        const bufferOwner = {};
        store.set('buf', bufferOwner, fake('b1'), 'buffer', 16);
        store.set('bg', {}, fake('g1'));
        store.dependOn('bg', ['buf']);
        store.release('buf', bufferOwner);
        expect(store.stale('bg')).toBe(false);
    });

    it('sem dependências registradas, nunca é velho', () => {
        const store = new GpuResourceStore();
        store.set('x', {}, fake('x'), 'buffer', 4);
        expect(store.stale('x')).toBe(false);
        expect(store.stale('ausente')).toBe(false);
    });
});
