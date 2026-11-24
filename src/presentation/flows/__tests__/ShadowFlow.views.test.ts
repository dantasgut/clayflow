import { describe, expect, it, vi } from 'vitest';
import { BoxGeometry } from '../../../elements/geometry/BoxGeometry';
import { DirectionalLight } from '../../../elements/scene/DirectionalLight';
import { ShadowAtlas } from '../../../elements/scene/ShadowAtlas';
import { Transform } from '../../../elements/scene/Transform';
import { ShadowPagesParamsSchema } from '../renderSchemas';
import { discOf, registerStages, renderScene } from './helpers/renderHarness';

type Scene = Awaited<ReturnType<typeof renderScene>>;

/** Os últimos parâmetros das páginas enviados pelo estágio de sombra. */
function lastParams(s: Scene): Record<string, unknown> {
    const [, data] = vi
        .mocked(s.core.write)
        .mock.calls.filter(([spec]) => discOf(spec).startsWith('shadow_pages_params'))
        .at(-1)!;
    return ShadowPagesParamsSchema.unpack(data);
}

/** As palavras dos grupos de desenho enviadas por último. */
function lastGroups(s: Scene): Uint32Array {
    const [, data] = vi
        .mocked(s.core.write)
        .mock.calls.filter(([spec]) => discOf(spec).startsWith('shadow_pages_groups'))
        .at(-1)!;
    return new Uint32Array(data.buffer, data.byteOffset, data.byteLength / 4);
}

function atlasOf(s: Scene): ShadowAtlas {
    const world = s.scene.world;
    return world
        .resourcesOf(world.queryBySchemaName(ShadowAtlas.schema.name)[0]!)
        .find((r): r is ShadowAtlas => r instanceof ShadowAtlas)!;
}

async function scene(lights: number) {
    const s = await renderScene();
    registerStages(s.scene, { shadow: true });
    const added = Array.from({ length: lights }, (_, i) => {
        const light = new DirectionalLight({ direction: [i - 1, -1, 0, 0], castShadow: true });
        return { light, id: s.scene.world.insert(light) };
    });
    s.scene.world.insert(new BoxGeometry().add(new Transform()));
    return { ...s, added };
}

describe('ShadowFlow — as vistas de sombra no atlas único (spec 013)', () => {
    it('duas luzes com sombra: uma vista cada, um passe de páginas e um de desenho para as duas', async () => {
        // Arrange
        const s = await scene(2);
        // Act
        s.step();
        s.step();
        // Assert: cada mapa na sua faixa, pela ordem de entrada.
        const atlas = atlasOf(s);
        expect(atlas.views.slice(0, 3)).toEqual([
            s.added[0]!.light.shadowMap,
            s.added[1]!.light.shadowMap,
            undefined,
        ]);
        expect(atlas.data.live).toBe(2);
        const rs = s.scene.resourceSystem;
        const params = lastParams(s);
        expect(params).toMatchObject({ viewSpan: 2, liveMask: 3, groupCount: 1 });
        // O slot do referencial de cada vista no pool `ShadowMatrix`.
        expect([...(params.views0 as number[])].slice(0, 2)).toEqual([
            rs.poolSlotOf('ShadowMatrix', s.added[0]!.id),
            rs.poolSlotOf('ShadowMatrix', s.added[1]!.id),
        ]);
        // As páginas físicas e a base delas são as do atlas.
        expect(params.physical).toBe(atlas.data.atlasPages ** 2);
        expect(params.pagesBase).toBe(atlas.data.pagesBase);
        // Um passe de compute e um de desenho, quaisquer que sejam as vistas.
        expect(s.computes().filter((c) => c === 'ShadowFlow.pages')).toHaveLength(1);
        expect(s.draws('ShadowFlow')).toHaveLength(1);
    });

    it('o grupo de desenho tem seis palavras: com a malha de sempre, entra em todas as vistas', async () => {
        const s = await scene(2);
        s.step();
        const groups = lastGroups(s);
        // Primeira instância, contagem, lista (0: a malha inteira), registro, as vistas e os bits.
        expect([...groups.slice(0, 6)]).toEqual([0, 1, 0, 0, 0xffff, 0]);
        // A palavra da instância aponta o grupo de desenho.
        const base = Number(lastParams(s).instanceGroupBase);
        expect(groups[base]).toBe(0);
    });

    it('a luz que sai libera a faixa sem mexer na da outra; a que entra depois fica com a faixa livre e recomeça só ela', async () => {
        // Arrange
        const s = await scene(2);
        s.step();
        s.step();
        expect(lastParams(s).resetMask).toBe(0);
        const second = s.added[1]!;
        const slot = s.scene.resourceSystem.poolSlotOf('ShadowMatrix', second.id);
        // Act: a primeira luz sai.
        s.scene.world.remove(s.added[0]!.light);
        s.step();
        // Assert: a segunda continua na vista 1 (o mesmo referencial), sem recomeço.
        const after = lastParams(s);
        expect(after).toMatchObject({ viewSpan: 2, liveMask: 2, resetMask: 0 });
        expect((after.views0 as number[])[1]).toBe(slot);
        expect(second.light.shadowMap!.data.view).toBe(1);
        expect(atlasOf(s).data.live).toBe(1);
        // Act: outra luz entra: fica com a faixa 0, e só o cache dela recomeça.
        const third = new DirectionalLight({ direction: [0, -1, 1, 0], castShadow: true });
        s.scene.world.insert(third);
        s.step();
        expect(third.shadowMap!.data.view).toBe(0);
        expect(lastParams(s)).toMatchObject({ viewSpan: 2, liveMask: 3, resetMask: 1 });
        s.step();
        expect(lastParams(s).resetMask).toBe(0);
    });

    it('sem luz com sombra o atlas sai da cena e o estágio não grava nada', async () => {
        const s = await scene(1);
        s.step();
        expect(s.computes()).toContain('ShadowFlow.pages');
        s.scene.world.remove(s.added[0]!.light);
        s.step();
        expect(s.scene.world.queryBySchemaName(ShadowAtlas.schema.name)).toHaveLength(0);
        expect(s.computes()).not.toContain('ShadowFlow.pages');
        expect(s.draws('ShadowFlow')).toHaveLength(0);
    });
});
