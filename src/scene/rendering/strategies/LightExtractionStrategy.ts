import type { Entity } from '../../core/Entity';
import type { RenderQueue } from '../RenderQueue';
import { Light, PointLight, DirectionalLight, LightType } from '../../lights/Light';
import type { Transform } from '../../math/Transform';
import { NULL_TRANSFORM } from '../../math/NullTransform';
import { mat4, vec3 } from 'gl-matrix';
import type { ExtractionStrategy } from './ExtractionStrategy';

/**
 * Estratégia concreta para extrair dados do componente Light.
 */
export class LightExtractionStrategy implements ExtractionStrategy {
    private tempObjPos: vec3 = vec3.create();

    public extract(entity: Entity, queue: RenderQueue, _cameraWorldPos?: vec3): void {
        const light = entity.getComponent<Light>('Light');
        if (!light) return;

        // Null Object — usa identidade se não há Transform
        const transform = entity.getComponent<Transform>('Transform') ?? NULL_TRANSFORM;
        mat4.getTranslation(this.tempObjPos, transform.worldMatrix);

        let distance = 0;
        let decay = 0;
        if (light.lightType === LightType.Point) {
            distance = (light as PointLight).distance;
            decay = (light as PointLight).decay;
        }

        const color = queue.acquireFloat32(3);
        color.set(light.color);

        const worldPosition = queue.acquireFloat32(3);
        worldPosition.set(this.tempObjPos);

        const direction = queue.acquireFloat32(3);
        if (light.lightType === LightType.Directional) {
            direction.set((light as DirectionalLight).direction);
        }

        queue.lights.push({
            type: light.lightType,
            color,
            intensity: light.intensity,
            worldPosition,
            direction,
            distance,
            decay
        });
    }
}
