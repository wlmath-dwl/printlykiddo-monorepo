import type { Metadata } from "next";
import Script from "next/script";
import type { ReactNode } from "react";
import { preconnect } from "react-dom";

import { JsonLd } from "@/components/json-ld";
import { SiteFooter } from "@/components/site-footer";
import { buildOrganizationSchema } from "@/lib/seo-schema";
import {
  SITE_DOMAIN_LABEL,
  SITE_IMAGE_ORIGIN,
  SITE_ORIGIN,
  SITE_RESOURCE_DESCRIPTION,
} from "@/lib/site-seo";

import "./globals.css";

const GA_MEASUREMENT_ID = "G-9TFM99RPZE";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: `PrintlyKiddo | ${SITE_DOMAIN_LABEL}`,
  description: SITE_RESOURCE_DESCRIPTION,
  // icons：Next.js 自动从 app/icon.svg + app/apple-icon.tsx 发现并注入。
  openGraph: {
    type: "website",
    siteName: "PrintlyKiddo",
    locale: "en_US",
    // 不再手写 url/images：
    // - url 由各页面 alternates.canonical 决定
    // - images 由 app/opengraph-image.tsx 自动生成 1200×630 PNG，
    //   各页面如果没自定义 og:image，会自动 fallback 到默认图
  },
  twitter: {
    card: "summary_large_image",
  },
  other: {
    "p:domain_verify": "304efe2494775766e5aa7f81cb676204",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  preconnect(SITE_IMAGE_ORIGIN);

  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-cream text-warm-ink antialiased">
        <JsonLd data={buildOrganizationSchema()} />
        {children}
        <SiteFooter />
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
          strategy="lazyOnload"
        />
        <Script id="google-analytics" strategy="lazyOnload">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_MEASUREMENT_ID}');
          `}
        </Script>
      </body>
    </html>
  );
}
