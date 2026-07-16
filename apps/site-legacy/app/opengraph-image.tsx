import { ImageResponse } from "next/og";

/**
 * 默认社交分享图，自动用于所有没有自定义 og:image 的页面。
 * Next.js 在 build 时把这个组件渲染成一张 1200×630 PNG，
 * 并自动注入对应的 <meta property="og:image"> 与 <meta name="twitter:image">。
 *
 * 资源页等已经在 generateMetadata 里设了自己 og:image 的页面会覆盖这个默认值。
 *
 * 注意：在 OpenNext on Cloudflare 上不要声明 `runtime = "edge"`，
 *      OpenNext 要求所有路由跑同一个 worker bundle；用默认 nodejs 即可。
 */

export const contentType = "image/png";
export const size = { width: 1200, height: 630 };
export const alt =
  "PrintlyKiddo — Free printables for parents, teachers, and adult caregivers";

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          background:
            "linear-gradient(135deg, #FBFAF6 0%, #FFF6D8 100%)",
          padding: "80px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 24,
            marginBottom: 48,
          }}
        >
          <div
            style={{
              width: 96,
              height: 96,
              borderRadius: 24,
              background: "#E9A90B",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 56,
              fontWeight: 800,
              color: "#3D3522",
              boxShadow: "0 12px 32px rgba(61, 53, 34, 0.18)",
            }}
          >
            P
          </div>
          <div
            style={{
              fontSize: 72,
              fontWeight: 800,
              color: "#3D3522",
              letterSpacing: "-0.02em",
              display: "flex",
            }}
          >
            <span>Printly</span>
            <span style={{ color: "#C58B00" }}>Kiddo</span>
          </div>
        </div>

        <div
          style={{
            fontSize: 48,
            fontWeight: 700,
            color: "#3D3522",
            textAlign: "center",
            lineHeight: 1.15,
            maxWidth: 960,
            display: "flex",
          }}
        >
          Free printables for parents &amp; teachers
        </div>

        <div
          style={{
            marginTop: 32,
            fontSize: 28,
            color: "#5C4B37",
            textAlign: "center",
            lineHeight: 1.4,
            maxWidth: 880,
            display: "flex",
          }}
        >
          Coloring pages, tracing worksheets, scissor skills practice, and
          ready-to-print PDFs.
        </div>

        <div
          style={{
            marginTop: 56,
            padding: "16px 28px",
            borderRadius: 999,
            background: "#FFFFFF",
            border: "2px solid #E9A90B",
            color: "#3D3522",
            fontSize: 24,
            fontWeight: 700,
            display: "flex",
          }}
        >
          printlykiddo.com
        </div>
      </div>
    ),
    {
      ...size,
    },
  );
}
