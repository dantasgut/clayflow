import { Entity } from '../../../scene/contracts/Entity';
import { ResourceState } from '../../../scene/contracts/ResourceState';
import type { Resource } from '../../../scene/contracts/Resource';
import type { GPUDescriptor } from '../../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../../scene/descriptors/PipelineDescriptor';
import { FieldType } from '../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../scene/descriptors/StructSchema';

/**
 * Amostras do perfil por pixel, padrão e teto (o do laço no WGSL, `SUBSURFACE_MAX_SAMPLES`). Os conjuntos de amostras se
 * repetem a cada 4 × 4 pixels e a soma à cor faz a média do bloco: cada pixel recebe 16 vezes esse número.
 */
export const SUBSURFACE_DEFAULT_SAMPLES = 16;
export const SUBSURFACE_MAX_SAMPLES = 64;

/** Formato da luz guardada por pixel (a irradiância difusa sobre π, linear, sem corte). */
export const SUBSURFACE_IRRADIANCE_FORMAT: GPUTextureFormat = 'rgba16float';

/** Valores de um `Subsurface`. */
export interface SubsurfaceValues {
    /** Liga a difusão entre pixels e a luz que atravessa. Default `true`. */
    readonly enabled?: boolean;
    /** Amostras do perfil por pixel, em 1–64. Default 16. */
    readonly samples?: number;
}

/** Dado de um `Subsurface` (lido pelo desenho ao preparar os pipelines). */
export interface SubsurfaceData {
    /** 1 ligado, 0 desligado. */
    enabled: number;
    /** Amostras do perfil por pixel. */
    samples: number;
}

/**
 * Valida os valores de autoria.
 * @throws RangeError fora dos intervalos documentados.
 */
function validate(d: SubsurfaceData): void {
    const n = d.samples;
    if (!Number.isInteger(n) || n < 1 || n > SUBSURFACE_MAX_SAMPLES)
        throw new RangeError(`Subsurface: samples ${n} fora de 1–${SUBSURFACE_MAX_SAMPLES}.`);
}

/**
 * Espalhamento sob a superfície (Camada 3, spec 011, T113): a luz que entra nos materiais com o lobo de subsuperfície
 * (`bsdf.subsurface`: pele, cera, mármore) e sai em volta do ponto de entrada. Depois do passe principal, o desenho
 * refaz as entidades com o lobo e guarda por pixel a luz que entra — `irradiance`: a irradiância difusa da frente mais a
 * que atravessa o corpo vinda das luzes do outro lado (a espessura pelo mapa de sombra da luz); `exit`: o que do lobo
 * sai para quem vê (o albedo e as camadas de cima); `local`: a da frente pela saída, o que o passe principal já
 * desenhou — com a profundidade própria (`depth`); junta essa luz em volta de cada ponto pelo perfil de difusão de Burley do
 * material (o caminho livre médio em mm por canal, levado à tela pela escala do mundo e pela profundidade), com um
 * número constante de amostras por pixel, em `diffused`; e soma à cor da cena a média de `diffused` na vizinhança da
 * mesma superfície, pela saída, menos a luz do próprio ponto. O especular não entra: é do passe principal. Os alvos têm o tamanho do canvas e são alocados sob demanda, por quem desenha um material com o lobo;
 * sem um deles na cena, nada é alocado nem preparado. Um por cena (os estágios padrão inserem o do `Renderer` com o
 * primeiro material com subsuperfície); desligado, o lobo responde só no ponto (o difuso do perfil integrado).
 */
export class Subsurface extends Entity<SubsurfaceData> implements Resource {
    /** Identidade na cena e os valores lidos pelo desenho (sem dado de GPU próprio). */
    static readonly schema = new StructSchema('Subsurface', {
        enabled: FieldType.u32,
        samples: FieldType.u32,
    });

    state: ResourceState = ResourceState.Uninitialized;

    constructor(values: SubsurfaceValues = {}) {
        super();
        const data = {
            enabled: values.enabled === false ? 0 : 1,
            samples: values.samples ?? SUBSURFACE_DEFAULT_SAMPLES,
        };
        validate(data);
        this.data = data;
    }

    /** Liga ou desliga a difusão e a luz que atravessa. */
    get enabled(): boolean {
        return this.data.enabled === 1;
    }

    set enabled(on: boolean) {
        this.data.enabled = on ? 1 : 0;
    }

    /** Amostras do perfil por pixel, em 1–64. */
    get samples(): number {
        return this.data.samples;
    }

    /** @throws RangeError fora de 1–64 (o valor anterior fica). */
    set samples(n: number) {
        validate({ ...this.rawData, samples: n });
        this.data.samples = n;
    }

    getDescriptors(): readonly GPUDescriptor[] {
        const target = (id: string, format: GPUTextureFormat): GPUDescriptor => ({
            id,
            role: 'texture',
            allocation: 'onDemand',
            textureShape: { format, sizeFromCanvas: true },
        });
        return [
            target('irradiance', SUBSURFACE_IRRADIANCE_FORMAT),
            target('local', SUBSURFACE_IRRADIANCE_FORMAT),
            target('exit', SUBSURFACE_IRRADIANCE_FORMAT),
            target('depth', 'depth24plus'),
            target('diffused', SUBSURFACE_IRRADIANCE_FORMAT),
        ];
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }
}
