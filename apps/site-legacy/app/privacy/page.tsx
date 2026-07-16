import type { Metadata } from "next";

import { StaticInfoPage } from "@/components/static-info-page";
import { SITE_DOMAIN_LABEL } from "@/lib/site-seo";

export const metadata: Metadata = {
  title: `Privacy Policy | ${SITE_DOMAIN_LABEL}`,
  description:
    "Privacy, data protection, retention, security, and contact information for PrintlyKiddo users and API integrations.",
  alternates: {
    canonical: "/privacy",
  },
};

export default function PrivacyPage() {
  return (
    <StaticInfoPage
      eyebrow="Privacy policy"
      title="Privacy, data protection, and contact information"
      description="PrintlyKiddo is intended for adults who choose, download, and print learning resources for children. This policy explains what data we collect, how we protect it, how long we retain it, and how to contact us."
      sections={[
        {
          title: "Personal data we collect",
          body: "PrintlyKiddo does not require users to create accounts, register profiles, post comments, upload files, or provide personal information to browse, download, or print resources. We do not knowingly collect personal information from children.",
        },
        {
          title: "Pinterest API data",
          body: "If PrintlyKiddo uses Pinterest API access, any Pinterest data accessed is used only to provide the requested website or business functionality. We do not sell Pinterest user data, and we do not use it for unrelated advertising, profiling, or resale.",
        },
        {
          title: "Operational data",
          body: "Like most websites, PrintlyKiddo may process limited technical information such as browser type, device information, IP-derived region, pages visited, and request logs. This information is used to operate the website, troubleshoot errors, prevent abuse, understand performance, and improve printable resource discovery.",
        },
        {
          title: "Print history stored on your device",
          body: "When you download or print a resource, PrintlyKiddo saves a short record of it (such as the title, category, activity type, thumbnail, and time) in your own browser's local storage so you can quickly find recently printed activities. This history is stored only on your device and is never uploaded to our servers, shared, sold, or used to identify or track you. You stay in full control: use the \"Clear all\" button on the My Activities page, or clear your browser storage, to remove it at any time. Clearing your browser data, switching devices, or using private/incognito mode will also remove or hide this history.",
        },
        {
          title: "Data retention",
          body: "We retain operational logs and technical data only for as long as reasonably necessary to operate, secure, debug, and improve the website, unless a longer retention period is required by law. We do not intentionally retain Pinterest user data beyond what is necessary to complete the requested API-related action.",
        },
        {
          title: "Data protection and security",
          body: "We use reasonable technical and organizational safeguards to protect information processed by PrintlyKiddo, including secure hosting, access controls, and limiting data use to operational purposes. No internet service can guarantee absolute security, but we work to reduce unauthorized access, misuse, alteration, or loss.",
        },
        {
          title: "Third-party services",
          body: "PrintlyKiddo may rely on service providers such as hosting, analytics, search, advertising, or API platforms to operate the website. These providers may process limited technical information according to their own privacy practices and only as needed to provide their services.",
        },
        {
          title: "Your choices and deletion requests",
          body: "If you believe we have processed personal information related to you, or if you want to ask questions about access, correction, or deletion, contact us by email. We will review and respond to reasonable privacy requests.",
        },
        {
          title: "Contact",
          body: "For privacy questions, data protection inquiries, or data deletion requests, please contact us at yangmeimei12345678@gmail.com.",
        },
      ]}
    />
  );
}
