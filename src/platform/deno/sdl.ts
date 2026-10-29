/**
 * A janela nativa do `clayflow/deno` (spec 038): a SDL2 por FFI (`Deno.dlopen`), só as funções que o motor usa — criar
 * e destruir a janela, os handles nativos para a superfície WebGPU do Deno (`Deno.UnsafeWindowSurface`), o tamanho em
 * pixels e os eventos (fechar, redimensionar, teclado, mouse, roda). Multiplataforma pela própria SDL: os handles de
 * `SDL_GetWindowWMInfo` (no Mac, mais a view Metal da SDL, `SDL_Metal_CreateView`).
 * A biblioteca vem de `CLAYFLOW_SDL2` ou dos nomes usuais de cada sistema.
 */

/** O pedaço da API do Deno que este módulo usa (tipado aqui: o motor é compilado sem os tipos do Deno). */
interface DenoFfi {
    readonly build: { readonly os: string };
    readonly env: { get(name: string): string | undefined };
    dlopen(
        path: string,
        symbols: Record<string, unknown>,
    ): { symbols: Record<string, (...args: unknown[]) => unknown>; close(): void };
    readonly UnsafePointer: {
        of(buffer: BufferSource): unknown;
        create(value: bigint): unknown;
        value(pointer: unknown): bigint;
    };
    readonly UnsafePointerView: new (pointer: unknown) => { getBigUint64(offset?: number): bigint };
}

/** O `Deno` global (só existe no Deno). */
export function deno(): DenoFfi {
    const d = (globalThis as unknown as { Deno?: DenoFfi }).Deno;
    if (d === undefined) throw new Error('clayflow/deno: este ponto de entrada roda no Deno.');
    return d;
}

const SYMBOLS = {
    SDL_Init: { parameters: ['u32'], result: 'i32' },
    SDL_Quit: { parameters: [], result: 'void' },
    SDL_GetError: { parameters: [], result: 'pointer' },
    SDL_CreateWindow: {
        parameters: ['buffer', 'i32', 'i32', 'i32', 'i32', 'u32'],
        result: 'pointer',
    },
    SDL_DestroyWindow: { parameters: ['pointer'], result: 'void' },
    SDL_GetWindowSizeInPixels: { parameters: ['pointer', 'buffer', 'buffer'], result: 'void' },
    SDL_PollEvent: { parameters: ['buffer'], result: 'i32' },
    SDL_GetVersion: { parameters: ['buffer'], result: 'void' },
    SDL_GetWindowWMInfo: { parameters: ['pointer', 'buffer'], result: 'i32' },
    SDL_Metal_CreateView: { parameters: ['pointer'], result: 'pointer' },
    SDL_Metal_DestroyView: { parameters: ['pointer'], result: 'void' },
} as const;

const SDL_INIT_VIDEO = 0x20;
const SDL_INIT_EVENTS = 0x4000;
const SDL_WINDOWPOS_CENTERED = 0x2fff0000;
const SDL_WINDOW_SHOWN = 0x4;
const SDL_WINDOW_RESIZABLE = 0x20;
const SDL_WINDOW_ALLOW_HIGHDPI = 0x2000;
const SDL_WINDOW_METAL = 0x20000000;
/** `SDL_SYSWM_TYPE`: o subsistema de janela nos handles. */
const SYSWM_WINDOWS = 1;
const SYSWM_X11 = 2;
const SYSWM_WAYLAND = 6;

/** Os eventos da janela que o motor traduz (os campos do `SDL_Event` da SDL2 por deslocamento). */
export type SdlEvent =
    | { readonly kind: 'quit' }
    | { readonly kind: 'resized' }
    | {
          readonly kind: 'key';
          readonly down: boolean;
          readonly scancode: number;
          readonly repeat: boolean;
      }
    | {
          readonly kind: 'motion';
          readonly x: number;
          readonly y: number;
          readonly dx: number;
          readonly dy: number;
      }
    | {
          readonly kind: 'button';
          readonly down: boolean;
          readonly button: number;
          readonly x: number;
          readonly y: number;
      }
    | { readonly kind: 'wheel'; readonly dx: number; readonly dy: number };

function libraryPath(d: DenoFfi): string {
    const forced = d.env.get('CLAYFLOW_SDL2');
    if (forced !== undefined) return forced;
    if (d.build.os === 'darwin') {
        for (const p of [
            '/opt/homebrew/lib/libSDL2-2.0.0.dylib',
            '/usr/local/lib/libSDL2-2.0.0.dylib',
        ])
            try {
                d.dlopen(p, {}).close();
                return p;
            } catch {
                /* o próximo */
            }
        return 'libSDL2-2.0.0.dylib';
    }
    if (d.build.os === 'windows') return 'SDL2.dll';
    return 'libSDL2-2.0.so.0';
}

/** Uma janela SDL2 com os handles para a superfície WebGPU do Deno. */
export class SdlWindow {
    private readonly lib: {
        symbols: Record<string, (...args: unknown[]) => unknown>;
        close(): void;
    };
    private readonly d: DenoFfi;
    readonly handle: unknown;
    private metalView: unknown = null;
    private readonly event = new Uint8Array(64);
    private closed = false;

