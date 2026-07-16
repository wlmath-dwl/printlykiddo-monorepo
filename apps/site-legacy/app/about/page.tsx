import type { Metadata } from "next";

import { StaticInfoPage } from "@/components/static-info-page";
import { SITE_DOMAIN_LABEL } from "@/lib/site-seo";

export const metadata: Metadata = {
  title: `About PrintlyKiddo | Printable Resources for Parents & Teachers | ${SITE_DOMAIN_LABEL}`,
  description:
    "PrintlyKiddo helps parents, teachers, and adult caregivers find printables, coloring pages, and ready-to-print PDF resources for children.",
  alternates: {
    canonical: "/about",
  },
};

export default function AboutPage() {
  return (
    <StaticInfoPage
      eyebrow="About PrintlyKiddo"
      title="A printable resource website for parents, teachers, and adult caregivers"
      description="PrintlyKiddo is an adult-oriented website that helps families and educators find printables, coloring pages, tracing sheets, and ready-to-print PDF resources for children."
      paragraphs={[
        "PrintlyKiddo is designed for adults who select, organize, download, and print learning materials for children. The primary users of the site are parents, teachers, tutors, and other caregivers who are looking for practical printable resources they can use at home or in the classroom.",
        "The website covers child-friendly topics such as animals, letters, numbers, coloring, tracing, and early learning themes, but the intended audience is not children browsing on their own. The site is built for adult decision-makers who choose the right printable PDF, prepare activities, and guide children through the learning experience.",
        "Navigation, category pages, previews, and download flows are organized as a resource library rather than a child-focused entertainment product. Visitors are meant to browse topics, compare printable materials, and select printables or activity pages for lesson planning, home practice, classroom routines, and quiet time.",
        "PrintlyKiddo focuses on printable formats that adults can review before printing. This includes worksheets, coloring pages, tracing activities, scissor skills practice, and similar printables that support early learning and structured educational use.",
        "The site is not designed as a social space or interactive play destination for children. It does not depend on children creating accounts, posting content, leaving comments, or directly engaging with community features. Its purpose is to help adults find and print useful child-related learning materials in a clear, practical, and privacy-aware way.",
      ]}
    />
  );
}
