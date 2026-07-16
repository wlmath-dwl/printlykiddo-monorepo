import type { Metadata } from "next";

import { StaticInfoPage } from "@/components/static-info-page";
import { SITE_DOMAIN_LABEL } from "@/lib/site-seo";

export const metadata: Metadata = {
  title: `How to Print Printables and PDF Worksheets | ${SITE_DOMAIN_LABEL}`,
  description:
    "A practical PDF printing guide for parents and teachers using PrintlyKiddo printables, worksheets, coloring pages, and classroom activity pages.",
  alternates: {
    canonical: "/how-to-print",
  },
};

export default function HowToPrintPage() {
  return (
    <StaticInfoPage
      eyebrow="How to print"
      title="How to print PDF printables, worksheets, and coloring pages"
      description="PrintlyKiddo resources are designed for adults to preview, download as PDFs, and print for offline home practice, classroom centers, packets, and child-friendly activities."
      sections={[
        {
          title: "Start with the online preview",
          body: "Open the printable page first and review the images, worksheet style, and page count before downloading. This helps parents and teachers choose the right activity before using paper or ink.",
        },
        {
          title: "Download the PDF before printing",
          body: "For the most reliable results, download the PDF and open it in your browser, Preview, Adobe Acrobat, or your device's built-in PDF viewer. Printing from a saved PDF usually gives better control than printing a web page directly.",
        },
        {
          title: "Choose Letter or A4 paper",
          body: "Use Letter size for most printers in the United States and Canada. Use A4 for many international printers. If the printable looks cropped, switch the paper size in your printer dialog and check the preview again.",
        },
        {
          title: "Use fit-to-page when needed",
          body: "If the edges are too close to the paper margin, choose Fit, Fit to printable area, or Scale to fit in your print settings. For worksheets with handwriting lines or detailed coloring areas, avoid custom scaling that makes the activity too small.",
        },
        {
          title: "Pick full-page or two-per-page layouts",
          body: "Full-page printing is best for coloring pages, tracing practice, cutting activities, and worksheets where children need more space. Two-per-page layouts can save paper for quick review, classroom centers, warmups, or smaller take-home practice.",
        },
        {
          title: "Print in color or black and white",
          body: "Color printing works well for visual themes and display activities. Black-and-white or grayscale printing is often enough for worksheets, coloring pages, and classroom copies where children will add their own color.",
        },
        {
          title: "Make a quick test print",
          body: "Before printing a full classroom set or a multi-page packet, print one page first. Check that the margins, page orientation, and image size look right, then print the rest.",
        },
        {
          title: "Prepare offline learning activities",
          body: "After printing, use the pages away from the website for parent-guided learning, classroom routines, morning work, centers, quiet time, travel folders, substitute packets, or extra practice at home.",
        },
      ]}
    />
  );
}
