import type { Entity } from '../../core/Entity';
import type { RenderQueue } from '../RenderQueue';
import { Geometry } from '../../components/Geometry';
import { Material } from '../../components/Material';
import type { Transform } from '../../math/Transform';
import { NULL_TRANSFORM } from '../../math/NullTransform';
import type { RenderCommand } from '../RenderQueue';
import { mat4, vec3 } from 'gl-matrix';
import type { ExtractionStrategy } from './ExtractionStrategy';
import { Loggable } from '../../../core/debug/Loggable';
import { Logger } from '../../../core/debug/Logger';

/**
 * Estratégia concreta para extrair as malhas (Geometry + Material).
 */
@Loggable('MeshExtraction')
export class MeshExtractionStrategy implements ExtractionStrategy {
    declare private readonly log: Logger;
    private tempObjPos: vec3 = vec3.create();
    private tempCameraPos: vec3 = vec3.create();

    public extract(entity: Entity, queue: RenderQueue, cameraWorldPos?: vec3): void {
        const geometry = entity.getComponent<Geometry>('Geometry');
        const material = entity.getComponent<Material>('Material');

        if (!geometry || !material) {
            if (entity.name !== 'Entity') {
                this.log.debug(`Ignorado id:${entity.id} name:"${entity.name}" — geometry:${!!geometry} material:${!!material}`);
            }
            return;
        }

        if (!geometry.vertexBufferId) {
            this.log.warn(`id:${entity.id} name:"${entity.name}" sem vertexBufferId — state:${geometry.state}`);
        }

        // Null Object — elimina verificação null; worldMatrix é identidade se não há Transform
        const transform = entity.getComponent<Transform>('Transform') ?? NULL_TRANSFORM;

        const worldMatrix = queue.acquireFloat32(16);
        worldMatrix.set(transform.worldMatrix);

        const transparent    = material.transparent;
        const pipelineHashId = `${material.shaderId}|${material.topology}${transparent ? '|t' : ''}`;

        // Para vertex pulling: vertexCount = número de arestas (o renderer faz draw(edges * 6))
        const vertexCount = material.useVertexPulling && geometry.wireframeEdgeCount > 0
            ? geometry.wireframeEdgeCount
            : geometry.vertexCount;

        const command: RenderCommand = {
            pipelineHashId,
            materialLayoutId:  material.shaderId,
            geometryId:        geometry.vertexBufferId,
            ...(geometry.indexBufferId !== undefined ? { indexBufferId: geometry.indexBufferId } : {}),
            vertexCount,
            instanceCount:     geometry.instanceCount,
            vertexLayout:      geometry.layout,
            topology:          material.topology,
            materialBindGroupIds: material.bindGroupIds.slice(),
            worldMatrix,
            distanceToCamera: 0,
            entityId:          entity.id,
            ...(material.useVertexPulling ? { useVertexPulling: true } : {}),
            ...(geometry.wireframePositionsBufferId ? { wireframePositionsBufferId: geometry.wireframePositionsBufferId } : {}),
            ...(geometry.wireframeEdgesBufferId     ? { wireframeEdgesBufferId:     geometry.wireframeEdgesBufferId     } : {}),
        };

        if (material.transparent) {
            if (cameraWorldPos) {
                vec3.copy(this.tempCameraPos, cameraWorldPos);
                mat4.getTranslation(this.tempObjPos, transform.worldMatrix);
                command.distanceToCamera = vec3.sqrDist(this.tempCameraPos, this.tempObjPos);
            }
            queue.transparentList.push(command);
        } else {
            let group = queue.opaqueGroups.get(command.pipelineHashId);
            if (!group) {
                group = [];
                queue.opaqueGroups.set(command.pipelineHashId, group);
            }
            group.push(command);
        }
    }
}
