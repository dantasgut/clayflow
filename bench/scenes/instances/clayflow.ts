import { BoxGeometry, StandardMaterial, Transform, TransformFunction } from 'clayflow';
import { gridScatter, motionAt, type Placement } from '../../core/rng';
import type { SceneImplementation } from '../../core/types';
import type { ClayflowHandle } from '../../engines/clayflow';
import { countOf, functionsOf, INSTANCES_EXTENT, isMoving } from './scene';

/** Código da função `k`: o TRS com o deslocamento vertical de `bobOf` (o índice da entidade no parâmetro `i`). */
function bobCode(k: number): string {
    return `fn transform_fn(slot: u32, t: Transform, data: TransformFnParams, time: f32) -> mat4x4f {
    var m = transform_local(t).world;
    m[3].y += 0.5 * sin(time * ${(1 + 0.1 * k).toFixed(1)} + 0.01 * data.i);
    return m;
}`;
}

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
    limitations: [
        'render LDR 8 bits (HDR na F4); MSAA desligado na comparação (o Three roda sem antialias)',
    ],
    setup({ engine, variant, rng }) {
        moving = isMoving(variant.params);
        const functions = functionsOf(variant.params);
        const codes = Array.from({ length: functions }, (_, k) => bobCode(k));
        placements = gridScatter(rng, countOf(variant.params), INSTANCES_EXTENT);
        transforms = placements.map((p, i) => {
            const transform = new Transform({
                position: [...p.position, 1],
                rotation: [...p.rotation],
                scale: [p.scale, p.scale, p.scale, 1],
            });
            const box = new BoxGeometry({ size: [1, 1, 1] })
                .add(new StandardMaterial({ albedo: [...p.color, 1] }))
                .add(transform);
            // Funções na GPU (spec 009): uma instância por entidade, 10 códigos — um despacho por código.
            if (functions > 0)
                box.add(
                    new TransformFunction({
                        code: codes[i % functions] ?? '',
                        params: { i: 'f32' },
                        values: { i },
                    }),
                );
            engine.app.world.insert(box);
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
