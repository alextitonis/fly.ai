import { cn } from "@/lib/utils";

export function SHITLogo({ className }: { className?: string }) {
  return (
    <img
      src="/pictures/shit/shitnew-removebg-preview.png"
      alt="5H1T Logo"
      className={cn("object-contain", className)}
    />
  );
}
