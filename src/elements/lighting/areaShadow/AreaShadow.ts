import { Entity } from '../../../scene/contracts/Entity';
import { ResourceState } from '../../../scene/contracts/ResourceState';
import type { Resource } from '../../../scene/contracts/Resource';
import type { GPUDescriptor } from '../../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../../scene/descriptors/PipelineDescriptor';
import type { SceneContribution } from '../../../scene/shaders/WgslPoint';
import type { Light } from '../../scene/Light';
import { lightVisibilityPoint } from '../../scene/points/lighting';
import {
    AREA_SHADOW_FORMAT,
    AREA_SHADOW_HISTORY,
    AREA_SHADOW_MAX_LIGHTS,
    AREA_SHADOW_POINT_FORMAT,
    AreaShadowSchema,
} from './areaShadowSchema';
import { areaShadowRead } from './shaders';

interface AreaShadowData extends Record<string, unknown> {
    /** O slot da câmera com que a saída foi calculada (pool das matrizes). */
    camera: number;
    /** Luzes de área com sombra vivas. */
    count: number;
    history_max: number;
    _pad0: number;
}

/**
 * A sombra das luzes de área por raios (spec 013, R5): a fração do retângulo de cada luz que cada ponto visto pela
 * câmera enxerga. Guarda os alvos do `AreaShadowFlow`, a meia resolução e sob demanda — o traçado do quadro (`traced`,
 * um raio por texel e por luz a um ponto sorteado no retângulo), o ponto de mundo de cada texel (`point`), a média no
 * tempo (`accumulated`, com `history`: o ponto e os quadros; canais temporais da C2, spec 037) e o par das passadas do
 * filtro (`work`, `output`) — e as luzes de área com sombra da cena, uma por canal (`lights`, na ordem dos canais; quem
 * as distribui é `areaShadowsByEvent`). O desenho lê `output` e `point` do quadro anterior pelo ponto de mundo do
 * fragmento (a sombra de um ponto parado não depende do quadro); sem texel que valha, um raio ao centro da fonte. Uma
 * por cena; entra com a primeira luz de área que projeta e sai sem nenhuma.
 */
export class AreaShadow extends Entity<AreaShadowData> implements Resource {
    /** Parâmetros (uniform `AreaShadow`). */
    static readonly schema = AreaShadowSchema;

    state: ResourceState = ResourceState.Uninitialized;

    private casting: readonly Light[] = [];

    constructor() {
        super();
        this.data = { camera: 0, count: 0, history_max: AREA_SHADOW_HISTORY, _pad0: 0 };
    }

    /** As luzes de área com sombra, na ordem dos canais. */
    get lights(): readonly Light[] {
        return this.casting;
    }

    set lights(lights: readonly Light[]) {
        this.casting = lights.slice(0, AREA_SHADOW_MAX_LIGHTS);
        if (this.data.count !== this.casting.length) this.data.count = this.casting.length;
    }

    getDescriptors(): readonly GPUDescriptor[] {
        const target = (id: string, format: GPUTextureFormat): GPUDescriptor => ({
            id,
            role: 'storage-texture',
            allocation: 'onDemand',
            textureShape: { format, sizeFromCanvas: true, access: 'write-only', canvasDivisor: 2 },
        });
        return [
            { id: 'params', role: 'uniform', schema: AreaShadow.schema },
            target('traced', AREA_SHADOW_FORMAT),
            target('point', AREA_SHADOW_POINT_FORMAT),
            { ...target('accumulated', AREA_SHADOW_FORMAT), history: { depth: 2 } },
            { ...target('history', AREA_SHADOW_POINT_FORMAT), history: { depth: 2 } },
            target('work', AREA_SHADOW_FORMAT),
            target('output', AREA_SHADOW_FORMAT),
        ];
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }

    /** A leitura da sombra da luz de área em `light_visibility` (as outras luzes ficam com 1 nela). */
    getSceneContributions(): readonly SceneContribution[] {
        return [{ point: lightVisibilityPoint, order: 1, pools: [], build: () => areaShadowRead }];
    }
}
