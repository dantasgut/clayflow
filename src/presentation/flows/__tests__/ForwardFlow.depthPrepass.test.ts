import { describe, expect, it } from 'vitest';
import { BoxGeometry } from '../../../elements/geometry/BoxGeometry';
import { StandardMaterial } from '../../../elements/material/StandardMaterial';
import { Camera } from '../../../elements/scene/Camera';
import { Transform } from '../../../elements/scene/Transform';
import { registerStages, renderScene } from './helpers/renderHarness';

// Passe de profundidade dos opacos (spec 033): no mesmo passe de render, cada grupo de triângulos primeiro só com o
// vértice (fragmento vazio, grava a profundidade) e depois com a cor, que compara `less-equal` — um fragmento sombreado
// por pixel. Sprites e arame ficam fora (o fragmento deles descarta: a profundidade sem ele gravaria os buracos).

describe('ForwardFlow — passe de profundidade (spec 033)', () => {
    it('cada grupo de triângulos: primeiro o de profundidade (fragmento vazio), depois o de cor', async () => {
        const s = await renderScene();
        registerStages(s.scene, { forward: 'scene', depthPrepass: true });
        const world = s.scene.world;
        world.insert(new Camera().add(new Transform({ position: [0, 0, 5, 1] })));
        world.insert(new BoxGeometry().add(new StandardMaterial()).add(new Transform()));
        world.insert(
            new BoxGeometry()
                .add(new StandardMaterial())
                .add(new Transform({ position: [2, 0, 0, 1] })),
        );
        s.step();
        s.step();
        const draws = s.draws('ForwardFlow');
        const depth = draws.filter((d) => d.pipeline.fragment?.entryPoint === 'fs_depth');
        const color = draws.filter((d) => d.pipeline.fragment?.entryPoint !== 'fs_depth');
        // As duas caixas num grupo: um desenho de profundidade e um de cor.
        expect(depth).toHaveLength(1);
        expect(depth[0]!.instanceCount).toBe(2);
        expect(color.map((d) => d.instanceCount)).toEqual([2]);
        expect(draws.indexOf(depth[0]!)).toBeLessThan(
            draws.findIndex((d) => d.pipeline.fragment?.entryPoint !== 'fs_depth'),
        );
        expect(depth[0]!.pipeline.depthStencil).toMatchObject({
            depthWriteEnabled: true,
            depthCompare: 'less',
        });
        const boxColor = color.find((d) => d.instanceCount === 2)!;
        expect(boxColor.pipeline.depthStencil).toMatchObject({ depthCompare: 'less-equal' });
    });

    it('desligado: só o de cor, com o teste comum', async () => {
        const s = await renderScene();
        registerStages(s.scene, { forward: 'scene' });
        const world = s.scene.world;
        world.insert(new Camera().add(new Transform({ position: [0, 0, 5, 1] })));
        world.insert(new BoxGeometry().add(new StandardMaterial()).add(new Transform()));
        s.step();
        s.step();
        const draws = s.draws('ForwardFlow');
        expect(draws).toHaveLength(1);
        expect(draws[0]!.pipeline.depthStencil).toMatchObject({ depthCompare: 'less' });
    });
});
