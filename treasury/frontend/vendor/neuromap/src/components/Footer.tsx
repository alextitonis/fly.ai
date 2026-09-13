export function Footer() {
  return (
    <footer className="border-t border-slate-700/50 bg-slate-900 py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center space-y-2">
          <p className="text-xs text-slate-500">
            NeuroMap is an educational tool. It does not provide medical diagnosis, treatment advice, or prescribing guidance.
          </p>
          <p className="text-xs text-slate-600">
            Data sourced from open-access research databases. All associations are drawn from published literature and cited.
          </p>
        </div>
      </div>
    </footer>
  );
}
