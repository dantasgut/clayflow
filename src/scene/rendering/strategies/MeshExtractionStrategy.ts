import type { Entity } from '../../core/Entity';
import type { RenderQueue } from '../RenderQueue';
import { Geometry } from '../../components/Geometry';
import { Material } from '../../components/Material';
import type { Transform } from '../../math/Transform';
import { NULL_TRANSFORM } from '../../math/NullTransform';
import type { RenderCommand } from '../RenderQueue';
import { mat4, vec3 } from 'gl-matrix';
import type { ExtractionStrategy } from './ExtractionStrategy';

/**
 * Estratégia concreta para extrair as malhas (Geometry + Material).
 */
export class MeshExtractionStrategy implements ExtractionStrategy {
    private _tempObjPos: vec3 = vec3.create();
    private _tempCameraPos: vec3 = vec3.create();

    public extract(entity: Entity, queue: RenderQueue, cameraWorldPos?: vec3): void {
        const geometry = entity.getComponent<Geometry>('Geometry');
        const material = entity.getComponent<Material>('Material');

        if (!geometry || !material) return;

        // Null Object — elimina verificação null; worldMatrix é identidade se não há Transform
        const transform = entity.getComponent<Transform>('Transform') ?? NULL_TRANSFORM;

        const worldMatrix = queue.acquireFloat32(16);
        worldMatrix.set(transform.worldMatrix);

        const command: RenderCommand = {
            pipelineHashId: material.shaderId,
            geometryId: geometry.vertexBufferId,
            vertexCount: geometry.vertexCount,
            instanceCount: geometry.instanceCount,
            materialBindGroupIds: material.bindGroupIds.slice(),
            worldMatrix,
            distanceToCamera: 0
        };

        if (material.transparent) {
            if (cameraWorldPos) {
                vec3.copy(this._tempCameraPos, cameraWorldPos);
                mat4.getTranslation(this._tempObjPos, transform.worldMatrix);
                command.distanceToCamera = vec3.sqrDist(this._tempCameraPos, this._tempObjPos);
            }
            queue.transparentList.push(command);
        } else {
            let group = queue.opaqueGroups.get(material.shaderId);
            if (!group) {
                group = [];
                queue.opaqueGroups.set(material.shaderId, group);
            }
            group.push(command);
        }
    }
}
