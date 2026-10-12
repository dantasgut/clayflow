import { describe, expect, it, vi } from 'vitest';
import {
    GraphColorer,
    colorSortBits,
    defaultMaxColors,
    nextColoringAction,
    readColorRanges,
    readGraphColorStatus,
    verifyEdgeColoring,
    type GraphColorStatus,
} from '../compute/GraphColorer';
import { ColorRangeSchema, GraphColorStatusSchema } from '../compute/schemas';
import { fakeResourceCore } from '../../../scene/__tests__/helpers/fakeResourceCore';
import { recordingFrame } from '../../physics/__tests__/helpers/recordingFrame';
import type { StorageBufferSpec } from '../../../core/contracts/index';

const status = (fields: Partial<Record<string, number>>): ArrayBuffer => {
    const bytes = new ArrayBuffer(GraphColorStatusSchema.stride);
    const u32 = new Uint32Array(bytes);
    for (const [k, v] of Object.entries(fields)) u32[GraphColorStatusSchema.offsetOf(k) / 4] = v!;
    return bytes;
};

const ranges = (list: readonly [number, number][]): ArrayBuffer => {
    const u32 = new Uint32Array((list.length * ColorRangeSchema.stride) / 4);
    list.forEach(([offset, count], c) => {
        u32[(c * ColorRangeSchema.stride + ColorRangeSchema.offsetOf('offset')) / 4] = offset;
        u32[(c * ColorRangeSchema.stride + ColorRangeSchema.offsetOf('count')) / 4] = count;
    });
    return u32.buffer;
};

const edges: StorageBufferSpec = {
    kind: 'buffer',
    subkind: 'storage',
    discriminator: 'edges',
    byteSize: 1 << 16,
};

/** Core falso com envios gravados (rótulo → passes) e leituras roteirizadas. */
function scriptedCore(readbacks: ArrayBuffer[]) {
    const { core } = fakeResourceCore();
    const submits: { label: string; passes: string[] }[] = [];
    const scripted = core as unknown as Record<string, unknown>;
    scripted.record = vi.fn((label: string, body: (frame: unknown) => void) => {
        const rec = recordingFrame();
        body(rec.frame);
        submits.push({ label, passes: rec.passes.map((p) => p.label) });
    });
    scripted.readback = vi.fn(async () => {
        const next = readbacks.shift();
        if (next === undefined) throw new Error('leitura não roteirizada');
        return next;
    });
    return { core, submits };
}

describe('GraphColorer — funções puras', () => {
    it('verifyEdgeColoring aceita coloração válida e aponta o conflito', () => {
        // Caminho 0-1-2-3: arestas (0,1), (1,2), (2,3).
        const path = new Uint32Array([0, 1, 1, 2, 2, 3]);
        expect(verifyEdgeColoring(path, new Uint32Array([0, 1, 0]))).toEqual({
            valid: true,
            colorCount: 2,
        });
        expect(verifyEdgeColoring(path, new Uint32Array([0, 0, 1]))).toEqual({
            valid: false,
            colorCount: 2,
            conflict: [0, 1],
        });
    });

    it('arestas repetidas precisam de cores distintas', () => {
        const twice = new Uint32Array([4, 5, 4, 5]);
        expect(verifyEdgeColoring(twice, new Uint32Array([0, 0])).valid).toBe(false);
        expect(verifyEdgeColoring(twice, new Uint32Array([0, 1])).valid).toBe(true);
    });

    it('maxColors padrão 2Δ (mínimo 1)', () => {
        expect(defaultMaxColors(4)).toBe(8);
        expect(defaultMaxColors(0)).toBe(1);
    });

    it.each([
        [1, 4],
        [16, 4],
        [17, 8],
        [256, 8],
        [257, 12],
    ])('%i cores → ordenação com %i bits', (colors, bits) => {
        expect(colorSortBits(colors)).toBe(bits);
    });

    it('próximo passo: pronto sem arestas sem cor; erro ao passar de maxColors', () => {
        const s = (uncolored: number, color: number) =>
            ({ uncolored, color }) as unknown as GraphColorStatus;
        expect(nextColoringAction(s(0, 9), 8)).toBe('done');
        expect(nextColoringAction(s(3, 2), 8)).toBe('continue');
        expect(nextColoringAction(s(3, 8), 8)).toBe('too-many-colors');
    });

    it('decodifica estado e intervalos pelos schemas', () => {
        expect(
            readGraphColorStatus(status({ color: 3, color_count: 4, max_degree: 6 })),
        ).toMatchObject({
            color: 3,
            colorCount: 4,
            maxDegree: 6,
            loops: 0,
        });
        expect(
            readColorRanges(
                ranges([
                    [0, 5],
                    [5, 2],
                ]),
                2,
            ),
        ).toEqual([
            { offset: 0, count: 5 },
            { offset: 5, count: 2 },
        ]);
    });
});

