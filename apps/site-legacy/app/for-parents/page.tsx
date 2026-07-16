import type { Metadata } from "next";

import { StaticInfoPage } from "@/components/static-info-page";
import { SITE_DOMAIN_LABEL } from "@/lib/site-seo";

export const metadata: Metadata = {
  title: `For Parents | Print-at-Home Printables | ${SITE_DOMAIN_LABEL}`,
  description:
    "Print-at-home printables, coloring pages, and PDF activities for parents planning child-friendly learning practice at home.",
  alternates: {
    canonical: "/for-parents",
  },
};

export default function ForParentsPage() {
  return (
    <StaticInfoPage
      eyebrow="For parents"
      title="Print-at-home printables for parent-guided practice"
      description="Use PrintlyKiddo to find simple printable learning activities for home practice, quiet time, weekend review, and parent-guided routines."
      sections={[
        {
          title: "Choose by topic or skill",
          body: "Browse themes, early learning skills, tracing, coloring, cutting practice, and printables that fit the activity you want to prepare.",
        },
        {
          title: "Preview before printing",
          body: "Open resource pages to check the printable style and page count before downloading a PDF for your printer.",
        },
        {
          title: "Support home routines",
          body: "Use printables for morning practice, quiet time, travel folders, weekend review, or extra practice at home.",
        },
        {
          title: "Adult-managed downloads",
          body: "The browsing and download flow is intended for parents and caregivers who select materials for children to use offline.",
        },
      ]}
    />
  );
}
