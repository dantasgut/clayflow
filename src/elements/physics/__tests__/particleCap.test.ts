/**
 * Teto de partículas da busca de vizinhança (spec 008, R10): um pool de SPH ou PBF além de
 * `NEIGHBOR_SEARCH_MAX_PARTICLES` é erro que nomeia o estágio, o pool, a contagem e o teto (antes estourava em silêncio).
 */
import { describe, expect, it } from 'vitest';
import { SPHFlow } from '../flows/SPHFlow';
import { PBFFlow } from '../flows/PBFFlow';
import { FluidBody } from '../bodies/FluidBody';
import { NEIGHBOR_SEARCH_MAX_PARTICLES } from '../../gpu/NeighborSearchPipeline';
import { solverScene } from './helpers/solverScene';

const MAX = NEIGHBOR_SEARCH_MAX_PARTICLES;

async function scene(algorithm: 'SPH' | 'PBF', count: number) {
    const s = await solverScene();
    const options = {
        type: `${algorithm}Flow`,
        phase: 'physics' as const,
        bodyType: `${algorithm}Schema`,
    };
    if (algorithm === 'SPH') s.scene.flows.register((ctx) => new SPHFlow(ctx), options);
    else s.scene.flows.register((ctx) => new PBFFlow(ctx), options);
    s.scene.world.insert(new FluidBody({ algorithm, position: new Float32Array(count * 3) }));
    return s;
}

describe('teto de partículas (spec 008)', () => {
    it.each(['SPH', 'PBF'] as const)(
        '%s: pool além do teto é erro com o estágio e o teto',
        async (algorithm) => {
            const s = await scene(algorithm, MAX + 1);
            expect(() => s.step(1 / 60)).toThrow(
                new RegExp(
                    `${algorithm}Flow: o pool '${algorithm}Schema' chegou a ${MAX + 1} partículas.*teto.*${MAX}`,
                ),
            );
        },
    );

    it('no teto, simula', async () => {
        const s = await scene('SPH', MAX);
        expect(() => s.step(1 / 60)).not.toThrow();
    });
});
