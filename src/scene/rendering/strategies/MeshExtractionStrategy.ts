import { Entity } from '../../core/Entity';
import { RenderExtractor } from '../RenderExtractor';
import { Geometry } from '../../components/Geometry';
import { Material } from '../../components/Material';
import type { RenderCommand } from '../IRenderQueue';
import { mat4, vec3 } from 'gl-matrix';
import type { ExtractionStrategy } from './ExtractionStrategy';

/**
 * Estratégia concreta para extrair as malhas (Geometry + Material).
 */
export class MeshExtractionStrategy implements ExtractionStrategy {
    private _tempObjPos: vec3 = vec3.create();
    private _tempCameraPos: vec3 = vec3.create();

    public extract(entity: Entity, extractor: RenderExtractor, cameraWorldPos?: vec3): void {
        const geometry = entity.getComponent<Geometry>('Geometry');
        const material = entity.getComponent<Material>('Material');

        if (!geometry || !material) return;

        const command: RenderCommand = {
            pipelineHashId: material.shaderId,
            geometryId: geometry.vertexBufferId,
            vertexCount: geometry.vertexCount,
            instanceCount: geometry.instanceCount,
            materialBindGroupIds: material.bindGroupIds.slice(), // clonagem de segurança
            worldMatrix: new Float32Array(entity.worldMatrix),
            distanceToCamera: 0
        };

        if (material.transparent) {
            if (cameraWorldPos) {
                vec3.copy(this._tempCameraPos, cameraWorldPos);
                mat4.getTranslation(this._tempObjPos, entity.worldMatrix);
                command.distanceToCamera = vec3.sqrDist(this._tempCameraPos, this._tempObjPos);
            }
            extractor.transparentList.push(command);
        } else {
            let group = extractor.opaqueGroups.get(material.shaderId);
            if (!group) {
                group = [];
                extractor.opaqueGroups.set(material.shaderId, group);
            }
            group.push(command);
        }
    }
}
