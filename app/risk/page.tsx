import { RiskPanelEditable } from "@/components/rextora/RiskPanelEditable";
import { PageHeader } from "@/components/rextora/StatusCards";
import { getRiskStatus } from "@/src/lib/rextora/riskManager";
import { resolveRiskState } from "@/src/lib/rextora/riskEngine";
import { getUnifiedRiskView } from "@/src/lib/rextora/metrics/riskService";

export default function RiskPage() {
  const base = getRiskStatus();
  const riskView = getUnifiedRiskView();
  const risk = { ...base, riskState: resolveRiskState(base), riskView };

  return (
    <div className="rextora-page">
      <PageHeader
        title="리스크 관리"
        description="손실 한도 사용률, 남은 여유, 거래·포지션 용량을 시각적으로 관리합니다."
      />
      <RiskPanelEditable initialRisk={risk} />
    </div>
  );
}
