import type { Scene } from '../core/Scene';
import type { Entity } from '../core/Entity';
import type { ResourceManager } from '../../core/interfaces/ResourceManager';
import { Geometry } from '../components/Geometry';
import { Material } from '../components/Material';
import { ResourceState } from '../core/ResourceState';

/**
 * Sistema focado na Camada 2 (ResourceLoader).
 * Ele varre a Cena procurando por Componentes Lógicos (Geometry e Material)
 * que estejam nos estados `Uninitialized` ou `Dirty`.
 * Quando encontrados, o Loader despacha os arrays crus (Float32Array) para 
 * a Camada 1 (ResourceManager), obtém os IDs reais de Buffers da placa de vídeo
 * e atualiza o estado do Componente para `Ready`.
 */
export class ResourceLoader {
    public async load(scene: Scene, resourceManager: ResourceManager): Promise<void> {
        const promises: Promise<void>[] = [];

        scene.traverse((entity: Entity) => {
            if (!entity.visible) return;

            promises.push(this._processGeometry(entity, resourceManager));
            promises.push(this._processMaterial(entity, resourceManager));
        });

        await Promise.all(promises);
    }

    private async _processGeometry(entity: Entity, resourceManager: ResourceManager): Promise<void> {
        const geometry = entity.getComponent<Geometry>('Geometry');
        if (!geometry) return;

        if (geometry.state === ResourceState.Uninitialized) {
            geometry.state = ResourceState.Loading;

            const uploadPromises: Promise<void>[] = [];

            if (geometry.rawVertices) {
                const vbo = resourceManager.buffers.createVertexBuffer('geom_vbo_' + geometry.uuid, geometry.rawVertices.byteLength);
                geometry.vertexBufferId = vbo.id;
                uploadPromises.push(resourceManager.buffers.uploadStagedAsync(vbo.id, geometry.rawVertices));
            }

            if (geometry.rawIndices) {
                const ibo = resourceManager.buffers.createIndexBuffer('geom_ibo_' + geometry.uuid, geometry.rawIndices.byteLength);
                geometry.indexBufferId = ibo.id;
                uploadPromises.push(resourceManager.buffers.uploadStagedAsync(ibo.id, geometry.rawIndices));
            }

            await Promise.all(uploadPromises);

            // Opcional: Liberar memória RAM pesada se o motor não prevê leitura em CPU constante
            // geometry.rawVertices = null;
            // geometry.rawIndices = null;

            geometry.state = ResourceState.Ready;

        } else if (geometry.state === ResourceState.Dirty) {
            const uploadPromises: Promise<void>[] = [];

            if (geometry.rawVertices && geometry.vertexBufferId) {
                uploadPromises.push(resourceManager.buffers.uploadStagedAsync(geometry.vertexBufferId, geometry.rawVertices));
            }
            if (geometry.rawIndices && geometry.indexBufferId) {
                uploadPromises.push(resourceManager.buffers.uploadStagedAsync(geometry.indexBufferId, geometry.rawIndices));
            }

            await Promise.all(uploadPromises);
            
            geometry.state = ResourceState.Ready;
        } else if (geometry.state === ResourceState.Disposed) {
            // Todo: Instruir a Layer 1 a destruir buffers e clean up
            // geometry.vertexBufferId = null;
        }
    }

    private async _processMaterial(entity: Entity, resourceManager: ResourceManager): Promise<void> {
        const material = entity.getComponent<Material>('Material');
        if (!material) return;

        if (material.state === ResourceState.Uninitialized) {
            material.state = ResourceState.Loading;

            // Por enquanto, consideramos os buffers PBR básicos e BindGroup 0 padrão
            // (Esta lógica ficaria mais complexa gerada atráves do tipo do material)
            const uniformData = material.rawUniforms.get('std_mat_buf');
            
            if (uniformData && material.shaderId) {
                const uniformBuffer = resourceManager.buffers.createUniformBuffer('mat_ubo_' + material.uuid, uniformData.byteLength);
                resourceManager.buffers.writeBuffer(uniformBuffer.id, uniformData);

                const bindGroup = resourceManager.bindings.getBindGroup('mat_bg_' + material.uuid, material.shaderId, [
                    { binding: 0, resource: { buffer: uniformBuffer.native } }
                ]);
                
                // Salva a identificação de bindings final
                material.bindGroupIds.push(bindGroup.id);
            }

            material.state = ResourceState.Ready;

        } else if (material.state === ResourceState.Dirty) {
            // Em tese localizamos o ubo associado pelo bindGroup e atualizamos com writeBuffer
            material.state = ResourceState.Ready;
        }
    }
}
