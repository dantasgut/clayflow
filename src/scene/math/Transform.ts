import { mat4, vec3, quat } from 'gl-matrix';
import type { Entity } from '../core/Entity';
import type { Component } from '../core/Component';
import { ResourceType } from '../core/ResourceType';

/**
 * Componente Lógico responsável EXCLUSIVAMENTE pela Matemática Espacial.
 * Resolve posição, rotação, escala e parentesco (Álgebra Linear Pura/Composite).
 */
export class Transform implements Component {
    public readonly layer = ResourceType.VISUAL_COMPONENT;
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

    private matrixCallbacks: Array<(worldMatrix: mat4) => void> = [];

    /**
     * Registra um listener para quando a worldMatrix for recalculada.
     * Retorna uma função de cancelamento (unsubscribe).
     */
    public onMatrixUpdate(cb: (worldMatrix: mat4) => void): () => void {
        this.matrixCallbacks.push(cb);
        return () => {
            this.matrixCallbacks = this.matrixCallbacks.filter(fn => fn !== cb);
        };
    }

    public onAttach(entity: Entity): void {
        this.owner = entity;
        // O Componente Transform assina proativamente o barramento do Dono (Entidade).
        this.owner.addEventListener('child_added', this.handleChildAdded);
        this.owner.addEventListener('child_removed', this.handleChildRemoved);
        
        // CUIDADO RETROATIVO: Se o Transform foi adicionado ATRASADO na Entidade, ele varre os
        // filhos que já existiam na entidade Lógica e arrasta eles pro Grafo Espacial retroativamente.
        for (let i = 0; i < this.owner.children.length; i++) {
            this.handleChildAdded({ child: this.owner.children[i] });
        }
    }

    public onDetach(entity: Entity): void {
        if (this.owner) {
            this.owner.removeEventListener('child_added', this.handleChildAdded);
            this.owner.removeEventListener('child_removed', this.handleChildRemoved);
            this.owner = null;
        }
    }

    // ==========================================
    // PADRÃO OBSERVER (Reatividade ECS Pura)
    // ==========================================

    private handleChildAdded = (event: any) => {
        const childEntity = event.child as Entity;
        const childTransform = childEntity.getComponent<Transform>('Transform');
        
        // Se a nova Entidade "Filha" lógica possuir um coração Espacial (Transform)...
        if (childTransform) {
            this.add(childTransform); // ...O meu transform puxa o transform do filho pra debaixo da minha Matriz.
        }
    };

    private handleChildRemoved = (event: any) => {
        const childEntity = event.child as Entity;
        const childTransform = childEntity.getComponent<Transform>('Transform');
        
        if (childTransform) {
            this.remove(childTransform); // Quebra o galho matemático.
        }
    };

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

        for (let i = 0; i < this.matrixCallbacks.length; i++) {
            this.matrixCallbacks[i]!(this.worldMatrix);
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
