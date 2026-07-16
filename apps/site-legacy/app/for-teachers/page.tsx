import type { Metadata } from "next";

import { StaticInfoPage } from "@/components/static-info-page";
import { SITE_DOMAIN_LABEL } from "@/lib/site-seo";

export const metadata: Metadata = {
  title: `For Teachers | Classroom-Ready Printables | ${SITE_DOMAIN_LABEL}`,
  description:
    "Classroom-ready printables and PDF resources for preschool, kindergarten, and early elementary teachers.",
  alternates: {
    canonical: "/for-teachers",
  },
};

export default function ForTeachersPage() {
  return (
    <StaticInfoPage
      eyebrow="For teachers"
      title="Classroom-ready printables for educators"
      description="PrintlyKiddo helps teachers quickly find printable resources for centers, morning work, early finishers, skill practice, and take-home packets."
      sections={[
        {
          title: "Plan by classroom use",
          body: "Find worksheets and activity pages that work for literacy centers, math practice, coloring stations, scissor skills, and independent table work.",
        },
        {
          title: "Prepare PDFs quickly",
          body: "Download print-ready PDFs with common paper sizes so resources can move from planning to classroom copies with fewer steps.",
        },
        {
          title: "Support preschool and kindergarten",
          body: "Use child-friendly themes while keeping the website experience oriented around adult lesson planning and classroom preparation.",
        },
        {
          title: "Organize reusable resources",
          body: "Browse by category and activity type to build repeatable packets for small groups, substitute folders, or seasonal units.",
        },
      ]}
    />
  );
}
