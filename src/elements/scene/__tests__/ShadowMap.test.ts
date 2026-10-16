import { describe, expect, it, vi } from 'vitest';
import { BoxGeometry } from '../../geometry/BoxGeometry';
import { DirectionalLight } from '../DirectionalLight';
import { ShadowMap } from '../ShadowMap';
import { Transform } from '../Transform';
import { ShadowMatrixParamsSchema } from '../flows/ShadowMatrixSchemas';
import {
    discOf,
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

    it('descritores: parâmetros em pool, matriz só na GPU (mesmo slot), textura depth32float do tamanho do mapa e o amostrador de comparação', () => {
        const map = new ShadowMap({ size: [512, 256] });
        expect(map.data).not.toHaveProperty('lightViewProj');
        expect(map.getDescriptors()).toEqual([
            { id: 'shadowmap', role: 'storage-ro', schema: ShadowMap.schema, storage: 'pool' },
            {
                id: 'matrix',
                role: 'storage-rw',
                storage: 'pool',
                schema: ShadowMap.matrixSchema,
                upload: 'never',
            },
            {
                id: 'depth',
                role: 'texture',
                textureShape: { format: 'depth32float', width: 512, height: 256 },
            },
            {
                id: 'compare',
                role: 'sampler',
                samplerShape: { magFilter: 'linear', minFilter: 'linear', compare: 'less' },
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

    it('a C2 aloca os pools e a textura; parâmetros e matriz no mesmo slot; o estágio da matriz despacha a luz', async () => {
        const s = await renderScene();
        registerStages(s.scene, { shadow: true });
        const light = new DirectionalLight({
            direction: [0, -1, 0, 0],
            castShadow: true,
            shadow: { size: [256, 256] },
        });
        const id = s.scene.world.insert(light);
        s.scene.world.insert(new BoxGeometry().add(new Transform()));
        s.step();
        const rs = s.scene.resourceSystem;
        const depth = rs.textureOf(light.shadowMap!, 'depth')!;
        expect([depth.width, depth.height, depth.format]).toEqual([256, 256, 'depth32float']);
        expect(rs.poolSlotOf('ShadowMap', id)).toBe(rs.poolSlotOf('ShadowMatrix', id));
        const params = vi
            .mocked(s.core.write)
            .mock.calls.filter(([spec]) => discOf(spec) === 'shadow_matrix_params');
        expect(params).toHaveLength(1);
        const [, data] = params[0]!;
        const u32 = new Uint32Array(data.buffer, data.byteOffset, 4);
        expect(u32[ShadowMatrixParamsSchema.offsetOf('count') / 4]).toBe(1);
    });

    it('mudar a direção da luz só envia o pool Light: nenhuma conta nem escrita de matriz na CPU', async () => {
        const s = await renderScene();
        registerStages(s.scene, { shadow: true });
        const light = new DirectionalLight({ direction: [0, -1, 0, 0], castShadow: true });
        s.scene.world.insert(light);
        s.scene.world.insert(new BoxGeometry().add(new Transform()));
        s.step();
        s.step();
        s.resetCounts();
        light.data.direction = [1, -1, 0, 0];
        s.step();
        // Fora o relógio do quadro (`Time`), só o pool de luzes é escrito.
        const lights = s.scene.resourceSystem.poolBufferSpec('Light');
        const written = s.writes().filter((w) => !discOf(w).startsWith('time:'));
        expect(written).toContain(lights);
        expect(written.filter((w) => w !== lights)).toEqual([]);
        expect(light.shadowMap!.data).not.toHaveProperty('lightViewProj');
    });
});
