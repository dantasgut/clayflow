import type { ConsumerResolver } from '../scene/consumers/ConsumerResolver';
import { SingletonResolver } from '../scene/consumers/strategies/SingletonResolver';
import { GravityField } from './physics/forcefields/GravityField';
import { ParticleMaterial } from './physics/materials/ParticleMaterial';
import { ShadowCasterResolver } from './scene/shadowCaster';
import { PbrTablesResolver } from './material/pbr/PbrTablesResolver';
import { HemisphereLightSchema } from './scene/HemisphereLightSchema';

/**
 * Resolvers (fornecedores `{ consumer }`) dos Resources únicos da Camada 3, registrados pela aplicação na cena (sem substituir os da
 * aplicação): `GravityField`, `ParticleMaterial` e o mapa de sombra que projeta (`ShadowCaster.depth`,
 * `ShadowCaster.sampler`, spec 031) e as tabelas do sombreamento físico (`PbrTables.dfg`, `PbrTables.sampler`, spec 011). Os pools (`Camera`, `CameraMatrices`, `WorldTransform`,
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
];
