---
sidebar_position: 12
title: UI System
---

# UI System

Sistema de UI 2D para HUDs, debug overlays, e menus simples. Renderizado por `UIFlow` (1 storage buffer com até 1024 quads) com hit-test e layout automático.

## Elementos

| Classe                | Uso                                            |
|-----------------------|------------------------------------------------|
| `UiPanel`             | Background colorido (fundo)                    |
| `UiButton`            | Botão clicável; campos `hovered`/`pressed`/`onClick` |
| `UiSlider`            | Range slider; `min/max/value/onChange`         |
| `UiText`              | Texto com word-wrap (requer `setFont(...)`)    |
| `UiHBox`              | Container horizontal (`gap`, `padding`, fixed/flex) |
| `UiVBox`              | Container vertical                             |
| `UiStack`             | Z-stack: filhos sobrepostos                    |
| `UiInteractionHandler`| Pointer events → UiTree (hit-test, drag)       |

## Layout automático

```typescript
import { UiHBox, UiButton, UiPanel } from 'webgpu-engine';

const hbox = new UiHBox();
hbox.bounds = { x: 0, y: 0, width: 600, height: 50 };
hbox.gap = 4; hbox.padding = 0;

const fixed = new UiPanel();
fixed.bounds = { x: 0, y: 0, width: 100, height: 0 }; // width=100 é fixed

const flex1 = new UiButton();   // width=0 = flex
const flex2 = new UiButton();

hbox.add(fixed); hbox.add(flex1); hbox.add(flex2);
hbox.layout();   // distribui: fixed=100, flex1=246, flex2=246 (gap=4 entre)

app.defaults.ui.ui.add(hbox);
```

`UiVBox` empilha verticalmente com a mesma semântica. `UiStack` faz Z-stacking (cada filho ocupa toda a área).

## Hit-test + interações

```typescript
import { UiInteractionHandler, UiButton, UiSlider } from 'webgpu-engine';

const button = new UiButton();
button.bounds = { x: 100, y: 100, width: 200, height: 60 };
button.onClick = () => console.log('clicked!');
app.defaults.ui.ui.add(button);

const slider = new UiSlider();
slider.bounds = { x: 100, y: 200, width: 300, height: 30 };
slider.min = 0; slider.max = 100; slider.value = 50;
slider.onChange = v => console.log('value', v);
app.defaults.ui.ui.add(slider);

const handler = new UiInteractionHandler(app.defaults.ui.ui, canvas);
handler.attach();
```

O handler:
- `pointerdown` → marca `button.pressed = true` ou inicia drag em slider
- `pointermove` → atualiza `button.hovered` ou `slider.value` se draggando
- `pointerup` → dispara `onClick` se up + down no mesmo elemento
- `pointerleave` → limpa hover/press

`UIFlow` colore botões diferente quando `hovered`/`pressed`.

## Texto

```typescript
import { FontLoader, UiText } from 'webgpu-engine';

const font = await new FontLoader().load('Inter', '/fonts/Inter.woff2', { fontSize: 32 });
app.defaults.ui.setFont(font);

const text = new UiText();
text.text = 'Hello, world!';
text.bounds = { x: 100, y: 300, width: 300, height: 60 };
text.fontSize = 18;
text.color = [1, 1, 1, 1];
app.defaults.ui.ui.add(text);
```

Wrap automático respeita `bounds.width`. Newlines (`\n`) começam linha nova. Glifos ausentes do atlas usam `fontSize × 0.5` como advance.

## Overlay de FPS

```typescript
app.defaults.debug.setEnabled(true);
app.events.on('profilerStats', s => {
    fpsText.text = `${s.fps.toFixed(0)} fps  ${s.frameTimeMs.toFixed(1)}ms`;
});
```

`DebugFlow` emite a 4 Hz por padrão; toggle via `F1` (configurável).
