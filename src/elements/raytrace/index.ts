export {
    RayScene,
    type RayMaterialFunction,
    type RaySceneCapacity,
    type RaySceneData,
} from './RayScene';
export { RaySceneFlow, type RaySceneSlots } from './RaySceneFlow';
// A onda dos acertos de quem traça (spec 039): a parte de trabalho e o módulo de gravar nela, para Flows que traçam raios.
export { RayWave, RAY_WAVE_GRID_GROUPS } from './RayWave';
export { rayWave } from './wave/shaders';
export { rayScene, rayCommon, raySceneInfoResource, raySceneResources } from './shaders';
export { RAY_WORDS, RayBvhSchema, RayGeometrySchema, RaySceneSchema } from './schemas';
export {
    rayVolumeMaterial,
    rayVolumeSurfacePoint,
    rayVolumeSurfaceReady,
    rayVolumeHitPoint,
    rayVolumeHitReady,
    rayMediaTransmittancePoint,
    rayMediaTransmittanceReady,
    rayVolumeTransmittancePoint,
    rayVolumeTransmittanceReady,
    rayVolumeScatterPoint,
    rayVolumeScatterReady,
    rayVolumeScatterTypes,
    rayVolumeTypes,
} from './points';
