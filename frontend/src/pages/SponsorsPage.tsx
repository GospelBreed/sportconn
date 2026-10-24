import { LeadsPage } from "./LeadsPage";
import { SponsorExecutionPanel } from "@/features/sponsors/SponsorExecutionPanel";

export function SponsorsPage() {
  return (
    <LeadsPage
      pipeline="sponsor"
      eyebrow="Business development"
      title="Sponsors"
      subtitle="Brands and organizations SportConn is pursuing for sponsorship."
      emptyLabel="sponsor"
      renderSummary={(openLead) => <SponsorExecutionPanel onOpenLead={openLead} />}
    />
  );
}
