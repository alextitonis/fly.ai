// electron/preload.ts, absent when a page runs in a plain browser (npm run dev)
interface ComputeState { phase: "off" | "waiting" | "loading" | "running" | "error"; jobs: number; perMinute: number; engine: string }

interface Window {
  flyNative?: {
    menu(): void;
    quit(): void;
    setLang(lang: string): void;
    saveImage(dataUrl: string): Promise<void>;
    compute(on: boolean, anyTime: boolean): void;
    computeState(): Promise<ComputeState>;
    onComputeState(fn: (s: ComputeState) => void): void;
    computeReport(s: { phase: string; jobs: number; perMinute: number; engine: string }): void;
    onShare(fn: () => void): void;
    place(x: number, y: number): void;
    setIgnore(through: boolean): void;
    workArea(): Promise<{ x: number; y: number; width: number; height: number }>;
    notify(title: string, body: string): void;
    openUrl(url: string): Promise<void>;
    autostart(): Promise<boolean | null>;
    setAutostart(on: boolean): void;
    onCursor(fn: (c: { x: number; y: number; inside: boolean }) => void): void;
    onQuiet(fn: (on: boolean) => void): void;
    onFeed(fn: () => void): void;
  };
}
