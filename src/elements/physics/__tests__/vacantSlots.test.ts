/**
 * Slots liberados nos solvers de partícula (spec 008, A3/R2): antes, um corpo removido deixava os slots com bytes
 * velhos ainda simulados e na busca de vizinhança (o despacho cobre `[0, count)`). Agora a faixa liberada tem o bit de
 * vivo zerado no mesmo envio e os kernels do SPH e a busca de vizinhança recebem o bitset; faixas são reaproveitadas
 * sem mover os corpos vivos.
 */
import { describe, expect, it } from 'vitest';
import { SPHFlow } from '../flows/SPHFlow';
import { FluidBody } from '../bodies/FluidBody';
import { ParticleMaterial } from '../materials/ParticleMaterial';
import { solverScene } from './helpers/solverScene';

/** Bloco de `n` partículas em linha (x, 0, 0). */
const line = (n: number, x0 = 0): number[] =>
    Array.from({ length: n }, (_, i) => [x0 + i * 0.05, 0, 0]).flat();

async function setup() {
    const s = await solverScene();
    s.scene.flows.register((ctx) => new SPHFlow(ctx, { substeps: 1 }), {
        type: 'SPHFlow',
        phase: 'physics',
        bodyType: 'SPHSchema',
    });
    s.scene.world.insert(new ParticleMaterial({ speedOfSound: 0.1, youngModulus: 1 }));
    return s;
}

/** Bits de vivo escritos por último no bitset do pool `SPHSchema`. */
function liveSlots(s: Awaited<ReturnType<typeof setup>>): number[] {
    const spec = s.scene.resourceSystem.poolLiveBuffer('SPHSchema')!;
    const words = new Uint32Array(64);
    for (const w of s.writes) {
        if (w.spec !== spec) continue;
        words.set(
            new Uint32Array(w.bytes.buffer, w.bytes.byteOffset, w.bytes.byteLength / 4),
            w.offset / 4,
        );
    }
    const out: number[] = [];
    for (let slot = 0; slot < words.length * 32; slot++)
        if (((words[slot >>> 5]! >>> (slot & 31)) & 1) === 1) out.push(slot);
    return out;
}

describe('slots liberados nos solvers de partícula (spec 008)', () => {
    it('o corpo removido sai do bitset de vivos que o SPH e a vizinhança leem', async () => {
        const s = await setup();
        const a = new FluidBody({ algorithm: 'SPH', position: line(3) });
        const b = new FluidBody({ algorithm: 'SPH', position: line(4, 1) });
        const c = new FluidBody({ algorithm: 'SPH', position: line(2, 2) });
        for (const body of [a, b, c]) s.scene.world.insert(body);
        s.step(1 / 60);
        expect(liveSlots(s)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
        s.scene.world.remove(b);
        s.step(1 / 60);
        // O despacho ainda cobre [0, count): o bit zerado é o que tira a faixa da simulação.
        expect(s.scene.resourceSystem.poolCount('SPHSchema')).toBe(9);
        expect(liveSlots(s)).toEqual([0, 1, 2, 7, 8]);
    });

    it('inserir e remover corpos de tamanhos diferentes reaproveita faixas sem mover os vivos', async () => {
        const s = await setup();
        const keep = new FluidBody({ algorithm: 'SPH', position: line(5) });
        const keepId = s.scene.world.insert(keep);
        s.step(1 / 60);
        let peak = 0;
        for (let round = 0; round < 100; round++) {
            const n = 1 + (round % 7);
            const temp = new FluidBody({ algorithm: 'SPH', position: line(n, 3) });
            s.scene.world.insert(temp);
            peak = Math.max(peak, s.scene.resourceSystem.poolCount('SPHSchema'));
            s.scene.world.remove(temp);
        }
        expect(s.scene.resourceSystem.poolRangeOf('SPHSchema', keepId)).toEqual({
            first: 0,
            count: 5,
        });
        expect(peak).toBe(5 + 7);
    });
});
