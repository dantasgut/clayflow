import { Entity } from '../../scene/contracts/Entity';
import { ResourceState } from '../../scene/contracts/ResourceState';
import type { Resource } from '../../scene/contracts/Resource';
import type { GPUDescriptor } from '../../scene/descriptors/GPUDescriptor';
import type { PipelineDescriptor } from '../../scene/descriptors/PipelineDescriptor';
import { HemisphereLightSchema } from './HemisphereLightSchema';
import type { SceneContribution } from '../../scene/shaders/WgslPoint';
import {
    hemisphereAmbientContribution,
    hemisphereBackgroundContribution,
    hemisphereContribution,
    hemisphereEnvironmentContribution,
} from './points/lightContributions';

/** Valores de uma `HemisphereLight`. */
export interface HemisphereLightValues {
    /** Radiância relativa do céu (RGBA linear). Default `[0.8, 0.9, 1, 1]`. */
    readonly skyColor?: readonly number[];
    /** Radiância relativa do chão (RGBA linear). Default `[0.35, 0.3, 0.25, 1]`. */
    readonly groundColor?: readonly number[];
    /** Intensidade (nits) que multiplica as duas cores. Default 0,3. */
    readonly intensity?: number;
    /** Eixo "para cima" do hemisfério. Default `[0, 1, 0, 0]`. */
    readonly up?: readonly number[];
    /**
     * O hemisfério também é o fundo visível (spec 034): a câmera vê atrás da cena o céu e o chão que a água e o vidro
     * refletem e refratam. Default `false` (o fundo é a cor da limpeza, ou o `Sky`).
     */
    readonly background?: boolean;
}

/** Dado de uma `HemisphereLight` (layout de `HemisphereLight.schema`). */
export interface HemisphereLightData {
    /** Cor do céu. */
    skyColor: number[];
    /** Cor do chão. */
    groundColor: number[];
    /** Eixo para cima. */
    up: number[];
    /** Intensidade. */
    intensity: number;
}

/**
 * Luz ambiente de hemisfério (spec 011): um céu e um chão de radiâncias uniformes em torno do eixo `up` — no lugar da
 * constante de ambiente escondida. O difuso recebe a irradiância exata do hemisfério na normal; os especulares, a
 * radiância na direção refletida. É uma aproximação, não luz rebatida (a iluminação global é da 033). Uma por cena,
 * inserida pelos estágios padrão e exposta em `defaults.ambient`; ajustável e removível (sem ela, só as luzes diretas
 * iluminam).
 */
export class HemisphereLight extends Entity<HemisphereLightData> implements Resource {
    /** Parâmetros do hemisfério (uniform, enviado a cada mutação). */
    static readonly schema = HemisphereLightSchema;

    state: ResourceState = ResourceState.Uninitialized;

    private showBackground: boolean;

    constructor(values: HemisphereLightValues = {}) {
        super();
        this.showBackground = values.background ?? false;
        this.data = {
            skyColor: [...(values.skyColor ?? [0.8, 0.9, 1, 1])],
            groundColor: [...(values.groundColor ?? [0.35, 0.3, 0.25, 1])],
            up: [...(values.up ?? [0, 1, 0, 0])],
            intensity: values.intensity ?? 0.3,
        };
    }

    /** O hemisfério é o fundo visível? */
    get background(): boolean {
        return this.showBackground;
    }

    /** Liga ou desliga o hemisfério como fundo visível (a composição dos pontos de cena se refaz no envio). */
    set background(on: boolean) {
        if (on === this.showBackground) return;
        this.showBackground = on;
        this.data = { ...this.rawData };
    }

    getDescriptors(): readonly GPUDescriptor[] {
        return [{ id: 'params', role: 'uniform', schema: HemisphereLight.schema }];
    }

    getPipelineDescriptors(): readonly PipelineDescriptor[] {
        return [];
    }

    /**
     * O hemisfério no ponto `scene_direct_lighting`, para os meios participantes em `scene_ambient` (spec 033) e, para
     * quem traça raios, em `scene_environment` (o ambiente visto ao escapar, spec 034 T065f) e, o mesmo céu e chão, em
     * `scene_background` (o fundo visível, T066) quando `background` está ligado.
     */
    getSceneContributions(): readonly SceneContribution[] {
        return [
            hemisphereContribution,
            hemisphereAmbientContribution,
            hemisphereEnvironmentContribution,
            this.backgroundContribution,
        ];
    }

    private readonly backgroundContribution = hemisphereBackgroundContribution(
        () => this.showBackground,
    );
}
