import type { SVGProps } from "react";
import * as AllIcons from "../icons";

export type IconName = keyof typeof AllIcons;

interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName;
  size?: number | string;
  color?: string;
}

export function Icon(props: IconProps) {
  const { name, size = 24, color = "currentColor", className, ...rest } = props;

  // biome-ignore lint/performance/noDynamicNamespaceImportAccess: dynamic icon lookup by name prop
  const resolved = AllIcons[name];

  if (resolved == null) {
    return null;
  }

  // Token icons are imported as string URLs (PNG/WebP), not React components
  if (typeof resolved === "string") {
    return (
      <img
        src={resolved}
        alt={String(name)}
        width={size}
        height={size}
        className={className}
        style={{ objectFit: "contain", borderRadius: "9999px" }}
      />
    );
  }

  const SvgComponent = resolved as React.ComponentType<SVGProps<SVGSVGElement>>;
  return <SvgComponent width={size} height={size} fill={color} className={className} {...rest} />;
}
