import { describe, expect, it } from 'vitest';
import { renderScene } from '../../../../presentation/flows/__tests__/helpers/renderHarness';
import { registerPresentationDefaults } from '../../../../presentation/flows/defaults';
import { Camera } from '../../../scene/Camera';
import { DirectionalLight } from '../../../scene/DirectionalLight';
import { Transform } from '../../../scene/Transform';
import { Sky } from '../../../scene/sky/Sky';
import { CloudLayer, CLOUD_WEATHER_DEFAULTS } from '../CloudLayer';
import { CLOUD_EARTH_OMEGA, CLOUD_WEATHER_SIZE } from '../schemas';
import { coriolis, highAmplitudeCap, patternAmplitude } from '../reference/cloudWeather';

// O tempo das nuvens (spec 041, R18): a API da `CloudLayer` (valores, validação, a função de pressão), os descritores
// (o estado como série da 037), o uniforme empacotado contra a referência e o ciclo de vida dos estágios (ligar,
// desligar e trocar a função de pressão deixam o motor pronto).

describe('CloudLayer — o tempo (R18)', () => {
    it('padrões, a casca até a tropopausa e a função de pressão anexada', () => {
        // Act
        const plain = new CloudLayer();
        const weather = new CloudLayer({ top: 3000, weather: {} });
        const user = new CloudLayer({
            weather: {
                latitude: -30,
                pressure: {
                    code: 'fn pressure_fn(xz: vec2f, time: f32, data: PressureFnParams) -> f32 { return 0.0; }',
                },
            },
        });
        // Assert
        expect(plain.weather).toBeUndefined();
        expect(plain.shellTop).toBe(4000);
        expect(weather.weather).toEqual(CLOUD_WEATHER_DEFAULTS);
        expect(weather.shellTop).toBe(11_000);
        expect(weather.pressureFunction).toBeUndefined();
        expect(user.weather?.latitude).toBe(-30);
        expect(user.pressureFunction?.composite).toBeDefined();
    });

    it('validação: RangeError nomeando o valor', () => {
        expect(() => new CloudLayer({ weather: { latitude: 91 } })).toThrow(/latitude/);
        expect(() => new CloudLayer({ weather: { friction: 0 } })).toThrow(/atrito/);
        expect(() => new CloudLayer({ weather: { formation: -1 } })).toThrow(/formação/);
        expect(() => new CloudLayer({ weather: { lifetime: 0 } })).toThrow(/vida/);
        expect(() => new CloudLayer({ weather: { scale: Number.NaN } })).toThrow(/escala/);
        expect(() => new CloudLayer({ weather: { amplitude: -5 } })).toThrow(/amplitude/);
        expect(() => new CloudLayer({ weather: { seed: 1.5 } })).toThrow(/semente/);
        expect(() => new CloudLayer({ top: 12_000, weather: {} })).toThrow(/tropopausa/);
        expect(
            () =>
                new CloudLayer({
                    coverage: {
                        code: 'fn coverage_fn(xz: vec2f, time: f32, data: CoverageFnParams) -> vec3f { return vec3f(1.0); }',
                    },
                    weather: {},
                }),
        ).toThrow(/cobertura/);
        const layer = new CloudLayer({ weather: {} });
        expect(() => {
            layer.weather = { latitude: -100 };
        }).toThrow(/latitude/);
        expect(layer.weather?.latitude).toBe(45);
    });

    it('atribuir valores parciais ajusta; undefined desliga; ligar depois usa os padrões', () => {
        const layer = new CloudLayer();
        layer.weather = { latitude: 10 };
        expect(layer.weather).toEqual({ ...CLOUD_WEATHER_DEFAULTS, latitude: 10 });
        layer.weather = { friction: 1e-4 };
        expect(layer.weather?.latitude).toBe(10);
        expect(layer.weather?.friction).toBe(1e-4);
        layer.weather = undefined;
        expect(layer.weather).toBeUndefined();
    });

    it('descritores: o estado do tempo é série temporal em 32 bits, sob demanda', () => {
        const byId = new Map(new CloudLayer().getDescriptors().map((x) => [x.id, x]));
        expect(byId.get('weather')?.history?.depth).toBe(2);
        expect(byId.get('weather')?.allocation).toBe('onDemand');
        expect(byId.get('weather')?.textureShape?.format).toBe('rgba32float');
        expect(byId.get('weather')?.textureShape?.width).toBe(CLOUD_WEATHER_SIZE);
        expect(byId.get('weatherWind')?.textureShape?.format).toBe('rgba16float');
        expect(byId.get('weatherWind')?.allocation).toBe('onDemand');
    });
});

