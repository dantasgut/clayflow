import {
    BoxGeometry,
    GravityField,
    RigidBody,
    SphereGeometry,
    StandardMaterial,
    Transform,
} from 'clayflow';
import type { SceneImplementation } from '../../core/types';
import type { ClayflowHandle } from '../../engines/clayflow';
import { BALL_RADIUS, ballPositions, GROUND_HALF } from './scene';

/**
 * `RigidBody` pela fachada de domínio (spec 001). A pose é publicada na GPU direto no `Transform` do corpo e composta
 * pelo `TransformFlow` no mesmo quadro, sem leitura de volta para a CPU; broadphase em grade hash e um draw por grupo
 * de instâncias (spec 007).
 */
const impl: SceneImplementation<ClayflowHandle> = {
    limitations: [
        'render LDR 8 bits (HDR na F4); MSAA desligado na comparação (o Three roda sem antialias)',
    ],
    setup({ engine, variant, rng }) {
        const world = engine.app.world;
        world.insert(new GravityField({ acceleration: [0, -9.81, 0, 0] }));
        const ground = new RigidBody({
            shape: 'box',
            mass: 0,
            halfExtents: [GROUND_HALF, 0.5, GROUND_HALF],
            position: [0, -0.5, 0],
        });
        ground.add(new BoxGeometry({ size: [GROUND_HALF * 2, 1, GROUND_HALF * 2] }));
        ground.add(new StandardMaterial({ albedo: [0.4, 0.4, 0.45, 1] }));
        world.insert(ground);
        for (const position of ballPositions(rng, Number(variant.params.count))) {
            const ball = new RigidBody({ shape: 'sphere', radius: BALL_RADIUS, mass: 1, position });
            const t = ball.attached.find((p): p is Transform => p instanceof Transform);
            if (t !== undefined) t.data.scale = [BALL_RADIUS, BALL_RADIUS, BALL_RADIUS, 1];
            ball.add(new SphereGeometry({ radius: 1 }));
            ball.add(new StandardMaterial({ albedo: [0.9, 0.5, 0.1, 1] }));
            world.insert(ball);
        }
    },
};

export default impl;
