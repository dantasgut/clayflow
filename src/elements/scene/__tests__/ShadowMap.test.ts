import { describe, expect, it } from 'vitest';
import { BoxGeometry } from '../../geometry/BoxGeometry';
import { DirectionalLight } from '../DirectionalLight';
import { ShadowMap } from '../ShadowMap';
import { Transform } from '../Transform';
import {
    registerStages,
    renderScene,
} from '../../../presentation/flows/__tests__/helpers/renderHarness';

describe('ShadowMap', () => {
    it('padrões: bias 0,005, normalBias 0,001, size 1024×1024', () => {
        const map = new ShadowMap();
        expect(map.data.bias).toBeCloseTo(0.005);
        expect(map.data.normalBias).toBeCloseTo(0.001);
        expect(map.data.size).toEqual([1024, 1024]);
    });

    it('descritores: dados em pool (storage-ro) e textura depth32float do tamanho do mapa', () => {
        const map = new ShadowMap({ size: [512, 256] });
        expect(map.getDescriptors()).toEqual([
            { id: 'shadowmap', role: 'storage-ro', schema: ShadowMap.schema, storage: 'pool' },
            {
                id: 'depth',
                role: 'texture',
                textureShape: { format: 'depth32float', width: 512, height: 256 },
            },
        ]);
    });

    it('a DirectionalLight que projeta sombra anexa o seu ShadowMap; sem sombra, nenhum', () => {
        const casting = new DirectionalLight({ castShadow: true, shadow: { bias: 0.01 } });
        expect(casting.shadowMap).toBeInstanceOf(ShadowMap);
        expect(casting.attached).toContain(casting.shadowMap);
        expect(casting.shadowMap!.data.bias).toBeCloseTo(0.01);
        expect(new DirectionalLight({ castShadow: false }).shadowMap).toBeUndefined();
    });

    it('a C2 aloca o pool e a textura; o estágio de sombra grava a matriz da luz no ShadowMap', async () => {
        const s = await renderScene();
        registerStages(s.scene, { shadow: true });
        const light = new DirectionalLight({
            direction: [0, -1, 0, 0],
            castShadow: true,
            shadow: { size: [256, 256] },
        });
        s.scene.world.insert(light);
        s.scene.world.insert(new BoxGeometry().add(new Transform()));
        s.step();
        const map = light.shadowMap!;
        const depth = s.scene.resourceSystem.textureOf(map, 'depth')!;
        expect([depth.width, depth.height, depth.format]).toEqual([256, 256, 'depth32float']);
        expect(s.scene.resourceSystem.poolBufferSpec(ShadowMap.schema.name)).toBeDefined();
        const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
        expect(map.data.lightViewProj).not.toEqual(identity);
    });

    it('mudar a direção da luz recalcula a matriz no quadro seguinte', async () => {
        const s = await renderScene();
        registerStages(s.scene, { shadow: true });
        const light = new DirectionalLight({ direction: [0, -1, 0, 0], castShadow: true });
        s.scene.world.insert(light);
        s.scene.world.insert(new BoxGeometry().add(new Transform()));
        s.step();
        const before = [...(light.shadowMap!.data.lightViewProj as number[])];
        light.data.direction = [1, -1, 0, 0];
        s.step();
        s.step();
        expect(light.shadowMap!.data.lightViewProj).not.toEqual(before);
    });
});
