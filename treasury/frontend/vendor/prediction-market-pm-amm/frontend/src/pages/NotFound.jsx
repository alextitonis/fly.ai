import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { AlertTriangle, Home } from "lucide-react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname,
    );
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 mx-auto mb-6 bg-red-500/10 rounded-full flex items-center justify-center">
          <AlertTriangle className="w-8 h-8 text-red-400" />
        </div>
        <h1 className="text-5xl font-bold text-white mb-3">404</h1>
        <p className="text-xl text-slate-300 mb-2">Page Not Found</p>
        <p className="text-slate-400 mb-8">
          The page <code className="text-red-400">{location.pathname}</code> doesn't exist. Let's get you back on track.
        </p>
        <Link
          to="/"
          className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-black font-semibold rounded-lg hover:opacity-90 transition-all"
        >
          <Home size={20} />
          Return to Home
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
