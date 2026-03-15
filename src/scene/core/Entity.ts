import { EventDispatcher } from '../core/EventDispatcher';
import { Transform } from '../math/Transform';
import type { Component } from './Component';
import type { Physic } from './Physic';

/**
 * A Entidade (Container ECS Lógico Puro).
 * Responsabilidade Única: Segurar Componentes e Relacionar Filhos Lógicamente.
 * A Matemática (Transform) foi totalmente separada.
 */
export class Entity extends EventDispatcher {
    private static _nextId: number = 0;
    public readonly id: number = ++Entity._nextId;

    public isEntity: boolean = true;
    public visible: boolean = true;
    public name: string = "Entity";

    public parent: Entity | null = null;
    public children: Entity[] = [];

    // O Array de gavetas! Índice 0 = Visuais, Índice 1 = Físicas
    private _layers: Map<string, any>[] = [
        new Map(), // ResourceType.VISUAL_COMPONENT
        new Map(), // ResourceType.PHYSICS_MECHANIC
    ];

    constructor() {
        super();
        // A Entidade não nasce com nenhuma dependência espacial explícita (ECS Puro).
    }

    // ==========================================================
    // Roteamento Automático de Componentes e Sub-entidades
    // ==========================================================

    /**
     * Adiciona Entidade filha ou Componente. (Roteamento Automático ECS)
     */
    public add(object: any): this {
        if (object === this as any) return this;

        // ROTEAMENTO ORIENTADO A DADOS
        if ('layer' in object && this._layers[object.layer]) {
            this._layers[object.layer]!.set(object.type, object);
            if (object.onAttach) object.onAttach(this);
        }
        // ROTEAMENTO: É um Nó Lógico (Entidade / Grupo)
        else if (object.isEntity) {
            if (object.parent !== null) {
                object.parent.remove(object);
            }
            object.parent = this;
            this.children.push(object);
            
            // Dispara para o barramento que um filho lógico nasceu (Transform e física escutam isso)
            this.dispatchEvent({ type: 'child_added', child: object });
        }

        return this;
    }

    public remove(object: any): this {
        if ('layer' in object && this._layers[object.layer]) {
            if (this._layers[object.layer]!.has(object.type)) {
                if (object.onDetach) object.onDetach(this);
                this._layers[object.layer]!.delete(object.type);
            }
        }
        else if (object.isEntity) {
            const index = this.children.indexOf(object);
            if (index !== -1) {
                object.parent = null;
                this.children.splice(index, 1);
                
                // Dispara ao vento que um filho foi removido
                this.dispatchEvent({ type: 'child_removed', child: object });
            }
        }
        return this;
    }

    // Note: addComponent e removeComponent foram removidos da API pública 
    // a pedido da arquitetura, pois add() roteia isso agora nativamente.

    public getComponent<T extends Component>(type: string): T | undefined {
        return this._layers[0]?.get(type) as T | undefined;
    }

    public getComponents(): IterableIterator<Component> {
        return this._layers[0]!.values();
    }

    public getPhysics(): IterableIterator<Physic> {
        return this._layers[1]!.values();
    }

    public hasComponent(type: string): boolean {
        return this._layers[0]!.has(type);
    }

    /**
     * Travessia genérica na Árvore Espacial.
     */
    public traverse(callback: (entity: Entity) => void): void {
        callback(this);
        const children = this.children;
        for (let i = 0; i < children.length; i++) {
            if (children[i]) {
                children[i]!.traverse(callback);
            }
        }
    }
}
