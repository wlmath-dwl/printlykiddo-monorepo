/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        /** 页面大背景：更接近暖白纸张，避免大面积偏黄 */
        cream: "#FBFAF6",
        /** 控制区描边：浅暖灰 */
        "panel-line": "#E9E2D8",
        /** 下拉 / 输入浅底 */
        "select-surface": "#FAF9F6",
        /** 正文与主文案深炭咖（弃用纯黑） */
        "warm-ink": "#3D3522",
        /** 次级文案、未激活 Tab 字色 */
        "warm-coffee": "#5C4B37",
        /** 内容块主色：纸白，用层级和边框承担结构 */
        "warm-card": "#FFFFFF",
        /** 卡内上图区域：极浅暖灰，衬托插图但不过度儿童化 */
        "warm-card-soft": "#F7F4EE",
        /** 标题与强调：与 warm-ink 同系 */
        chocolate: "#3D3522",
        slate: "#5D6D7E",
        charcoal: "#3D3522",
        /** 全站 Primary CTA：Download / Print / Primary Button */
        brand: "#F59E0B",
        "brand-hover": "#D97706",
        "brand-active": "#B45309",
        "brand-disabled": "#FCD34D",
        /** 亮黄底上的字/图标：深炭咖 */
        "brand-ink": "#3D3522",
        /** 主色淡底（卡片打印按钮默认底） */
        "brand-soft": "#FFF6D8",
        /** 胶囊未选 / 下拉边框 */
        "capsule-line": "#E0E0E0",
        /** 胶囊未选 / 下拉主文字 */
        "capsule-muted": "#333333",
        /** 下拉箭头等辅助图标 */
        "dropdown-icon": "#5C4B37",
        mustard: "#F59E0B",
      },
      boxShadow: {
        /** 控制区：轻暖阴影，避免页面显得发黄 */
        "panel-warm": "0 8px 24px rgba(61, 53, 34, 0.06)",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
