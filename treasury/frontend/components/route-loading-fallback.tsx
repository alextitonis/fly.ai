export function RouteLoadingFallback() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <div className="flex items-center gap-2">
        <div className="size-2 rounded-full bg-primary animate-bounce [animation-delay:-0.3s]" />
        <div className="size-2 rounded-full bg-primary animate-bounce [animation-delay:-0.15s]" />
        <div className="size-2 rounded-full bg-primary animate-bounce" />
      </div>
    </div>
  );
}
