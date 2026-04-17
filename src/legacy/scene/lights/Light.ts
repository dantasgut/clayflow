import { vec3 } from 'gl-matrix';
import type { Component } from '../core/Component';
import { ResourceType } from '../core/ResourceType';

export enum LightType {
    Directional,
    Point,
    Ambient
}

/**
 * Componente de Iluminação. (Camada 2 - Representação - ECS Puro)
 * Contém a cor e a intensidade. Sua posição/direção será lida do Transform da Entidade à qual está anexado.
 */
export class Light implements Component {
    public readonly layer = ResourceType.VISUAL_COMPONENT;
    public readonly type: string = 'Light';
    public lightType: LightType;

    public color: vec3;
    public intensity: number;

    constructor(type: LightType, color: [number, number, number] = [1, 1, 1], intensity: number = 1.0) {
        this.lightType = type;
        this.color = vec3.fromValues(color[0], color[1], color[2]);
        this.intensity = intensity;
    }
}

export class AmbientLight extends Light {
    constructor(color: [number, number, number] = [1, 1, 1], intensity: number = 1.0) {
        super(LightType.Ambient, color, intensity);
    }
}

export class DirectionalLight extends Light {
    /** Direção normalizada para a qual a luz aponta (espaço mundo). Padrão: levemente à direita e acima. */
    public direction: vec3 = vec3.normalize(vec3.create(), vec3.fromValues(0.5, -1.0, -0.3));

    constructor(color: [number, number, number] = [1, 1, 1], intensity: number = 1.0) {
        super(LightType.Directional, color, intensity);
    }
}

export class PointLight extends Light {
    public distance: number; // Raio de alcance da luz (0 = infinito)
    public decay: number;    // Como a luz perde força com a distância

    constructor(color: [number, number, number] = [1, 1, 1], intensity: number = 1.0, distance: number = 0, decay: number = 2) {
        super(LightType.Point, color, intensity);
        this.distance = distance;
        this.decay = decay;
    }
}
