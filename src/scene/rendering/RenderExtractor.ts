import { Entity } from '../core/Entity';
import { Scene } from '../core/Scene';
import { Light, PointLight, LightType } from '../lights/Light';
import { Camera } from '../cameras/Camera';
import { Geometry } from '../components/Geometry';
import { Material } from '../components/Material';
import type { RenderCommand, IRenderQueue, RenderLight } from './IRenderQueue';
import { mat4, vec3 } from 'gl-matrix';

/**
 * O Funil (Extrator de Cena).
 * Percorre a Scene orientada a objetos (Camada 2) e gera Arrays Lineares (DoD)
 * para a Camada 3 consumir.
 */
export class RenderExtractor implements IRenderQueue {
    public readonly opaqueGroups: Map<string, RenderCommand[]> = new Map();
    public readonly transparentList: RenderCommand[] = [];
    public readonly lights: RenderLight[] = [];

    // Temporarios para calculos matemáticos e evitar criação de lixo no GC
    private _tempCameraPos: vec3 = vec3.create();
    private _tempObjPos: vec3 = vec3.create();

    public clear(): void {
        this.opaqueGroups.clear();
        this.transparentList.length = 0;
        this.lights.length = 0;
    }

    /**
     * O Método Mestre. Passa o Rodo na Cena.
     * Deve ser chamado sempre que uma RenderPass for iniciar.
     */
    public extract(scene: Scene, cameraWorldPos?: vec3): void {
        this.clear();
        
        // Garante que a matemática global está 100% calculada
        scene.preRenderUpdate();

        if (cameraWorldPos) {
            vec3.copy(this._tempCameraPos, cameraWorldPos);
        }

        scene.traverse((entity: Entity) => {
            if (!entity.visible) return;

            // --- 1. Extração de Luz ---
            if ((entity as any).isLight) {
                const light = entity as Light;
                mat4.getTranslation(this._tempObjPos, light.worldMatrix);

                let distance = 0;
                let decay = 0;
                
                if (light.lightType === LightType.Point) {
                    distance = (light as PointLight).distance;
                    decay = (light as PointLight).decay;
                }

                this.lights.push({
                    type: light.lightType,
                    color: new Float32Array(light.color),
                    intensity: light.intensity,
                    worldPosition: new Float32Array(this._tempObjPos),
                    distance: distance,
                    decay: decay
                });
                
                // Luzes não tem geometria para desenhar (a não ser que quiséssemos um Gizmo de debug)
                return;
            }

            // --- 2. Extração de Malhas Visuais ---
            // Busca os componentes lógicos necessários para renderização
            const geometry = entity.getComponent<Geometry>('Geometry');
            const material = entity.getComponent<Material>('Material');

            if (geometry && material) {
                // Monta a Struct Plana (Data Oriented)
                const command: RenderCommand = {
                    pipelineHashId: material.shaderId,
                    geometryId: geometry.vertexBufferId,
                    vertexCount: geometry.vertexCount,
                    instanceCount: geometry.instanceCount,
                    materialBindGroupIds: material.bindGroupIds.slice(), // clonagem de segurança
                    
                    // Copiamos a matriz isolada. A partir de agora, mesmo que o Node na cena
                    // sofra translação, este frame de renderização usará a foto estática!
                    worldMatrix: new Float32Array(entity.worldMatrix),
                    distanceToCamera: 0
                };

                // Lógica de aglomeração Opaque vs Transparent
                if (material.transparent) {
                    if (cameraWorldPos) {
                        // Calcula a distancia pra Z-Sort (Essencial em Transparencia)
                        mat4.getTranslation(this._tempObjPos, entity.worldMatrix);
                        command.distanceToCamera = vec3.sqrDist(this._tempCameraPos, this._tempObjPos);
                    }
                    this.transparentList.push(command);
                } else {
                    let group = this.opaqueGroups.get(material.shaderId);
                    if (!group) {
                        group = [];
                        this.opaqueGroups.set(material.shaderId, group);
                    }
                    group.push(command);
                }
            }
        });

        // Ordenar os transparentes Back-to-Front
        if (this.transparentList.length > 0) {
            this.transparentList.sort((a, b) => b.distanceToCamera - a.distanceToCamera);
        }
    }
}
