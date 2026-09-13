import { useState } from "react";
import { useForm } from "react-hook-form";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui-card";
import { Button } from "@/components/ui-button";
import { Input } from "@/components/ui-input";
import { Label } from "@/components/ui-label";
import { Badge } from "@/components/ui-badge";
import { Skeleton } from "@/components/ui-skeleton";
import { toast } from "sonner";
import {
  RiRocketLine,
  RiLoader4Line,
} from "@remixicon/react";
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
} from "recharts";
import type { OnboardingSubmission, OnboardingAIEvaluation, EBFScores } from "@/lib/impact-clarity-impact-clarity-types";
import { EBF_PILLAR_LABELS, EBF_PILLARS } from "@/lib/impact-clarity-impact-clarity-types";

function EBFHexagonChart({ scores, size = 240, label, baselineScores }: { scores: EBFScores; size?: number; label?: string; baselineScores?: EBFScores | null; }) {
  const data = EBF_PILLARS.map((pillar) => ({
    pillar: EBF_PILLAR_LABELS[pillar],
    value: Math.round(scores[pillar] * 100),
    baseline: baselineScores ? Math.round(baselineScores[pillar] * 100) : null,
  }));

  return (
    <div className="flex flex-col items-center gap-2">
      <ResponsiveContainer width={size} height={size}>
        <RadarChart data={data} outerRadius="70%">
          <PolarGrid stroke="var(--surface-a8)" />
          <PolarAngleAxis dataKey="pillar" tick={{ fontSize: 10, fill: "var(--tertiary-t)" }} />
          <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
          {baselineScores && (
            <Radar
              name="Baseline"
              dataKey="baseline"
              stroke="var(--surface-a8)"
              fill="var(--surface-a8)"
              fillOpacity={0.15}
              strokeDasharray="4 4"
            />
          )}
          <Radar
            name="Current"
            dataKey="value"
            stroke="var(--primary)"
            fill="var(--primary)"
            fillOpacity={0.3}
          />
        </RadarChart>
      </ResponsiveContainer>
      {label && <span className="text-xs text-tertiary-t">{label}</span>}
    </div>
  );
}

const API_BASE = import.meta.env.VITE_IMPACT_API_ENDPOINT || "";

interface OnboardingFormData {
  tokenName: string;
  tokenSymbol: string;
  tokenAddress: string;
  website: string;
  description: string;
  impactCategory: string;
  projectLocation: string;
  contactEmail: string;
  communityEngagement: "low" | "medium" | "high";
  operationalMonths: number;
}

const IMPACT_CATEGORIES = [
  "Carbon Sequestration",
  "Reforestation",
  "Clean Energy",
  "Regenerative Agriculture",
  "Biodiversity Conservation",
  "Water Conservation",
  "Community Development",
  "Ocean Health",
];

