import { mat4, vec3, quat } from 'gl-matrix';
import type { Entity } from '../core/Entity';
import type { Component } from '../core/Component';

/**
 * Componente Lógico responsável EXCLUSIVAMENTE pela Matemática Espacial.
 * Resolve posição, rotação, escala e parentesco (Álgebra Linear Pura/Composite).
 */
export class Transform implements Component {
    public readonly type = 'Transform';

    // Transformações Ativas Locais
    public position: vec3 = vec3.create();
    public rotation: quat = quat.create();
    public scale: vec3 = vec3.fromValues(1, 1, 1);

    // Transformações Globais em cascata (DoD Extractor usa isso)
    public localMatrix: mat4 = mat4.create();
    public worldMatrix: mat4 = mat4.create();

    // Árvore Math do Grafo
    public parent: Transform | null = null;
    public children: Transform[] = [];

    // Otimização de GPU (Dirty Flag Pattern)
    public matrixWorldNeedsUpdate: boolean = true;

    // A Entidade (Entity) dona desta matemática
    public owner: Entity | null = null;

    // Callbacks disparados toda vez que a worldMatrix deste nó é recalculada
    public onUpdateMatrixCallbacks: Array<(worldMatrix: mat4) => void> = [];

    public onAttach(entity: Entity): void {
        this.owner = entity;
    }

    public onDetach(entity: Entity): void {
        this.owner = null;
    }

    /**
     * Adiciona um Transform filho.
     */
    public add(childTransform: Transform): this {
        if (childTransform === this) {
            console.error(`[Transform] Tentativa de adicionar a si mesmo.`);
            return this;
        }

        if (childTransform.parent !== null) {
            childTransform.parent.remove(childTransform);
        }

        childTransform.parent = this;
        this.children.push(childTransform);
        return this;
    }

    public remove(childTransform: Transform): this {
        const index = this.children.indexOf(childTransform);
        if (index !== -1) {
            childTransform.parent = null;
            this.children.splice(index, 1);
        }
        return this;
    }

    /**
     * Calcula as matrizes correndo a árvore.
     */
    public updateWorldMatrix(updateParents: boolean = false, updateChildren: boolean = true): void {
        const parent = this.parent;
        
        if (updateParents && parent !== null) {
            parent.updateWorldMatrix(true, false);
        }

        mat4.fromRotationTranslationScale(this.localMatrix, this.rotation, this.position, this.scale);

        if (parent === null) {
            mat4.copy(this.worldMatrix, this.localMatrix);
        } else {
            mat4.multiply(this.worldMatrix, parent.worldMatrix, this.localMatrix);
        }

        // Dispara os callbacks registrados avisando que a matriz mudou
        for (let i = 0; i < this.onUpdateMatrixCallbacks.length; i++) {
            const callback = this.onUpdateMatrixCallbacks[i];
            if (callback) {
                callback(this.worldMatrix);
            }
        }

        this.matrixWorldNeedsUpdate = false;

        if (updateChildren) {
            for (let i = 0; i < this.children.length; i++) {
                const child = this.children[i];
                if (child) {
                    child.matrixWorldNeedsUpdate = true;
                    child.updateWorldMatrix(false, true);
                }
            }
        }
    }
}
