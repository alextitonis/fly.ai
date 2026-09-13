/// <reference types="vite/client" />
/// <reference types="vite-plugin-svgr/client" />

interface Window {
  __dismissSplash?: () => void;
}

declare module "*.webp?react" {
  import type { ComponentType, SVGProps } from "react";
  const ReactComponent: ComponentType<SVGProps<SVGSVGElement>>;
  export default ReactComponent;
}

declare module "*.png?react" {
  import type { ComponentType, SVGProps } from "react";
  const ReactComponent: ComponentType<SVGProps<SVGSVGElement>>;
  export default ReactComponent;
}
