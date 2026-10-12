import { describe, expect, it } from 'vitest';
import { BoxGeometry } from '../../../elements/geometry/BoxGeometry';
import { StandardMaterial } from '../../../elements/material/StandardMaterial';
import { Camera } from '../../../elements/scene/Camera';
import { DirectionalLight } from '../../../elements/scene/DirectionalLight';
import { Transform } from '../../../elements/scene/Transform';
import { registerStages, renderScene } from './helpers/renderHarness';

function entity() {
    return new BoxGeometry()
        .add(new StandardMaterial({ albedo: [1, 1, 1, 1] }))
        .add(new Transform());
}

describe('liberação de GPU na remoção de entidade (R14)', () => {
    it('os estágios não têm objeto por entidade: a C2 libera VBO e IBO da geometria removida, e só ela', async () => {
        const s = await renderScene();
        registerStages(s.scene, { shadow: true, forward: 'canvas' });
        s.scene.world.insert(new Camera());
        s.scene.world.insert(new DirectionalLight({ castShadow: true }));
        const a = entity();
        const b = entity();
        s.scene.world.insert(a);
        s.scene.world.insert(b);
        s.step();
        const buffersOf = (g: BoxGeometry) => [
            s.scene.resourceSystem.bufferOf(g, 'vertices')!,
            s.scene.resourceSystem.bufferOf(g, 'indices')!,
        ];
        const [aVbo, aIbo] = buffersOf(a);
        const [bVbo, bIbo] = buffersOf(b);
        s.resetCounts();
        s.scene.world.remove(a);
        s.step();
        expect(s.destroys()).toEqual(expect.arrayContaining([aVbo, aIbo]));
        expect(s.destroys()).not.toContain(bVbo);
        expect(s.destroys()).not.toContain(bIbo);
        // Nenhum estágio cria nem destrói objeto próprio por causa da remoção.
        expect(s.creates().filter((c) => c.kind !== 'bindgroup')).toHaveLength(0);
        expect(s.draws('ForwardFlow').map((d) => d.vertex)).toEqual([bVbo]);
        expect(s.draws('ShadowFlow').map((d) => d.vertex)).toEqual([bVbo]);
    });

    it('entidade removida antes do primeiro quadro não é desenhada', async () => {
        const s = await renderScene();
        registerStages(s.scene, { forward: 'canvas' });
        s.scene.world.insert(new Camera());
        const box = entity();
        s.scene.world.insert(box);
        s.scene.world.remove(box);
        s.step();
        expect(s.draws('ForwardFlow')).toHaveLength(0);
    });
});
