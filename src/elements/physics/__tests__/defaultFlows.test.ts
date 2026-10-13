import { describe, expect, it } from 'vitest';
import { DEFAULT_SOLVER_REGISTRATIONS } from '../flows/defaultFlows';
import { XPBDFlow } from '../flows/XPBDFlow';
import { SoftBody } from '../bodies/SoftBody';
import { DistanceConstraint } from '../constraints/DistanceConstraint';
import { countPasses } from './helpers/recordingFrame';
import { solverScene } from './helpers/solverScene';

describe('DEFAULT_SOLVER_REGISTRATIONS — XPBD', () => {
    it('o XPBD padrão é instanciado pela C2 no primeiro corpo e resolve as restrições de distância', async () => {
        const { scene, step } = await solverScene();
        const regs = DEFAULT_SOLVER_REGISTRATIONS.map((r) =>
            scene.flows.register(r.factory, r.options),
        );
        const a = new SoftBody({ algorithm: 'XPBD', position: [0, 1, 0], mass: 0 });
        const b = new SoftBody({ algorithm: 'XPBD', position: [0.1, 1, 0], mass: 1 });
        scene.world.insert(a);
        scene.world.insert(b);
        scene.world.insert(
            new DistanceConstraint({
                a: { body: a, index: 0 },
                b: { body: b, index: 0 },
                restLength: 0.1,
            }),
        );
        const xpbd = regs.find((r) => r.options.type === 'XPBDFlow')!;
        expect(xpbd.flow).toBeInstanceOf(XPBDFlow);
        expect(countPasses(step(), 'XPBDFlow.distance_solve')).toBeGreaterThan(0);
    });
});
