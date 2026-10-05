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
 * `RigidBody` pela fachada de domínio (spec 001). A pose chega à tela pelo `Transform`:
 * readback → `position`/`rotation` → `TransformFlow` (spec 003).
 */
const impl: SceneImplementation<ClayflowHandle> = {
    limitations: [
        'readback de todos os corpos para a CPU por quadro, pose publicada fora do quadro e com 1 quadro de atraso (até F2)',
        'solver LCP em uma thread e narrowphase O(N·M) (até F5)',
        'sem instancing no render (até F2)',
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
