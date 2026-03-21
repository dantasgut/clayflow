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
    protected readonly _transform: Transform;
    protected readonly _cam: CameraComponent;

    constructor() {
        super();
        this._transform = new Transform();
        this._cam       = new CameraComponent();
        this.add(this._transform);
        this.add(this._cam);
    }

    /** Posição da câmera no mundo (atalho direto para transform.position). */
    get position(): vec3 {
        return this._transform.position;
    }

    get viewProjectionMatrix(): mat4 {
        return this._cam.viewProjectionMatrix;
    }

    get projectionMatrix(): mat4 {
        return this._cam.projectionMatrix;
    }

    /** Recalcula as matrizes de mundo e visão. Chamado pelo renderer a cada frame. */
    updateMatrices(): void {
        this._transform.updateWorldMatrix(false, false);
    }
}
