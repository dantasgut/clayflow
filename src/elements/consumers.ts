import type { ConsumerResolver } from '../scene/consumers/ConsumerResolver';
import { SingletonResolver } from '../scene/consumers/strategies/SingletonResolver';
import { GravityField } from './physics/forcefields/GravityField';
import { ParticlePhysics } from './physics/ParticlePhysics';
import { ShadowCasterResolver } from './scene/shadowCaster';
import { PbrTablesResolver } from './material/pbr/PbrTablesResolver';
import { HemisphereLightSchema } from './scene/HemisphereLightSchema';
import { RaySceneSchema } from './raytrace/schemas';
import { SkySchema } from './scene/sky/SkySchema';
import { GlobalIlluminationSchema } from './lighting/schemas';
import { CausticsSchema } from './lighting/caustics/schemas';
import { FluidFieldSchema } from './fields/schemas';
import { FroxelsSchema } from './media/schemas';
import { Refraction } from './lighting/refraction/Refraction';
import { TemporalFilter } from './lighting/temporal/TemporalFilter';
import { EnergyMeter } from './physics/energy/EnergyMeter';

/**
 * Resolvers (fornecedores `{ consumer }`) dos Resources únicos da Camada 3, registrados pela aplicação na cena (sem substituir os da
 * aplicação): `GravityField`, `ParticlePhysics` e o mapa de sombra que projeta (`ShadowCaster.depth`,
 * `ShadowCaster.sampler`, spec 031) as tabelas do sombreamento físico (`PbrTables.dfg`, `PbrTables.sampler`, spec 011), a estrutura de raios (`RayScene.info`), o céu físico (`Sky.*`) e a iluminação global (`GlobalIllumination.*`, spec 033). Os pools (`Camera`, `CameraMatrices`, `WorldTransform`,
 * `Transform`, `Light`, `ShadowMap`, materiais, corpos, colliders, restrições) têm o `PoolResolver` registrado pela C2
 * ao serem criados; o `Time` é registrado pela cena.
 */
export const ELEMENT_CONSUMERS: readonly ConsumerResolver[] = [
    new SingletonResolver(GravityField.schema, 'gravity'),
    new SingletonResolver(ParticlePhysics.schema, 'physics'),
    new ShadowCasterResolver('depth', 'texture_depth_2d'),
    new ShadowCasterResolver('compare', 'sampler_comparison'),
    // Tabelas do sombreamento físico (spec 011): a DFG e o seu amostrador, lidos pelo avaliador do fechamento.
    new PbrTablesResolver('dfg', 'texture_2d<f32>'),
    new PbrTablesResolver('sampler', 'sampler'),
    // O hemisfério da cena (spec 011), lido pela contribuição dele a `scene_lighting`.
    new SingletonResolver(HemisphereLightSchema, 'params', { name: 'HemisphereLight.params' }),
    // A estrutura de raios da cena (spec 033): o uniform com as faixas nos pools (os pools têm o resolver da C2).
    new SingletonResolver(RaySceneSchema, 'info', { name: 'RayScene.info' }),
    // O céu físico (spec 033): parâmetros, tabelas e amostrador.
    ...(['params', 'transmittance', 'multiscatter', 'view', 'sampler'] as const).map(
        (id) => new SingletonResolver(SkySchema, id, { name: `Sky.${id}` }),
    ),
    // A iluminação global (spec 033): parâmetros, estado das sondas, atlas, amostrador e as sondas de tela.
    ...(
        [
            'params',
            'probes',
            'probeTexture',
            'irradiance',
            'radiance',
            'visibility',
            'sampler',
            'screenProbe',
            'screenIrradiance',
        ] as const
    ).map(
        (id) =>
            new SingletonResolver(GlobalIlluminationSchema, id, {
                name: `GlobalIllumination.${id}`,
            }),
    ),
    // As cáusticas (spec 034, T067c): os parâmetros e o hash dos fótons.
    ...(['params', 'hash'] as const).map(
        (id) => new SingletonResolver(CausticsSchema, id, { name: `Caustics.${id}` }),
    ),
    // O campo dos fluidos (spec 033, R11): parâmetros, o buffer das consultas (limites, tabela, blocos, voxels) e a
    // contagem; o mapa da luz pela água e a malha da superfície com os argumentos do desenho (spec 039 refeita).
    ...(['params', 'data', 'counts', 'lightMap', 'mesh', 'meshArgs'] as const).map(
        (id) => new SingletonResolver(FluidFieldSchema, id, { name: `FluidField.${id}` }),
    ),
    // A refração traçada (spec 034): o uniform (limite de interfaces, câmera, luzes, quadro, tempo).
    new SingletonResolver(Refraction.schema, 'params', { name: 'Refraction.params' }),
    // O medidor de energia dos corpos rígidos (spec 037): o uniform do kernel.
    new SingletonResolver(EnergyMeter.schema, 'params', { name: 'EnergyMeter.params' }),
    // O filtro de sinal traçado (spec 034): o uniform (ligado, quadros da média).
    new SingletonResolver(TemporalFilter.schema, 'params', { name: 'TemporalFilter.params' }),
    // Os froxels dos meios participantes (spec 033, R12): parâmetros, o buffer dos meios, a névoa integrada, a luz
    // ambiente e o amostrador (o histórico é um canal temporal, ligado pelo slot do estágio; spec 037).
    ...(['params', 'media', 'scatter', 'ambient', 'sampler'] as const).map(
        (id) => new SingletonResolver(FroxelsSchema, id, { name: `Froxels.${id}` }),
    ),
];
