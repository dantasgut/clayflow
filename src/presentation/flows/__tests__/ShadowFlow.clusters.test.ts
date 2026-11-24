import { describe, expect, it, vi } from 'vitest';
import { SphereGeometry } from '../../../elements/geometry/SphereGeometry';
import { DirectionalLight } from '../../../elements/scene/DirectionalLight';
import { Transform } from '../../../elements/scene/Transform';
import { ShadowPagesParamsSchema } from '../renderSchemas';
import { discOf, registerStages, renderScene } from './helpers/renderHarness';

type Scene = Awaited<ReturnType<typeof renderScene>>;

/**
 * Um quadro, e o que o estágio de sombra escreveu nele: a lista dos aglomerados do primeiro grupo (a palavra 2 dele;
 * `undefined` se os grupos não foram escritos) e o recomeço dos parâmetros (`undefined` se não foram escritos).
 */
function frame(s: Scene): { list: number | undefined; reset: number | undefined } {
    vi.mocked(s.core.write).mockClear();
    s.step();
    let list: number | undefined;
    let reset: number | undefined;
    for (const [spec, data] of vi.mocked(s.core.write).mock.calls) {
        if (discOf(spec).startsWith('shadow_pages_groups'))
            list = new Uint32Array(data.buffer, data.byteOffset, data.byteLength / 4)[2];
        if (discOf(spec).startsWith('shadow_pages_params'))
            reset = Number(ShadowPagesParamsSchema.unpack(data).reset);
    }
    return { list, reset };
}

describe('ShadowFlow — as caixas dos aglomerados e o recomeço (spec 013)', () => {
    it('o grupo que passa a ir em aglomerados recomeça o cache: as caixas carimbadas de antes não valem para ele', async () => {
        // Arrange: uma malha grande (índices de 32 bits: vai em aglomerados) sob uma luz com sombra.
        const s = await renderScene();
        registerStages(s.scene, { shadow: true });
        s.scene.world.insert(new DirectionalLight({ direction: [0, -1, 0, 0], castShadow: true }));
        s.scene.world.insert(
            new SphereGeometry({ latSegments: 256, lonSegments: 512 }).add(new Transform()),
        );
        // Act: o primeiro quadro desenha a malha inteira por página (o pipeline dos aglomerados e o kernel das caixas
        // ainda por ficar prontos) e consome o recomeço da entrada.
        const first = frame(s);
        // O quadro em que o grupo passa a ir em aglomerados (a lista dele deixa de ser 0): o conteúdo dos grupos é o
        // mesmo, mas o trecho dele nas caixas é novo.
        const second = frame(s);
        const third = frame(s);
        // Assert
        expect(first).toEqual({ list: 0, reset: 1 });
        expect(second.list).not.toBe(0);
        expect(second.reset).toBe(1);
        // Atendido o recomeço, o estágio segue.
        expect(third.reset).toBe(0);
        expect(frame(s)).toEqual({ list: undefined, reset: undefined });
    });

    it('os grupos mudados recomeçam o cache uma vez: o quadro desenhado com o recomeço o atende', async () => {
        // Arrange: a luz com sombra e uma malha.
        const s = await renderScene();
        registerStages(s.scene, { shadow: true });
        s.scene.world.insert(new DirectionalLight({ direction: [0, -1, 0, 0], castShadow: true }));
        const ball = new SphereGeometry().add(new Transform());
        s.scene.world.insert(ball);
        expect(frame(s).reset).toBe(1);
        expect(frame(s).reset).toBe(0);
        // Act: outra geometria entra (os grupos mudam: recomeço) e o quadro é desenhado com ele; depois, segue.
        s.scene.world.insert(
            new SphereGeometry({ radius: 0.5 }).add(new Transform({ position: [2, 0, 0, 1] })),
        );
        expect(frame(s).reset).toBe(1);
        expect(frame(s).reset).toBe(0);
    });
});