async function scene() {
    const s = await renderScene();
    registerPresentationDefaults(s.scene.flows, { world: s.scene.world, events: s.scene.events });
    const world = s.scene.world;
    world.insert(new Camera().add(new Transform({ position: [0, 2, 10, 1] })));
    const sun = new DirectionalLight({ direction: [-0.3, -0.6, -0.7, 0], intensity: 100000 });
    world.insert(sun);
    world.insert(new Sky({ sun }));
    const settle = async (): Promise<void> => {
        for (let i = 0; i < 12; i++) {
            s.step();
            for (let k = 0; k < 30; k++) await Promise.resolve();
        }
    };
    const pending = (): string[] =>
        s.scene.resourceSystem.readiness.pending.map(
            (p) =>
                `${p.flow}/${p.pipeline} (${p.reason}${p.name !== undefined ? `: ${p.name}` : ''})`,
        );
    return { s, world, settle, pending };
}

describe('o tempo nos estágios (R18)', () => {
    it('o uniforme: f, os atritos, o padrão na latitude e o topo do tempo bom, iguais à referência', async () => {
        // Arrange
        const { world, settle, pending } = await scene();
        const clouds = new CloudLayer({
            base: 1500,
            top: 3500,
            weather: { latitude: -20, amplitude: 1400, scale: 1_200_000, seed: 9 },
        });
        world.insert(clouds);
        // Act
        await settle();
        // Assert
        expect(pending()).toEqual([]);
        const p = clouds.data.params[0]!;
        const f = coriolis(-20);
        expect(p.weather![0]).toBeCloseTo(f, 12);
        expect(f).toBeCloseTo(-2 * CLOUD_EARTH_OMEGA * Math.sin((20 * Math.PI) / 180), 15);
        expect(p.weather!.slice(1)).toEqual([1e-5, CLOUD_WEATHER_DEFAULTS.friction, 1200]);
        expect(p.weatherPattern![1]).toBeCloseTo(patternAmplitude(1400, f), 9);
        expect(p.weatherPattern![2]).toBeCloseTo(highAmplitudeCap(1_200_000, f), 6);
        expect(p.weatherMap![0]).toBeCloseTo(2000 / 9500, 12);
        expect(p.weatherMap![3]).toBeCloseTo(1_200_000 / 64, 9);
        expect(p.weatherFlags![0]).toBe(1);
        expect(p.weatherFlags![3]).toBe(9);
        expect(p.shell![2]).toBe(11_000);
        expect(p.flags![3]).toBe(1);
    });

    it('ligar, trocar a função de pressão e desligar: o kernel do tempo entra e sai, pronto em cada passo', async () => {
        const { s, world, settle, pending } = await scene();
        const plain = new CloudLayer({ coverage: 0.4 });
        world.insert(plain);
        await settle();
        expect(pending()).toEqual([]);
        expect(s.computes()).not.toContain('CloudLightFlow.weather');
        expect(plain.data.params[0]!.weatherMap![0]).toBe(1);
        // liga o padrão
        plain.weather = { latitude: 50 };
        await settle();
        expect(pending()).toEqual([]);
        expect(s.computes()).toContain('CloudLightFlow.weather');
        // outra camada com a função do usuário (o A/B)
        world.remove(plain);
        const user = new CloudLayer({
            coverage: 0.4,
            weather: {
                pressure: {
                    code: 'fn pressure_fn(xz: vec2f, time: f32, data: PressureFnParams) -> f32 {\n    return -1500.0 * exp(-dot(xz, xz) / 3.2e11);\n}',
                },
            },
        });
        world.insert(user);
        await settle();
        expect(pending()).toEqual([]);
        expect(s.computes()).toContain('CloudLightFlow.weather');
        // desliga
        user.weather = undefined;
        await settle();
        expect(pending()).toEqual([]);
    });
});
