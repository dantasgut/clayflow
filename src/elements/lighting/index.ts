export {
    GlobalIllumination,
    GI_QUALITY,
    type GlobalIlluminationData,
    type GlobalIlluminationQuality,
    type GlobalIlluminationValues,
} from './GlobalIllumination';
export { ProbeFlow, type ProbeSlots } from './ProbeFlow';
export * from './caustics/index';
export { GlobalIlluminationSchema, ProbeStateSchema } from './schemas';
// O `Refraction` e o `Caustics` não são de autoria (spec 039, FR-011): a configuração está no `Renderer`.
export {
    REFRACTION_DEFAULT_INTERFACES,
    REFRACTION_FRAME_COUNT,
    REFRACTION_MAX_INTERFACES,
    REFRACTION_MAX_MEDIA,
    REFRACTION_REQUEST_BACK_FACE,
    REFRACTION_REQUEST_VALID,
} from './refraction/Refraction';
export {
    TemporalFilter,
    TEMPORAL_FILTER_DEFAULT_HISTORY,
    TEMPORAL_FILTER_MAX_HISTORY,
    type TemporalFilterData,
    type TemporalFilterValues,
} from './temporal/TemporalFilter';