    constructor(title: string, width: number, height: number, highDpi = true) {
        this.d = deno();
        const path = libraryPath(this.d);
        try {
            this.lib = this.d.dlopen(path, SYMBOLS);
        } catch (e) {
            throw new Error(
                `clayflow/deno: SDL2 não encontrada (${path}) — instale a SDL2 ou aponte CLAYFLOW_SDL2 para ela (${String(e)}).`,
            );
        }
        const s = this.lib.symbols;
        if ((s.SDL_Init!(SDL_INIT_VIDEO | SDL_INIT_EVENTS) as number) !== 0)
            throw new Error(`clayflow/deno: SDL_Init falhou (${this.error()}).`);
        const mac = this.d.build.os === 'darwin';
        const flags =
            SDL_WINDOW_SHOWN
            | SDL_WINDOW_RESIZABLE
            | (highDpi ? SDL_WINDOW_ALLOW_HIGHDPI : 0)
            | (mac ? SDL_WINDOW_METAL : 0);
        this.handle = s.SDL_CreateWindow!(
            new TextEncoder().encode(`${title}\0`),
            SDL_WINDOWPOS_CENTERED,
            SDL_WINDOWPOS_CENTERED,
            width,
            height,
            flags,
        );
        if (this.handle === null)
            throw new Error(`clayflow/deno: SDL_CreateWindow falhou (${this.error()}).`);
    }

    /** Os handles nativos para `Deno.UnsafeWindowSurface` (o sistema, a janela e o display). */
    nativeHandles(): {
        system: 'cocoa' | 'win32' | 'x11' | 'wayland';
        windowHandle: unknown;
        displayHandle: unknown;
    } {
        const s = this.lib.symbols;
        // SDL_SysWMinfo: a versão (3 bytes) no início, o subsistema (u32) em 4 e a união dos handles em 8.
        const info = new Uint8Array(256);
        s.SDL_GetVersion!(info);
        if ((s.SDL_GetWindowWMInfo!(this.handle, info) as number) !== 1)
            throw new Error(`clayflow/deno: SDL_GetWindowWMInfo falhou (${this.error()}).`);
        const view = new DataView(info.buffer);
        const subsystem = view.getUint32(4, true);
        const p0 = view.getBigUint64(8, true);
        const p1 = view.getBigUint64(16, true);
        const ptr = (v: bigint) => this.d.UnsafePointer.create(v);
        if (this.d.build.os === 'darwin') {
            // Cocoa no Deno: a janela (`NSWindow`, da SDL) no `windowHandle` e a view (a Metal da SDL) no
            // `displayHandle` — com a view no `windowHandle`, o Deno a acha nula (medido no Deno 2.7).
            this.metalView ??= s.SDL_Metal_CreateView!(this.handle);
            return { system: 'cocoa', windowHandle: ptr(p0), displayHandle: this.metalView };
        }
        if (subsystem === SYSWM_WINDOWS)
            return {
                system: 'win32',
                windowHandle: ptr(p0),
                displayHandle: ptr(view.getBigUint64(24, true)),
            };
        if (subsystem === SYSWM_X11)
            return { system: 'x11', windowHandle: ptr(p1), displayHandle: ptr(p0) };
        if (subsystem === SYSWM_WAYLAND)
            return { system: 'wayland', windowHandle: ptr(p1), displayHandle: ptr(p0) };
        throw new Error(`clayflow/deno: subsistema de janela ${subsystem} não suportado.`);
    }

    /** O tamanho da janela em pixels (o do quadro; em telas de alta densidade, maior que o em pontos). */
    pixelSize(): { width: number; height: number } {
        const w = new Int32Array(1);
        const h = new Int32Array(1);
        this.lib.symbols.SDL_GetWindowSizeInPixels!(this.handle, w, h);
        return { width: w[0]!, height: h[0]! };
    }

    /** Os eventos pendentes, traduzidos (os de outros tipos são descartados). */
    poll(): SdlEvent[] {
        const out: SdlEvent[] = [];
        const s = this.lib.symbols;
        const view = new DataView(this.event.buffer);
        while ((s.SDL_PollEvent!(this.event) as number) === 1) {
            const type = view.getUint32(0, true);
            if (type === 0x100) out.push({ kind: 'quit' });
            else if (type === 0x200) {
                const e = this.event[12]!;
                if (e === 5 || e === 6) out.push({ kind: 'resized' });
                if (e === 14) out.push({ kind: 'quit' });
            } else if (type === 0x300 || type === 0x301)
                out.push({
                    kind: 'key',
                    down: type === 0x300,
                    scancode: view.getInt32(16, true),
                    repeat: this.event[13]! !== 0,
                });
            else if (type === 0x400)
                out.push({
                    kind: 'motion',
                    x: view.getInt32(20, true),
                    y: view.getInt32(24, true),
                    dx: view.getInt32(28, true),
                    dy: view.getInt32(32, true),
                });
            else if (type === 0x401 || type === 0x402)
                out.push({
                    kind: 'button',
                    down: type === 0x401,
                    button: this.event[16]!,
                    x: view.getInt32(20, true),
                    y: view.getInt32(24, true),
                });
            else if (type === 0x403)
                out.push({
                    kind: 'wheel',
                    dx: view.getFloat32(28, true),
                    dy: view.getFloat32(32, true),
                });
        }
        return out;
    }

    /** Fecha a janela e a SDL (idempotente). */
    close(): void {
        if (this.closed) return;
        this.closed = true;
        const s = this.lib.symbols;
        if (this.metalView !== null) s.SDL_Metal_DestroyView!(this.metalView);
        s.SDL_DestroyWindow!(this.handle);
        s.SDL_Quit!();
        this.lib.close();
    }

    private error(): string {
        const p = this.lib.symbols.SDL_GetError!();
        if (p === null) return '';
        const view = new this.d.UnsafePointerView(p) as unknown as { getCString(): string };
        return view.getCString();
    }
}
