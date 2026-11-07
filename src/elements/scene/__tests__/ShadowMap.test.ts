import { describe, expect, it, vi } from 'vitest';
import { BoxGeometry } from '../../geometry/BoxGeometry';
import { DirectionalLight } from '../DirectionalLight';
import { GpuWordSchema } from '../../gpu/compute/schemas';
import { SHADOW_MAX_LEVELS, SHADOW_PAGE_WORDS, ShadowMap, shadowTableWords } from '../ShadowMap';
import { halton, TemporalAntialiasing, type AntialiasingMode } from '../TemporalAntialiasing';
import { Transform } from '../Transform';
import { ShadowMatrixParamsSchema } from '../flows/ShadowMatrixSchemas';
import {
    discOf,
    registerStages,
    renderScene,
} from '../../../presentation/flows/__tests__/helpers/renderHarness';

describe('ShadowMap', () => {
    it('padrões: bias 1 texel, normalBias 1,5 texel, níveis de 4096² (32 × 32 páginas), o primeiro com 1 m de meio lado', () => {
        const map = new ShadowMap();
        expect(map.data.bias).toBe(1);
        expect(map.data.normalBias).toBe(1.5);
        expect(map.data.size).toEqual([4096, 4096]);
        expect(map.data.pagesPerLevel).toBe(32);
        expect(map.data.atlasPages).toBe(32);
        expect(map.data.firstLevelRadius).toBe(1);
        expect(() => new ShadowMap({ firstLevelRadius: 0 })).toThrow(RangeError);
    });

    it('descritores: parâmetros em pool, o referencial só na GPU (mesmo slot), o atlas em buffer como série por páginas (a tabela no começo) e os pedidos como série temporal, sem textura (T060h)', () => {
        // O maior lado vale: 512 → 4 páginas por nível; o atlas com o mínimo de 16 × 16 páginas físicas.
        const map = new ShadowMap({ size: [512, 256] });
        expect(map.data).not.toHaveProperty('lightViewProj');
        expect(map.data.pagesPerLevel).toBe(4);
        // A tabela: 4 palavras por página virtual, os 16 níveis reservados.
        const table = shadowTableWords(4);
        expect(table).toBe(SHADOW_MAX_LEVELS * 4 * 4 * 4);
        expect(map.getDescriptors()).toEqual([
            { id: 'shadowmap', role: 'storage-ro', schema: ShadowMap.schema, storage: 'pool' },
            {
                id: 'matrix',
                role: 'storage-rw',
                storage: 'pool',
                schema: ShadowMap.matrixSchema,
                upload: 'never',
                history: { depth: 2 },
            },
            {
                id: 'atlas',
                role: 'storage-rw',
                schema: GpuWordSchema,
                count: table + 16 * 16 * SHADOW_PAGE_WORDS,
                upload: 'never',
                history: { depth: 1, pages: { record: SHADOW_PAGE_WORDS * 4, offset: table * 4 } },
            },
            {
                id: 'requests',
                role: 'storage-rw',
                schema: GpuWordSchema,
                count: SHADOW_MAX_LEVELS * 4 * 4,
                upload: 'never',
                history: { depth: 2 },
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

    it('a C2 aloca os pools e o atlas; parâmetros e matriz no mesmo slot; o estágio da matriz despacha a luz', async () => {
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
        // 256² → 4 páginas por nível (o mínimo); o atlas com 16 × 16 páginas físicas depois da tabela, em séries por página.
        const atlas = rs.bufferOf(light.shadowMap!, 'atlas')!;
        expect(atlas.byteSize).toBe((shadowTableWords(4) + 16 * 16 * SHADOW_PAGE_WORDS) * 4);
        expect(rs.channelOf(light.shadowMap!, 'atlas')?.paged?.tiles[0]).toBe(16 * 16);
        expect(rs.textureOf(light.shadowMap!, 'atlas')).toBeUndefined();
        expect(rs.poolSlotOf('ShadowMap', id)).toBe(rs.poolSlotOf('ShadowMatrix', id));
        const params = vi
            .mocked(s.core.write)
            .mock.calls.filter(([spec]) => discOf(spec).startsWith('shadow_matrix_params:'));
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

    /** Rotação do PCF e deslocamento da grade enviados pelo estágio da matriz em `frames` quadros, no modo `mode`. */
    async function samples(mode: AntialiasingMode, frames: number): Promise<number[][]> {
        const s = await renderScene();
        registerStages(s.scene, { shadow: true });
        s.scene.world.insert(new TemporalAntialiasing({ mode, sequence: 8 }));
        s.scene.world.insert(new DirectionalLight({ direction: [0, -1, 0, 0], castShadow: true }));
        s.scene.world.insert(new BoxGeometry().add(new Transform()));
        for (let i = 0; i < frames; i++) s.step();
        return vi
            .mocked(s.core.write)
            .mock.calls.filter(([spec]) => discOf(spec).startsWith('shadow_matrix_params:'))
            .map(([, data]) => {
                const f32 = new Float32Array(data.buffer, data.byteOffset, data.byteLength / 4);
                const r = ShadowMatrixParamsSchema.offsetOf('kernelRotation') / 4;
                const j = ShadowMatrixParamsSchema.offsetOf('texelJitter') / 4;
                return [f32[r]!, f32[r + 1]!, f32[j]!, f32[j + 1]!];
            });
    }

    it('com o deslocamento da amostra, a grade do mapa anda no texel e o PCF gira a cada quadro pela sequência', async () => {
        const sent = await samples('temporal', 10);
        expect(sent).toHaveLength(10);
        sent.forEach(([c, s, jx, jy], k) => {
            const i = (k % 8) + 1;
            const angle = (Math.PI / 2) * halton(i, 11);
            expect(c).toBeCloseTo(Math.cos(angle), 6);
            expect(s).toBeCloseTo(Math.sin(angle), 6);
            expect(jx).toBeCloseTo(halton(i, 5) - 0.5, 6);
            expect(jy).toBeCloseTo(halton(i, 7) - 0.5, 6);
        });
        // A sequência repete com o comprimento da do antisserrilhado.
        expect(sent[8]).toEqual(sent[0]);
    });

    it('sem o deslocamento da amostra (msaa), a grade e o padrão parados, enviados só quando a série muda', async () => {
        // O primeiro quadro e o seguinte (a série do referencial passa a valer); depois, nada.
        const sent = await samples('msaa', 5);
        expect(sent.length).toBeLessThanOrEqual(2);
        for (const v of sent) expect(v).toEqual([1, 0, 0, 0]);
    });
});
