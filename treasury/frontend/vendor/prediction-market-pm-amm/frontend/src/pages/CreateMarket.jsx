import { useState, useEffect } from "react";
import { AlertCircle, Loader2, CheckCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useCreateMarket, useApproveMUSD, useAllowance, useMUSDBalance } from "../hooks/useContracts";
import { useAccount } from "wagmi";

export default function CreateMarket() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    question: "",
    criteria: "",
    sourceUrl: "",
    sourceUrl: "",
    durationDays: "",
    durationHours: "",
    durationMinutes: "",
    liquidity: "",
  });

  const { isConnected } = useAccount();
  const { createMarket, isPending: isCreating, isSuccess: isCreateSuccess } = useCreateMarket();
  const { approve, isPending: isApproving } = useApproveMUSD();
  const { data: allowance } = useAllowance();
  const { data: musdBalance } = useMUSDBalance();

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  useEffect(() => {
    if (isCreateSuccess) {
      // Wait a bit then redirect
      const timer = setTimeout(() => {
        navigate('/markets');
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isCreateSuccess, navigate]);

  const hasAllowance = allowance && formData.liquidity && parseFloat(allowance) >= parseFloat(formData.liquidity);

  const handleApprove = () => {
    approve(formData.liquidity);
  };

  const handleDeploy = () => {
    createMarket({
      title: formData.question,
      description: formData.criteria, // Using criteria as description
      resolutionSource: formData.sourceUrl,
      isDynamic: false, // Default to static for simpler UI
      isDynamic: false, // Default to static for simpler UI
      duration: {
        days: formData.durationDays || 0,
        hours: formData.durationHours || 0,
        minutes: formData.durationMinutes || 0
      },
      collateral: formData.liquidity
    });
  };

  const handleNext = () => {
    if (step === 2) {
      handleDeploy();
    } else {
      setStep(s => s + 1);
    }
  };

  const steps = [
    { number: 1, title: "Market Details" },
    { number: 2, title: "Review & Approve" },
    { number: 3, title: "Deploy" },
  ];

  // Auto-advance to step 3 if creating started
  useEffect(() => {
    if (isCreating && step !== 3) {
      setStep(3);
    }
  }, [isCreating, step]);

  return (
    <main className="min-h-screen px-4 sm:px-6 lg:px-8 py-12">
      <div className="max-w-2xl mx-auto">
        {/* Step Indicator */}
        <div className="mb-12">
          <div className="flex items-center justify-between mb-8">
            {steps.map((s, idx) => (
              <div key={s.number} className="flex flex-col items-center flex-1">
                <div
                  className={`w-12 h-12 rounded-full flex items-center justify-center font-bold transition-all mb-3 ${step >= s.number
                    ? "bg-indigo-500 text-black"
                    : "bg-secondary text-slate-400"
                    }`}
                >
                  {s.number}
                </div>
                <p
                  className={`text-sm font-medium ${step >= s.number ? "text-white" : "text-slate-500"
                    }`}
                >
                  {s.title}
                </p>
                {idx < steps.length - 1 && (
                  <div
                    className={`h-1 flex-1 mt-3 mx-2 ${step > s.number ? "bg-indigo-500" : "bg-secondary"
                      }`}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Form Content */}
        <div className="bg-card rounded-lg p-8 mb-8" style={{ border: "1px solid rgba(255, 255, 255, 0.06)" }}>
          {step === 1 && (
            <div className="space-y-6">
              <h2 className="text-white text-2xl font-bold mb-8">Create New Market</h2>

              {!isConnected && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-4 rounded-lg mb-4">
                  Please connect your wallet to create a market.
                </div>
              )}

              <div>
                <label className="block text-white font-medium mb-2">
                  Market Question
                </label>
                <input
                  type="text"
                  name="question"
                  placeholder="e.g., Will Bitcoin reach $100k by end of 2024?"
                  value={formData.question}
                  onChange={handleInputChange}
                  className="min-input"
                />
              </div>

              <div>
                <label className="block text-white font-medium mb-2">
                  Resolution Criteria
                </label>
                <textarea
                  name="criteria"
                  placeholder="Detailed criteria for resolving this market..."
                  value={formData.criteria}
                  onChange={handleInputChange}
                  className="min-input min-h-[120px] resize-none"
                />
              </div>

              <div>
                <label className="block text-white font-medium mb-2">
                  Resolution Source
                </label>
                <input
                  type="text"
                  name="sourceUrl"
                  placeholder="e.g., CoinGecko, Reuters, etc."
                  value={formData.sourceUrl}
                  onChange={handleInputChange}
                  className="min-input"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <label className="block text-white font-medium mb-2">
                  Duration
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <input
                      type="number"
                      name="durationDays"
                      placeholder="Days"
                      value={formData.durationDays}
                      onChange={handleInputChange}
                      className="min-input"
                      min="0"
                    />
                    <span className="text-xs text-slate-500">Days</span>
                  </div>
                  <div>
                    <input
                      type="number"
                      name="durationHours"
                      placeholder="Hours"
                      value={formData.durationHours}
                      onChange={handleInputChange}
                      className="min-input"
                      min="0"
                      max="23"
                    />
                    <span className="text-xs text-slate-500">Hours</span>
                  </div>
                  <div>
                    <input
                      type="number"
                      name="durationMinutes"
                      placeholder="Mins"
                      value={formData.durationMinutes}
                      onChange={handleInputChange}
                      className="min-input"
                      min="0"
                      max="59"
                    />
                    <span className="text-xs text-slate-500">Minutes</span>
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-white font-medium mb-2">
                  Initial Liquidity (mUSD)
                </label>
                <input
                  type="number"
                  name="liquidity"
                  placeholder="1000"
                  value={formData.liquidity}
                  onChange={handleInputChange}
                  className="min-input"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Balance: {musdBalance ? parseFloat(musdBalance).toFixed(2) : '0'} mUSD
                </p>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <h2 className="text-white text-2xl font-bold mb-8">Review & Approve</h2>

              <div className="bg-secondary rounded-lg p-6 space-y-4" style={{ border: "1px solid rgba(255, 255, 255, 0.06)" }}>
                <div className="flex justify-between items-start">
                  <p className="text-slate-400">Question</p>
                  <p className="text-white font-medium text-right max-w-xs">
                    {formData.question || "Not provided"}
                  </p>
                </div>
                <div className="pt-4 flex justify-between items-start" style={{ borderTop: "1px solid rgba(255, 255, 255, 0.06)" }}>
                  <p className="text-slate-400">Duration</p>
                  <p className="text-white font-medium">
                    {formData.durationDays || "0"}d {formData.durationHours || "0"}h {formData.durationMinutes || "0"}m
                  </p>
                </div>
                <div className="border-t border-white/6 pt-4 flex justify-between items-start">
                  <p className="text-slate-400">Initial Liquidity</p>
                  <p className="text-white font-medium">
                    ${formData.liquidity || "0"} mUSD
                  </p>
                </div>
              </div>

              {!hasAllowance ? (
                <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-lg p-4 flex gap-3">
                  <AlertCircle className="w-5 h-5 text-indigo-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-indigo-400 text-sm font-medium mb-1">
                      Approve mUSD Spending
                    </p>
                    <p className="text-slate-400 text-sm">
                      You'll need to approve the Router contract to spend{" "}
                      {formData.liquidity || "0"} mUSD.
                    </p>
                    <button
                      onClick={handleApprove}
                      disabled={isApproving}
                      className="mt-3 px-4 py-2 bg-indigo-500 text-white text-sm font-medium rounded hover:bg-indigo-600 transition-colors flex items-center gap-2"
                    >
                      {isApproving && <Loader2 className="animate-spin" size={16} />}
                      {isApproving ? "Approving..." : "Approve mUSD"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4 flex gap-3 items-center">
                  <CheckCircle className="w-5 h-5 text-emerald-400" />
                  <p className="text-emerald-400 text-sm font-medium">
                    mUSD Approved for spending
                  </p>
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <h2 className="text-white text-2xl font-bold mb-8">Deploy Market</h2>

              <div className="text-center py-12">
                <div className="w-16 h-16 mx-auto mb-6 bg-emerald-500/10 rounded-full flex items-center justify-center">
                  {isCreateSuccess ? (
                    <CheckCircle className="w-8 h-8 text-emerald-500" />
                  ) : (
                    <div className="w-12 h-12 border-2 border-emerald-500/50 border-t-emerald-500 rounded-full animate-spin" />
                  )}
                </div>
                <p className="text-white font-semibold mb-2">
                  {isCreateSuccess ? "Market Created Successfully!" : "Deploying your market..."}
                </p>
                <p className="text-slate-400 text-sm max-w-sm mx-auto">
                  {isCreateSuccess
                    ? "Redirecting to markets page..."
                    : "Please confirm the transaction in your wallet to complete market creation."
                  }
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4 justify-end">
          {step < 3 && (
            <>
              <button
                onClick={() => setStep((s) => Math.max(1, s - 1))}
                disabled={step === 1}
                className="px-6 py-3 text-white font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                style={{ border: "1px solid rgba(255, 255, 255, 0.06)" }}
              >
                Back
              </button>
              <button
                onClick={handleNext}
                disabled={
                  step === 3 ||
                  !formData.question ||
                  !isConnected ||
                  (step === 2 && !hasAllowance)
                }
                className="px-6 py-3 bg-primary text-black font-medium rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {step === 2 ? "Deploy Market" : "Continue"}
              </button>
            </>
          )}
        </div>
      </div>
    </main >
  );
}
