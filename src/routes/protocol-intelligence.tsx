import { createFileRoute } from "@tanstack/react-router";
import { EngineeringDashboard } from "@/components/engineering/Dashboard";
import { useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/protocol-intelligence")({
  component: ProtocolIntelligencePage,
});

function ProtocolIntelligencePage() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-black overflow-hidden">
      <EngineeringDashboard onClose={() => navigate({ to: "/" })} />
    </div>
  );
}