export function OnboardingPage() {
  const [submittedId, setSubmittedId] = useState<number | null>(null);
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<OnboardingFormData>({
    defaultValues: {
      communityEngagement: "medium",
      operationalMonths: 12,
    },
  });

  const onSubmit = async (data: OnboardingFormData) => {
    if (!API_BASE) {
      toast.error("Worker API not configured. Set VITE_IMPACT_API_ENDPOINT.");
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/v1/onboard/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Submission failed");
      const result = await res.json();
      setSubmittedId(result.id);
      toast.success("Submission received! AI evaluation in progress...");
      queryClient.invalidateQueries({ queryKey: ["onboard-submissions"] });
    } catch {
      toast.error("Failed to submit. Please try again.");
    }
  };

  if (submittedId) {
    return <EvaluationResults submissionId={submittedId} onReset={() => { setSubmittedId(null); reset(); }} />;
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 space-y-6">
      <div>
        <div className="flex items-center gap-3 mb-2">
          <RiRocketLine className="size-8 text-primary" />
          <h1 className="text-3xl font-bold">Onboard an Impact Token</h1>
        </div>
        <p className="text-sm text-secondary-t max-w-xl">
          Submit your regenerative finance project for evaluation. Our AI will assess it
          using the Ecological Benefits Framework (EBF) and DeFi Sentinel risk scoring.
        </p>
      </div>

      <Card className="p-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="tokenName">Token Name</Label>
              <Input
                id="tokenName"
                {...register("tokenName", { required: "Required" })}
                placeholder="Solarcoin"
              />
              {errors.tokenName && <p className="text-xs text-red-500">{errors.tokenName.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tokenSymbol">Token Symbol</Label>
              <Input
                id="tokenSymbol"
                {...register("tokenSymbol", { required: "Required" })}
                placeholder="SLR"
              />
              {errors.tokenSymbol && <p className="text-xs text-red-500">{errors.tokenSymbol.message}</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tokenAddress">Token Contract Address (Base)</Label>
            <Input
              id="tokenAddress"
              {...register("tokenAddress", { required: "Required" })}
              placeholder="0x..."
              className="font-mono text-sm"
            />
            {errors.tokenAddress && <p className="text-xs text-red-500">{errors.tokenAddress.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="website">Project Website</Label>
            <Input
              id="website"
              {...register("website", { required: "Required" })}
              placeholder="https://..."
            />
            {errors.website && <p className="text-xs text-red-500">{errors.website.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Project Description</Label>
            <textarea
              id="description"
              {...register("description", { required: "Required" })}
              placeholder="Describe your project's climate impact, mechanism, and verification methods..."
              className="w-full min-h-[100px] rounded-lg border border-surface-a8 bg-surface-a3 px-3 py-2 text-sm resize-y"
            />
            {errors.description && <p className="text-xs text-red-500">{errors.description.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="impactCategory">Impact Category</Label>
            <select
              id="impactCategory"
              {...register("impactCategory", { required: "Required" })}
              className="w-full rounded-lg border border-surface-a8 bg-surface-a3 px-3 py-2 text-sm"
            >
              <option value="">Select category...</option>
              {IMPACT_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            {errors.impactCategory && <p className="text-xs text-red-500">{errors.impactCategory.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="projectLocation">Project Location (optional)</Label>
              <Input
                id="projectLocation"
                {...register("projectLocation")}
                placeholder="e.g., Amazon Basin, Brazil"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="operationalMonths">Months Operational</Label>
              <Input
                id="operationalMonths"
                type="number"
                {...register("operationalMonths", { required: "Required", min: 0 })}
              />
              {errors.operationalMonths && <p className="text-xs text-red-500">{errors.operationalMonths.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="communityEngagement">Community Engagement</Label>
              <select
                id="communityEngagement"
                {...register("communityEngagement")}
                className="w-full rounded-lg border border-surface-a8 bg-surface-a3 px-3 py-2 text-sm"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contactEmail">Contact Email</Label>
              <Input
                id="contactEmail"
                type="email"
                {...register("contactEmail", { required: "Required" })}
                placeholder="team@project.org"
              />
              {errors.contactEmail && <p className="text-xs text-red-500">{errors.contactEmail.message}</p>}
            </div>
          </div>

          <div className="pt-2">
            <Button type="submit" disabled={isSubmitting} size="lg" className="w-full">
              {isSubmitting ? (
                <>
                  <RiLoader4Line className="size-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <RiRocketLine className="size-4" />
                  Submit for AI Evaluation
                </>
              )}
            </Button>
          </div>
        </form>
      </Card>

      <SubmissionsList />
    </div>
  );
}

function EvaluationResults({ submissionId, onReset }: { submissionId: number; onReset: () => void }) {
  const { data: submission, isLoading } = useQuery({
    queryKey: ["onboard-submission", submissionId],
    queryFn: async (): Promise<OnboardingSubmission> => {
      const res = await fetch(`${API_BASE}/api/v1/onboard/submissions/${submissionId}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data?.status === "completed" || data?.status === "rejected") return false;
      return 3000;
    },
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6">
        <Card className="p-6">
          <Skeleton className="h-8 w-48 mb-4" />
          <Skeleton className="h-32 w-full" />
        </Card>
      </div>
    );
  }

  if (!submission) return null;

  const evaluation = submission.aiEvaluation;

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 space-y-6">
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold">{submission.tokenName} ({submission.tokenSymbol})</h2>
            <p className="text-xs text-tertiary-t">Submission #{submission.id}</p>
          </div>
          <StatusBadge status={submission.status} />
        </div>

        {submission.status === "pending" || submission.status === "evaluating" ? (
          <div className="flex items-center gap-3 py-8 justify-center">
            <RiLoader4Line className="size-6 animate-spin text-primary" />
            <p className="text-sm text-secondary-t">AI evaluation in progress...</p>
          </div>
        ) : evaluation ? (
          <EvaluationDetails evaluation={evaluation} />
        ) : null}
      </Card>

      {submission.status === "completed" && evaluation && (
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Recommendation: {evaluation.recommendation}</p>
              <p className="text-xs text-tertiary-t">
                Combined score: {Math.round(evaluation.combinedScore)} ·
                Financial: {Math.round(evaluation.financialRiskScore)} ·
                Impact Risk: {Math.round(evaluation.impactRiskScore)} ·
                Impact Quality: {Math.round(evaluation.impactQualityScore)}
              </p>
            </div>
          </div>
        </Card>
      )}

      <Button variant="tertiary" onClick={onReset}>
        Submit Another Project
      </Button>
    </div>
  );
}

function EvaluationDetails({ evaluation }: { evaluation: OnboardingAIEvaluation }) {
  return (
    <div className="space-y-4">
      <div className="flex justify-center">
        <EBFHexagonChart scores={evaluation.ebfScores} size={200} label="EBF Assessment" />
      </div>

      <div>
        <p className="text-xs text-tertiary-t uppercase tracking-wide mb-2">Pillar Rationale</p>
        <div className="space-y-2">
          {Object.entries(evaluation.rationalePerPillar).map(([pillar, rationale]) => (
            <div key={pillar} className="text-sm">
              <span className="font-medium capitalize">{pillar}:</span>{" "}
              <span className="text-secondary-t">{rationale}</span>
            </div>
          ))}
        </div>
      </div>

      {evaluation.negativeExternalities.length > 0 && (
        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <p className="text-xs font-medium text-amber-700 mb-1">Negative Externalities Detected</p>
          <ul className="text-xs text-amber-600 list-disc list-inside">
            {evaluation.negativeExternalities.map((ext) => <li key={ext}>{ext}</li>)}
          </ul>
        </div>
      )}

      <div className="flex items-center gap-2">
        <span className="text-xs text-tertiary-t">Confidence:</span>
        <Badge variant="ghost">{evaluation.confidence}</Badge>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: "bg-amber-500/20 text-amber-600",
    evaluating: "bg-blue-500/20 text-blue-600",
    completed: "bg-green-500/20 text-green-600",
    rejected: "bg-red-500/20 text-red-600",
  };
  return <Badge variant="ghost" className={colors[status] ?? ""}>{status}</Badge>;
}

function SubmissionsList() {
  const { data: submissions, isLoading } = useQuery({
    queryKey: ["onboard-submissions"],
    queryFn: async (): Promise<OnboardingSubmission[]> => {
      if (!API_BASE) return [];
      const res = await fetch(`${API_BASE}/api/v1/onboard/submissions`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 30 * 1000,
  });

  if (isLoading) return <Skeleton className="h-24 w-full" />;
  if (!submissions || submissions.length === 0) return null;

  return (
    <Card className="p-4">
      <h3 className="text-sm font-medium mb-3">Recent Submissions</h3>
      <div className="space-y-2">
        {submissions.slice(0, 5).map((sub) => (
          <div key={sub.id} className="flex items-center justify-between text-sm py-2 border-b last:border-0">
            <div>
              <span className="font-medium">{sub.tokenName}</span>
              <span className="text-xs text-tertiary-t ml-2">{sub.tokenSymbol}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-tertiary-t">{new Date(sub.submittedAt).toLocaleDateString()}</span>
              <StatusBadge status={sub.status} />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
