import { BoxGeometry, StandardMaterial, Transform } from 'clayflow';
import { gridScatter, motionAt, type Placement } from '../../core/rng';
import type { SceneImplementation } from '../../core/types';
import type { ClayflowHandle } from '../../engines/clayflow';
import { countOf, INSTANCES_EXTENT, isMoving } from './scene';

let placements: Placement[] = [];
let transforms: Transform[] = [];
let moving = false;
let t = 0;

/**
 * N entidades Box + StandardMaterial + Transform (só `position`/`rotation`/`scale`; a matriz de
 * mundo é do `TransformFlow`, spec 003). Cada entidade tem as suas instâncias (reuso de instância
 * entre entidades não é suportado); a C2 deduplica a geometria por conteúdo e o forward desenha um
 * grupo de instâncias por (geometria, pipeline) — spec 007. Em movimento, `update` muta
 * `transform.data`: os slots sujos vão em faixas contíguas no início do quadro.
 */
const impl: SceneImplementation<ClayflowHandle> = {
    limitations: ['render LDR 8 bits, sem MSAA (até F4)'],
    setup({ engine, variant, rng }) {
        moving = isMoving(variant.params);
        placements = gridScatter(rng, countOf(variant.params), INSTANCES_EXTENT);
        transforms = placements.map((p) => {
            const transform = new Transform({
                position: [...p.position, 1],
                rotation: [...p.rotation],
                scale: [p.scale, p.scale, p.scale, 1],
            });
            engine.app.world.insert(
                new BoxGeometry({ size: [1, 1, 1] })
                    .add(new StandardMaterial({ albedo: [...p.color, 1] }))
                    .add(transform),
            );
            return transform;
        });
    },
    update(dt) {
        if (!moving) return;
        t += dt;
        for (let i = 0; i < transforms.length; i++) {
            const m = motionAt(placements[i] as Placement, i, t);
            const data = (transforms[i] as Transform).data;
            data.position = [...m.position, 1];
            data.rotation = [...m.rotation];
        }
    },
};

export default impl;
