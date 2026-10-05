import { BoxGeometry, SphereGeometry, StandardMaterial, Transform } from 'clayflow';
import type { SceneImplementation } from '../../core/types';
import type { ClayflowHandle } from '../../engines/clayflow';
import { uniqueObjects } from './scene';

/** Cada objeto com sua própria geometria e seu próprio `StandardMaterial`. */
const impl: SceneImplementation<ClayflowHandle> = {
    limitations: ['render LDR 8 bits, sem MSAA (até F4)'],
    setup({ engine, variant, rng }) {
        for (const o of uniqueObjects(rng, Number(variant.params.count))) {
            const geometry =
                o.shape.kind === 'box'
                    ? new BoxGeometry({ size: [...o.shape.size] })
                    : new SphereGeometry({
                          radius: o.shape.radius,
                          latSegments: o.shape.latSegments,
                          lonSegments: o.shape.lonSegments,
                      });
            const p = o.placement;
            engine.app.world.insert(
                geometry
                    .add(new StandardMaterial({ albedo: [...p.color, 1], roughness: o.roughness }))
                    .add(
                        new Transform({ position: [...p.position, 1], rotation: [...p.rotation] }),
                    ),
            );
        }
    },
};

export default impl;
