import { describe, expect, it, vi } from 'vitest';
import { BoxGeometry } from '../../geometry/BoxGeometry';
import { DirectionalLight } from '../DirectionalLight';
import { PointLight } from '../PointLight';
import { SpotLight } from '../SpotLight';
import { NONE } from '../../../scene/shaders/engineConstants';
import { SHADOW_MAX_VIEWS, ShadowAtlas, shadowAtlasLayout } from '../ShadowAtlas';
import { SHADOW_MAX_LEVELS, ShadowMap, shadowTableWords } from '../ShadowMap';
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
        // Fora de uma cena, sem vista no atlas único; a luz direcional declara uma vista, ortográfica.
        expect(map.data.view).toBe(NONE.value);
        expect(map.views).toEqual([{ projection: 'orthographic' }]);
        expect(map.data.firstLevelRadius).toBe(1);
        expect(() => new ShadowMap({ firstLevelRadius: 0 })).toThrow(RangeError);
    });

    it('descritores: parâmetros em pool e o referencial só na GPU (mesmo slot); o atlas e os pedidos são do ShadowAtlas (spec 013)', () => {
        // O maior lado vale: 512 → 4 páginas por nível.
        const map = new ShadowMap({ size: [512, 256] });
        expect(map.data).not.toHaveProperty('lightViewProj');
        expect(map.data).not.toHaveProperty('atlasPages');
        expect(map.data.pagesPerLevel).toBe(4);
        // A tabela da vista: 4 palavras por página virtual, os 16 níveis reservados.
        expect(shadowTableWords(4)).toBe(SHADOW_MAX_LEVELS * 4 * 4 * 4);
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
        ]);
    });

    it('o referencial da vista leva as bases dela no atlas único e a projeção (spec 013)', () => {
        const fields = [...ShadowMap.matrixSchema.fields.keys()];
        expect(fields).toEqual(
            expect.arrayContaining([
                'tableBase',
                'requestBase',
                'pagesBase',
                'kind',
                'origin',
                'near',
                'far',
            ]),
        );
        expect([...ShadowMap.schema.fields.keys()]).toContain('view');
    });

    it('as vistas declaradas por tipo de luz: uma ortográfica, uma em perspectiva (foco) ou seis (pontual)', () => {
        expect(new DirectionalLight({ castShadow: true }).shadowMap!.views).toEqual([
            { projection: 'orthographic' },
        ]);
        expect(new SpotLight({ castShadow: true }).shadowMap!.views).toEqual([
            { projection: 'perspective' },
        ]);
        const point = new PointLight({ castShadow: true, shadow: { size: [1024, 1024] } });
        expect(point.shadowMap!.views).toHaveLength(6);
        expect(point.shadowMap!.views.every((v) => v.projection === 'perspective')).toBe(true);
        // As opções do mapa valem nas luzes locais.
        expect(point.shadowMap!.data.pagesPerLevel).toBe(8);
        // O referencial leva o que as vistas em perspectiva pedem.
        expect([...ShadowMap.matrixSchema.fields.keys()]).toEqual(
            expect.arrayContaining(['eye', 'pixel', 'views', 'stripWords']),
        );
    });

    it('a DirectionalLight que projeta sombra anexa o seu ShadowMap; sem sombra, nenhum', () => {
        const casting = new DirectionalLight({ castShadow: true, shadow: { bias: 0.01 } });
        expect(casting.shadowMap).toBeInstanceOf(ShadowMap);
        expect(casting.attached).toContain(casting.shadowMap);
        expect(casting.shadowMap!.data.bias).toBeCloseTo(0.01);
        expect(new DirectionalLight({ castShadow: false }).shadowMap).toBeUndefined();
    });

    it('a C2 aloca os pools e o atlas único da cena; parâmetros e matriz no mesmo slot; o estágio da matriz despacha a luz', async () => {
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
        // A luz com sombra pôs o atlas único na cena, por evento, e o mapa dela tem a primeira vista.
        const resource = s.scene.world
            .resourcesOf(s.scene.world.queryBySchemaName(ShadowAtlas.schema.name)[0]!)
            .find((r): r is ShadowAtlas => r instanceof ShadowAtlas)!;
        expect(resource.views[0]).toBe(light.shadowMap);
        expect(light.shadowMap!.data.view).toBe(0);
        // 256² → 4 páginas por nível (o mínimo); o atlas com as tabelas das faixas e 16 × 16 páginas físicas depois, em
        // série por página.
        const atlas = rs.bufferOf(resource, 'atlas')!;
        expect(atlas.byteSize).toBe(shadowAtlasLayout(SHADOW_MAX_VIEWS, 4, 16).atlasWords * 4);
        expect(rs.channelOf(resource, 'atlas')?.paged?.tiles[0]).toBe(16 * 16);
        expect(rs.textureOf(resource, 'atlas')).toBeUndefined();
        expect(rs.bufferOf(light.shadowMap!, 'atlas')).toBeUndefined();
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
