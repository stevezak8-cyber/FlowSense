import { Estimate, EstimateLine } from "@/api/types"

type Tier = "good" | "better" | "best"

interface Props {
  estimate: Estimate
  onSelect: (tier: Tier) => void
}

const TIER_SUBTITLES: Record<Tier, string> = {
  good: "Fix the immediate problem",
  better: "Fix + prevent next failure",
  best: "Full system tune-up",
}

export function EstimateTiers({ estimate, onSelect }: Props) {
  const tierLines = (tier: Tier): EstimateLine[] =>
    estimate.lines.filter((l) => l.tier === tier)
  const tierTotal = (tier: Tier) =>
    tierLines(tier).reduce((sum, l) => sum + l.unitPrice * l.quantity, 0)

  return (
    <div className="space-y-4 max-w-sm mx-auto">
      <div className="text-center mb-6">
        <h2 className="font-bold text-lg">Choose your service option</h2>
        {estimate.job?.title && (
          <p className="text-sm text-muted-foreground mt-1">{estimate.job.title}</p>
        )}
      </div>

      {(["good", "better", "best"] as Tier[]).map((tier) => (
        <button
          key={tier}
          onClick={() => onSelect(tier)}
          className={`w-full text-left border-2 rounded-xl p-4 transition-colors relative ${
            tier === "better"
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/50"
          }`}
        >
          {tier === "better" && (
            <span className="absolute -top-2.5 left-4 bg-primary text-primary-foreground text-xs font-bold px-2 py-0.5 rounded">
              MOST POPULAR
            </span>
          )}
          <div className="flex justify-between items-start">
            <div>
              <div className="font-bold capitalize">{tier}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{TIER_SUBTITLES[tier]}</div>
            </div>
            <div className="text-xl font-extrabold">${tierTotal(tier).toFixed(0)}</div>
          </div>
          <div className="mt-2 text-xs text-muted-foreground leading-relaxed">
            {tierLines(tier).map((l) => l.name).join(" · ")}
          </div>
        </button>
      ))}
    </div>
  )
}
