/**
 * O EventDispatcher (Padrão Observer)
 * Usado como classe base (ou Mixin) para permitir que qualquer entidade da engine (Objetos 3D, Câmeras, ResizeHandlers)
 * passe a emitir e escutar eventos customizados sem se acoplarem diretamente umas às outras.
 */
export class EventDispatcher {
    // Dicionário mapeando o nome do evento para um array de funções de Callback
    private listeners: Map<string, Array<(event: any) => void>>;

    constructor() {
        this.listeners = new Map();
    }

    /**
     * Inscreve uma função callback para escutar um evento específico.
     */
    public addEventListener(type: string, listener: (event: any) => void): void {
        const listeners = this.listeners.get(type);
        if (listeners) {
            // Evita duplicatas do mesmo listener
            if (listeners.indexOf(listener) === -1) {
                listeners.push(listener);
            }
        } else {
            this.listeners.set(type, [listener]);
        }
    }

    /**
     * Verifica se existe alguma inscrição para aquele evento e função.
     */
    public hasEventListener(type: string, listener: (event: any) => void): boolean {
        const listeners = this.listeners.get(type);
        return listeners !== undefined && listeners.indexOf(listener) !== -1;
    }

    /**
     * Remove uma inscrição existente.
     */
    public removeEventListener(type: string, listener: (event: any) => void): void {
        const listeners = this.listeners.get(type);
        if (listeners) {
            const index = listeners.indexOf(listener);
            if (index !== -1) {
                listeners.splice(index, 1);
            }
        }
    }

    /**
     * Remove todos os listeners (ideal para cleanup de lixo na memória).
     */
    public clearEventListeners(): void {
        this.listeners.clear();
    }

    /**
     * Despacha o evento, executando todos os callbacks inscritos para aquele tipo.
     */
    public dispatchEvent(event: { type: string; [attachment: string]: any }): void {
        const listeners = this.listeners.get(event.type);
        if (listeners) {
            // Cria uma cópia rasa do array para evitar mutações durante o loop (caso um listener se remova dentro dele mesmo)
            const listenersCopy = listeners.slice(0);
            
            const enriched = { ...event, target: this };

            for (let i = 0, l = listenersCopy.length; i < l; i++) {
                const listener = listenersCopy[i];
                if (listener) listener.call(this, enriched);
            }
        }
    }
}
