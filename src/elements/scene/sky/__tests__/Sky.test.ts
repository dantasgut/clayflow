import { describe, expect, it } from 'vitest';
import { renderScene } from '../../../../presentation/flows/__tests__/helpers/renderHarness';
import { DirectionalLight } from '../../DirectionalLight';
import { Sky, SKY_TRANSMITTANCE_SIZE } from '../Sky';
import { SkyFlow } from '../SkyFlow';
import { SkyAerialFlow } from '../SkyAerialFlow';
import { Camera } from '../../Camera';
import { Transform } from '../../Transform';
import { CameraFlow } from '../../flows/CameraFlow';
import { composeWgsl } from '../../../../scene/shaders/composeWgsl';

// Céu físico (spec 033, T017): descritores, sol copiado da luz, tabelas da atmosfera só quando ela muda, a vista do céu
// a cada quadro, contribuições.

async function skyScene(): Promise<
    Awaited<ReturnType<typeof renderScene>> & { sky: Sky; sun: DirectionalLight }
> {
    const s = await renderScene();
    s.scene.flows.register((ctx) => new SkyFlow(ctx), { type: 'sky', phase: 'transform' });
    const sun = new DirectionalLight({
        direction: [0, -1, 0, 0],
        intensity: 100000,
        color: [1, 0.9, 0.8, 1],
    });
    s.scene.world.insert(sun);
    const sky = new Sky({ sun });
    s.scene.world.insert(sky);
    return { ...s, sky, sun };
}

const tables = (computes: readonly string[]): string[] =>
    computes.filter((c) => c.startsWith('SkyFlow'));

describe('Sky e SkyFlow (spec 033, T017)', () => {
    it('descritores: parâmetros, três tabelas rgba16float e o amostrador linear', () => {
        const sky = new Sky({ sun: new DirectionalLight() });
        const byId = new Map(sky.getDescriptors().map((d) => [d.id, d]));
        expect(byId.get('params')).toMatchObject({ role: 'uniform' });
        expect(byId.get('transmittance')).toMatchObject({
            role: 'storage-texture',
            textureShape: {
                format: 'rgba16float',
                width: SKY_TRANSMITTANCE_SIZE[0],
                height: SKY_TRANSMITTANCE_SIZE[1],
            },
        });
        expect(byId.get('multiscatter')?.role).toBe('storage-texture');
        expect(byId.get('view')?.role).toBe('storage-texture');
        expect(byId.get('sampler')?.role).toBe('sampler');
    });

    it('contribui à transmissão da luz, ao fundo e ao ambiente; a luz nas superfícies só sem GI (spec 041)', () => {
        const sky = new Sky({ sun: new DirectionalLight() });
        const built = (): string[] =>
            sky
                .getSceneContributions()
                .filter((c) => c.build(() => undefined) !== undefined)
                .map((c) => c.point.name)
                .sort();
        expect(built()).toEqual(['light_transmission', 'scene_background', 'scene_environment']);
        sky.setAmbient(true);
        expect(built()).toEqual([
            'light_transmission',
            'scene_ambient',
            'scene_ambient_lighting',
            'scene_background',
            'scene_direct_lighting',
            'scene_environment',
        ]);
        // A perspectiva aérea na geometria (spec 041): em `scene_fog`, atrás da névoa dos volumes (ordem 0).
        sky.setAerial(true);
        const fog = sky.getSceneContributions().find((c) => c.point.name === 'scene_fog')!;
        expect(fog.order).toBeGreaterThan(0);
        const module = fog.build(() => undefined)!;
        expect(composeWgsl(module).spec.source).toContain('fn scene_fog(p: vec3f) -> SceneFog');
        sky.setAerial(false);
        expect(fog.build(() => undefined)).toBeUndefined();
    });

    it('a perspectiva aérea entra em `scene_fog` depois que a tabela da câmera foi escrita (spec 041)', async () => {
        const s = await skyScene();
        s.scene.world.insert(new Camera().add(new Transform({ position: [0, 0, 5, 1] })));
        s.scene.flows.register((ctx) => new CameraFlow(ctx), {
            type: 'camera',
            phase: 'transform',
            priority: 10,
        });
        s.scene.flows.register((ctx) => new SkyAerialFlow(ctx), {
            type: 'skyAerial',
            phase: 'shadow',
        });
        expect(s.sky.data.aerial).toBe(0);
        for (let i = 0; i < 3; i++) s.step();
        expect(s.computes()).toContain('SkyAerialFlow.sky_aerial');
        expect(s.sky.data.aerial).toBe(1);
        // O déficit da sombra no fundo (spec 041, raios crepusculares): com a tabela escrita e algo que tapa o sol no ar
        // (a camada de nuvens liga `shadowed`), o fundo o tira do céu; sem nada que tape o sol, o déficit é zero e o
        // fundo não o lê.
        const background = (): string =>
            composeWgsl(
                s.sky
                    .getSceneContributions()
                    .find((c) => c.point.name === 'scene_background')!
                    .build(() => undefined)!,
            ).spec.source;
        expect(background()).not.toContain('sky_aerial_shadow_lut');
        s.sky.setShadowed(true);
        expect(background()).toContain('sky_aerial_shadow_lut');
    });

    it('turbidez multiplica os aerossóis (Mie)', () => {
        const sky = new Sky({ sun: new DirectionalLight(), turbidity: 2 });
        expect(sky.turbidity).toBeCloseTo(2, 10);
        sky.turbidity = 3;
        expect(sky.turbidity).toBeCloseTo(3, 10);
    });

    it('tabelas da atmosfera no primeiro quadro e quando ela muda; a vista do céu a cada quadro', async () => {
        const s = await skyScene();
        s.step();
        expect(tables(s.computes())).toEqual([
            'SkyFlow.sky_transmittance',
            'SkyFlow.sky_multiscatter',
            'SkyFlow.sky_view',
        ]);
        s.step();
        expect(tables(s.computes())).toEqual(['SkyFlow.sky_view']);
        s.sky.turbidity = 2;
        s.step();
        expect(tables(s.computes())).toEqual([
            'SkyFlow.sky_transmittance',
            'SkyFlow.sky_multiscatter',
            'SkyFlow.sky_view',
        ]);
        expect(s.createdWhileRecording()).toBe(0);
    });

    it('copia o sol: direção para ele, iluminância (cor × lux) e o slot da luz; muda no mesmo quadro', async () => {
        const s = await skyScene();
        s.step();
        const [x, y, z] = s.sky.data.sunDirection;
        expect([x, y, z].map((v) => Math.abs(v!))).toEqual([0, 1, 0]);
        expect(s.sky.data.sunIlluminance.slice(0, 3)).toEqual([100000, 90000, 80000]);
        expect(s.sky.data.sunSlot).not.toBe(0xffffffff);
        s.sun.data.direction = [0, -0.5, -0.5, 0];
        s.step();
        const d = s.sky.data.sunDirection;
        expect(d[1]).toBeCloseTo(Math.SQRT1_2, 6);
        expect(d[2]).toBeCloseTo(Math.SQRT1_2, 6);
        // Mudar o sol não regenera as tabelas da atmosfera, só a vista.
        expect(tables(s.computes())).toEqual(['SkyFlow.sky_view']);
    });
});
