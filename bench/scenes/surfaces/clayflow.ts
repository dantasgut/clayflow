import {
    DirectionalLight,
    ParametricSurface,
    StandardMaterial,
    SurfaceFunction,
    Transform,
} from 'clayflow/web';
import type { SceneImplementation } from '../../core/types';
import type { ClayflowHandle } from '../../engines/clayflow';
import { SURFACE_HALF, SURFACE_SEGMENTS } from './scene';

/** A onda de `waveHeight` em WGSL (u = z, v = x: normal para cima). */
const WAVE_CODE = /* wgsl */ `
fn surface_fn(u: f32, v: f32, time: f32, data: SurfaceFnParams) -> vec3f {
    return vec3f(v, data.amp * sin(2.0 * v + time) * cos(2.0 * u + 0.7 * time), u);
}`;

/**
 * Uma `ParametricSurface` animada avaliada na GPU a cada quadro: a grade uniforme de 257² ou a malha adaptativa de
 * 16 × 16 retalhos até o nível 4 (a mesma precisão máxima), refeita por quadro e desenhada pela contagem da GPU.
 */
const impl: SceneImplementation<ClayflowHandle> = {
    limitations: [
        'render LDR 8 bits (HDR na F4); MSAA desligado na comparação (o Three roda sem antialias)',
    ],
    setup({ engine, variant }) {
        const world = engine.app.world;
        world.insert(new DirectionalLight({ direction: [-0.3, -1, -0.4, 0], intensity: 1.1 }));
        const h = SURFACE_HALF;
        const surface = new ParametricSurface({
            domain: [-h, h, -h, h],
            animated: true,
            ...(variant.params.adaptive === true
                ? { adaptive: { patches: [16, 16] as const, maxLevel: 4 } }
                : { resolution: [SURFACE_SEGMENTS + 1, SURFACE_SEGMENTS + 1] as const }),
        });
        world.insert(
            surface
                .add(
                    new SurfaceFunction({
                        code: WAVE_CODE,
                        params: { amp: 'f32' },
                        values: { amp: 0.25 },
                    }),
                )
                .add(new StandardMaterial({ albedo: [0.35, 0.55, 0.8, 1] }))
                .add(new Transform()),
        );
    },
};

export default impl;
