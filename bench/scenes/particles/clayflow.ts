import {
    FluidBody,
    GravityField,
    ParticleMaterial,
    PointSpriteMaterial,
    RigidBody,
} from 'clayflow';
import type { SceneImplementation } from '../../core/types';
import type { ClayflowHandle } from '../../engines/clayflow';
import { blockOf, blockPositions, TANK_HALF } from './scene';

/**
 * Um `FluidBody` SPH (um corpo, N partículas numa faixa do pool) num tanque de paredes estáticas, desenhado pelo
 * `ParticleFlow` em sprites que leem a posição direto do pool — sem leitura de volta nem cópia por quadro (spec 008).
 */
const impl: SceneImplementation<ClayflowHandle> = {
    limitations: [
        'render LDR 8 bits (HDR na F4); MSAA desligado na comparação (o Three roda sem antialias)',
    ],
    setup({ engine, variant, rng }) {
        const world = engine.app.world;
        const count = Number(variant.params.count);
        const { spacing } = blockOf(count);
        world.insert(new GravityField({ acceleration: [0, -9.81, 0, 0] }));
        world.insert(new ParticleMaterial({ particleSpacing: spacing }));
        const t = 0.1;
        world.insert(
            new RigidBody({
                shape: 'box',
                mass: 0,
                halfExtents: [2, 0.5, 2],
                position: [0, -0.5, 0],
            }),
        );
        for (const [x, z, hx, hz] of [
            [TANK_HALF + t, 0, t, TANK_HALF + 2 * t],
            [-(TANK_HALF + t), 0, t, TANK_HALF + 2 * t],
            [0, TANK_HALF + t, TANK_HALF, t],
            [0, -(TANK_HALF + t), TANK_HALF, t],
        ] as const) {
            world.insert(
                new RigidBody({
                    shape: 'box',
                    mass: 0,
                    halfExtents: [hx, 1, hz],
                    position: [x, 0.8, z],
                }),
            );
        }
        world.insert(
            new FluidBody({ algorithm: 'SPH', position: blockPositions(rng, count) }).add(
                new PointSpriteMaterial({ color: [0.2, 0.5, 1, 1], radius: spacing * 0.5 }),
            ),
        );
    },
};

export default impl;
