/// <reference types="vite/client" />
/// <reference types="vite-plugin-svgr/client" />

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
