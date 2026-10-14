/**
 * Arestas de arame da geometria (spec 008): em espaço de objeto, de feição nas geometrias estáticas (sem as diagonais
 * de faces planas; vértices unidos por posição) e topológicas nas que deformam.
 */
import { describe, expect, it } from 'vitest';
import { BoxGeometry } from '../BoxGeometry';
import { PlaneGeometry } from '../PlaneGeometry';
import { SphereGeometry } from '../SphereGeometry';
import { SurfaceGeometry } from '../SurfaceGeometry';

const edgeCount = (edges: Uint32Array | undefined): number => (edges?.length ?? 0) / 2;

describe('arestas de arame (spec 008)', () => {
    it('caixa: as 12 arestas; plano: as 4 da borda', () => {
        expect(edgeCount(new BoxGeometry().data.wireEdges)).toBe(12);
        expect(edgeCount(new PlaneGeometry().data.wireEdges)).toBe(4);
    });

    it('esfera: sem as diagonais dos quadriláteros (planos) entre paralelos e meridianos', () => {
        const sphere = new SphereGeometry({ radius: 1, segments: 8 });
        const all = sphere.data.indices!.length; // 3 por triângulo
        expect(edgeCount(sphere.data.wireEdges)).toBeLessThan(all / 2);
        expect(edgeCount(sphere.data.wireEdges)).toBeGreaterThan(0);
    });

    it('descritor wireEdges como índices uint32, compartilhado por conteúdo', () => {
        const desc = new BoxGeometry().getDescriptors().find((d) => d.id === 'wireEdges');
        expect(desc).toMatchObject({ role: 'index', indexFormat: 'uint32', count: 24 });
        expect(new BoxGeometry().data.wireEdges).toBe(new BoxGeometry().data.wireEdges);
    });

    it('superfície que deforma: todas as arestas dos triângulos, uma vez', () => {
        const surface = new SurfaceGeometry(
            [0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 0, 1],
            [0, 2, 1, 1, 2, 3],
        );
        expect(edgeCount(surface.data.wireEdges)).toBe(5);
    });
});
