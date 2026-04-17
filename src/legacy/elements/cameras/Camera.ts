import { mat4, vec3 } from 'gl-matrix';
import { Entity }          from '../../scene/core/Entity';
import { Transform }       from '../../scene/math/Transform';
import { CameraComponent } from '../../scene/cameras/Camera';

/**
 * Aggregate root de câmera. (Camada 3)
 * Empacota Entity + Transform + CameraComponent — o usuário nunca vê a entidade hospedeira.
 *
 * Subclasses concretas: PerspectiveCamera, OrthographicCamera.
 */
export abstract class Camera extends Entity {
    protected readonly transform: Transform;
    protected readonly cam: CameraComponent;

    constructor() {
        super();
        this.transform = new Transform();
        this.cam       = new CameraComponent();
        this.add(this.transform);
        this.add(this.cam);
    }

    /** Posição da câmera no mundo (atalho direto para transform.position). */
    get position(): vec3 {
        return this.transform.position;
    }

    get viewProjectionMatrix(): mat4 {
        return this.cam.viewProjectionMatrix;
    }

    get projectionMatrix(): mat4 {
        return this.cam.projectionMatrix;
    }

    /** Recalcula as matrizes de mundo e visão. Chamado pelo renderer a cada frame. */
    updateMatrices(): void {
        this.transform.updateWorldMatrix(false, false);
    }
}