describe('GraphColorer — orquestração', () => {
    it('valida, roda lotes de subpassos até não restar aresta sem cor e agrupa por cor', async () => {
        const { core, submits } = scriptedCore([
            status({ max_degree: 2 }),
            status({ uncolored: 3, color: 1 }),
            status({ uncolored: 0, color: 3, color_count: 3 }),
            ranges([
                [0, 2],
                [2, 1],
                [3, 1],
            ]),
        ]);
        const colorer = new GraphColorer(core, { discriminator: 'gc', capacity: 100 });
        const result = await colorer.color(edges, 4, 4);
        expect(submits.map((s) => s.label)).toEqual([
            'GraphColorer.init',
            'GraphColorer.status',
            'GraphColorer.rounds',
            'GraphColorer.status',
            'GraphColorer.rounds',
            'GraphColorer.status',
            'GraphColorer.group',
        ]);
        expect(submits[0]!.passes).toEqual(['GraphColorer.init', 'Reduce']);
        const rounds = submits[2]!.passes;
        expect(rounds).toHaveLength(32 * 3);
        expect(rounds.slice(0, 3)).toEqual([
            'GraphColorer.priority',
            'GraphColorer.assign',
            'GraphColorer.advance',
        ]);
        const group = submits[6]!.passes;
        expect(group[0]).toBe('GraphColorer.sort_init');
        expect(group).toContain('RadixSort.scatter');
        expect(group.slice(-1)).toEqual(['GraphColorer.ranges']);
        expect(result.colorCount).toBe(3);
        expect(result.rangesCpu).toEqual([
            { offset: 0, count: 2 },
            { offset: 2, count: 1 },
            { offset: 3, count: 1 },
        ]);
    });

    it('laço rejeitado na validação', async () => {
        const { core } = scriptedCore([status({ loops: 1, max_degree: 2 })]);
        const colorer = new GraphColorer(core, { discriminator: 'gc', capacity: 10 });
        await expect(colorer.color(edges, 3, 3)).rejects.toThrow(/laço/);
    });

    it('índice de vértice inválido rejeitado', async () => {
        const { core } = scriptedCore([status({ invalid: 2 })]);
        const colorer = new GraphColorer(core, { discriminator: 'gc', capacity: 10 });
        await expect(colorer.color(edges, 3, 3)).rejects.toThrow(RangeError);
    });

    it('passar de maxColors (padrão 2Δ) é erro', async () => {
        const { core } = scriptedCore([
            status({ max_degree: 1 }),
            status({ uncolored: 1, color: 2 }),
        ]);
        const colorer = new GraphColorer(core, { discriminator: 'gc', capacity: 10 });
        await expect(colorer.color(edges, 3, 3)).rejects.toThrow(/maxColors = 2/);
    });

    it('nenhuma aresta: resultado vazio sem envio', async () => {
        const { core, submits } = scriptedCore([]);
        const colorer = new GraphColorer(core, { discriminator: 'gc', capacity: 10 });
        const result = await colorer.color(edges, 0, 5);
        expect(result.colorCount).toBe(0);
        expect(result.rangesCpu).toEqual([]);
        expect(submits).toEqual([]);
    });

    it('uma coloração por vez; validação de count e vertexCount', async () => {
        const { core } = scriptedCore([status({ max_degree: 1 }), status({}), ranges([])]);
        const colorer = new GraphColorer(core, { discriminator: 'gc', capacity: 10 });
        await expect(colorer.color(edges, 11, 3)).rejects.toThrow(RangeError);
        await expect(colorer.color(edges, 1, -1)).rejects.toThrow(RangeError);
        const first = colorer.color(edges, 1, 2);
        await expect(colorer.color(edges, 1, 2)).rejects.toThrow(/andamento/);
        await first;
    });
});
