import { Entity } from '../core/Entity';
import { vec3 } from 'gl-matrix';

export enum LightType {
    Directional,
    Point,
    Ambient
}

/**
 * Entidade de Iluminação. (Camada 2 - Representação)
 * Contém a cor e a intensidade. Sua posição/direção é herdada do Entity.
 */
export class Light extends Entity {
    public isLight: boolean = true;
    public lightType: LightType;
    
    public color: vec3;
    public intensity: number;

    constructor(type: LightType, color: [number, number, number] = [1, 1, 1], intensity: number = 1.0) {
        super();
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
    // A direção é resolvida pela rotação/posição do Entity apontando para um "target" (na Camada 3)
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
