import { Entity } from '../../core/Entity';
import { RenderExtractor } from '../RenderExtractor';
import { Light, PointLight, LightType } from '../../lights/Light';
import type { Transform } from '../../math/Transform';
import { mat4, vec3 } from 'gl-matrix';
import type { ExtractionStrategy } from './ExtractionStrategy';

/**
 * Estratégia concreta para extrair dados do componente Light.
 */
export class LightExtractionStrategy implements ExtractionStrategy {
    private _tempObjPos: vec3 = vec3.create();

    public extract(entity: Entity, extractor: RenderExtractor, cameraWorldPos?: vec3): void {
        const light = entity.getComponent<Light>('Light');
        if (!light) return;

        const transform = entity.getComponent<Transform>('Transform');
        if (transform) {
            mat4.getTranslation(this._tempObjPos, transform.worldMatrix);
        } else {
            vec3.set(this._tempObjPos, 0, 0, 0);
        }

        let distance = 0;
        let decay = 0;
        
        if (light.lightType === LightType.Point) {
            distance = (light as PointLight).distance;
            decay = (light as PointLight).decay;
        }

        // Acessamos o array público de luzes do Extrator pai
        extractor.lights.push({
            type: light.lightType,
            color: new Float32Array(light.color),
            intensity: light.intensity,
            worldPosition: new Float32Array(this._tempObjPos),
            distance: distance,
            decay: decay
        });
    }
}
