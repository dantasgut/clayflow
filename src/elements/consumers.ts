import type { ConsumerResolver } from '../scene/consumers/ConsumerResolver';
import { SingletonResolver } from '../scene/consumers/strategies/SingletonResolver';
import { GravityField } from './physics/forcefields/GravityField';
import { ParticleMaterial } from './physics/materials/ParticleMaterial';
import { ShadowCasterResolver } from './scene/shadowCaster';
import { PbrTablesResolver } from './material/pbr/PbrTablesResolver';
import { HemisphereLightSchema } from './scene/HemisphereLightSchema';
import { RaySceneSchema } from './raytrace/schemas';
import { SkySchema } from './scene/sky/SkySchema';
import { GlobalIlluminationSchema } from './lighting/schemas';
import { FluidFieldSchema } from './fields/schemas';
import { FroxelsSchema } from './media/schemas';

/**
 * Resolvers (fornecedores `{ consumer }`) dos Resources únicos da Camada 3, registrados pela aplicação na cena (sem substituir os da
 * aplicação): `GravityField`, `ParticleMaterial` e o mapa de sombra que projeta (`ShadowCaster.depth`,
 * `ShadowCaster.sampler`, spec 031) as tabelas do sombreamento físico (`PbrTables.dfg`, `PbrTables.sampler`, spec 011), a estrutura de raios (`RayScene.info`), o céu físico (`Sky.*`) e a iluminação global (`GlobalIllumination.*`, spec 033). Os pools (`Camera`, `CameraMatrices`, `WorldTransform`,
 * `Transform`, `Light`, `ShadowMap`, materiais, corpos, colliders, restrições) têm o `PoolResolver` registrado pela C2
 * ao serem criados; o `Time` é registrado pela cena.
 */
export const ELEMENT_CONSUMERS: readonly ConsumerResolver[] = [
    new SingletonResolver(GravityField.schema, 'gravity'),
    new SingletonResolver(ParticleMaterial.schema, 'material'),
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
    // A iluminação global (spec 033): parâmetros, estado das sondas, atlas, amostrador, as sondas de tela e a refração
    // traçada (spec 034).
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
            'caustics',
            'refraction',
        ] as const
    ).map(
        (id) =>
            new SingletonResolver(GlobalIlluminationSchema, id, {
                name: `GlobalIllumination.${id}`,
            }),
    ),
    // O campo dos fluidos (spec 033, R11): parâmetros, o buffer das consultas (limites, tabela, blocos, voxels) e a
    // contagem.
    ...(['params', 'data', 'counts'] as const).map(
        (id) => new SingletonResolver(FluidFieldSchema, id, { name: `FluidField.${id}` }),
    ),
    // Os froxels dos meios participantes (spec 033, R12): parâmetros, o buffer dos meios, a névoa integrada, os
    // históricos, a luz ambiente e o amostrador.
    ...(['params', 'media', 'scatter', 'history0', 'history1', 'ambient', 'sampler'] as const).map(
        (id) => new SingletonResolver(FroxelsSchema, id, { name: `Froxels.${id}` }),
    ),
];
