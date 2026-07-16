import { ImageResponse } from "next/og";

/**
 * iOS "Add to Home Screen" 图标（180×180）。
 * Next.js 自动注入 <link rel="apple-touch-icon">。
 */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#E9A90B",
          color: "#3D3522",
          fontSize: 110,
          fontWeight: 800,
          borderRadius: 36,
        }}
      >
        P
      </div>
    ),
    { ...size },
  );
}
