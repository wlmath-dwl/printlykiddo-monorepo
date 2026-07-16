import OpengraphImage, { alt, contentType, size } from "./opengraph-image";

// Twitter image 复用与 Open Graph 一样的图片，避免重复定义。
export { alt, contentType, size };
export default OpengraphImage;
