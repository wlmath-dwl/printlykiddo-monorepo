import type { Metadata } from "next";

import { StaticInfoPage } from "@/components/static-info-page";
import { SITE_DOMAIN_LABEL } from "@/lib/site-seo";

export const metadata: Metadata = {
  title: `Terms of Use | ${SITE_DOMAIN_LABEL}`,
  description:
    "Terms of use and printable use policy for parents, teachers, homeschool families, and adult caregivers using PrintlyKiddo PDF resources.",
  alternates: {
    canonical: "/terms",
  },
};

export default function TermsPage() {
  return (
    <StaticInfoPage
      eyebrow="Terms of use"
      title="Terms for using printable learning resources"
      description="PrintlyKiddo provides printables and ready-to-print PDF resources for adults preparing learning activities for children at home or in classrooms."
      sections={[
        {
          title: "Adult use of the website",
          body: "The website experience is intended for parents, teachers, and other adult caregivers who choose and print resources for children to use offline.",
        },
        {
          title: "Free printable use",
          body: "PrintlyKiddo printables are free for personal, classroom, homeschool, tutoring, childcare, and library use. Adults may download, print, and share printed copies with children, students, families, or small learning groups for non-commercial educational activities.",
        },
        {
          title: "What you may do",
          body: "You may print copies for home practice, classroom centers, lesson activities, quiet time, take-home packets, homeschool lessons, library programs, and similar educational uses. You may also link to PrintlyKiddo pages when sharing a resource with parents, teachers, or caregivers.",
        },
        {
          title: "What you may not do",
          body: "You may not sell, license, redistribute, or upload PrintlyKiddo PDF files, images, worksheets, or activity pages to another website, marketplace, file-sharing service, or resource library. You may not use the artwork as standalone clipart, graphics, templates, merchandise, or digital products for resale.",
        },
        {
          title: "Copyright and ownership",
          body: "Unless otherwise stated, the printable pages, illustrations, layouts, text, and PDF resources on PrintlyKiddo are protected by copyright and are provided under this limited free-use policy. Free access does not transfer ownership of the files or artwork.",
        },
        {
          title: "AI-assisted illustrations",
          body: "Some illustrations and printable materials may be created with the help of AI tools and reviewed before publishing. PrintlyKiddo aims to provide original, child-friendly, and non-infringing printable resources, and avoids intentional use of protected characters, brands, or copyrighted artwork.",
        },
        {
          title: "No child participation features",
          body: "PrintlyKiddo does not provide child accounts, public child profiles, child messaging, or child-upload features as part of the printable resource flow.",
        },
        {
          title: "Printing responsibility",
          body: "Adults are responsible for checking printer settings, paper size, page count, and suitability of each resource before distributing printed materials.",
        },
        {
          title: "Copyright concerns",
          body: "If you believe any content on PrintlyKiddo may infringe your rights, please contact us with the page URL, a description of the concern, and enough information for us to review the request. We will review reasonable notices and remove or update content when appropriate.",
        },
      ]}
    />
  );
}
