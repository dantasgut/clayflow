import {
    BoxGeometry,
    DirectionalLight,
    GlobalIllumination,
    ParametricSurface,
    Sky,
    StandardMaterial,
    SurfaceFunction,
    Transform,
} from 'clayflow/web';
import type { SceneImplementation } from '../../core/types';
import type { ClayflowHandle } from '../../engines/clayflow';
import { GI_SURFACE_HALF, GI_SURFACE_SEGMENTS } from './scene';

/** Onda lenta (u = z, v = x: normal para cima). */
const WAVE_CODE = /* wgsl */ `
fn surface_fn(u: f32, v: f32, time: f32, data: SurfaceFnParams) -> vec3f {
    return vec3f(v, data.amp * sin(1.2 * v + time) * cos(1.2 * u + 0.7 * time), u);
}`;

/**
 * A onda de 1 milhão de triângulos avaliada na GPU a cada quadro, oito caixas coloridas, o sol a 40° e o céu físico;
 * `medium` insere a `GlobalIllumination` na qualidade média (as cascatas acompanham a câmera).
 */
const impl: SceneImplementation<ClayflowHandle> = {
    limitations: ['sem equivalente no Three.js (iluminação global em tempo real)'],
    setup({ engine, variant, rng }) {
        const world = engine.app.world;
        const e = (40 * Math.PI) / 180;
        const sun = new DirectionalLight({
            direction: [-Math.cos(e) * 0.6, -Math.sin(e), -Math.cos(e) * 0.8, 0],
            intensity: 100000,
            castShadow: true,
        });
        world.insert(sun);
        world.insert(new Sky({ sun }));
        engine.app.defaults.renderer.output.data.exposure = -11;
        const h = GI_SURFACE_HALF;
        world.insert(
            new ParametricSurface({
                domain: [-h, h, -h, h],
                animated: true,
                resolution: [GI_SURFACE_SEGMENTS, GI_SURFACE_SEGMENTS],
            })
                .add(
                    new SurfaceFunction({
                        code: WAVE_CODE,
                        params: { amp: 'f32' },
                        values: { amp: 0.15 },
                    }),
                )
                .add(new StandardMaterial({ albedo: [0.6, 0.6, 0.58, 1], roughness: 0.9 }))
                .add(new Transform()),
        );
        for (let k = 0; k < 8; k++) {
            const a = (k / 8) * Math.PI * 2;
            const color = [0.2 + 0.7 * rng(), 0.2 + 0.7 * rng(), 0.2 + 0.7 * rng(), 1];
            world.insert(
                new BoxGeometry({ size: [0.6, 0.6 + rng(), 0.6] })
                    .add(new StandardMaterial({ albedo: color, roughness: 0.8 }))
                    .add(
                        new Transform({ position: [2.2 * Math.cos(a), 0.6, 2.2 * Math.sin(a), 1] }),
                    ),
            );
        }
        if (variant.params.gi === true) world.insert(new GlobalIllumination({ quality: 'medium' }));
    },
};

export default impl;
