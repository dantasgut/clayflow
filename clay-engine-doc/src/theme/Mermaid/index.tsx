import React, {type ReactNode} from 'react';
import Mermaid from '@theme-original/Mermaid';
import type MermaidType from '@theme/Mermaid';
import type {WrapperProps} from '@docusaurus/types';
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";

type Props = WrapperProps<typeof MermaidType>;

export default function MermaidWrapper(props: Props): ReactNode {
  return (
    <div style={{ border: '1px solid var(--ifm-color-emphasis-200)', borderRadius: '8px', overflow: 'hidden', margin: '2rem 0', backgroundColor: 'var(--ifm-background-color)' }}>
      <TransformWrapper 
        initialScale={1} 
        minScale={0.1} 
        maxScale={30}
        wheel={{ step: 0.02 }}
        doubleClick={{ disabled: true }}
        panning={{ velocityDisabled: false }}
        centerOnInit={true}
      >
        <TransformComponent wrapperStyle={{ width: "100%", height: "100%", minHeight: "600px" }} contentStyle={{ width: "100%", height: "100%", display: "flex", justifyContent: "center", alignItems: "center" }}>
          <div style={{ cursor: 'grab', width: '100%', height: '100%', padding: '2rem' }}>
            <Mermaid {...props} />
          </div>
        </TransformComponent>
      </TransformWrapper>
      <div style={{ textAlign: 'center', padding: '6px', fontSize: '13px', color: 'var(--ifm-color-emphasis-600)', backgroundColor: 'var(--ifm-color-emphasis-100)', borderTop: '1px solid var(--ifm-color-emphasis-200)' }}>
        🔍 Mouse Wheel para Zoom | 🖐 Arraste para Mover | Controle nativo do Docusaurus Swizzle
      </div>
    </div>
  );
}
