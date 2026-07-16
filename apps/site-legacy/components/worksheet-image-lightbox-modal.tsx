"use client";

type PreviewImage = {
  src: string;
  title: string;
};

type LightboxModalProps = {
  preview: PreviewImage;
  onClose: () => void;
};

export function LightboxModal({ preview, onClose }: LightboxModalProps) {
  return (
    <button
      type="button"
      className="fixed inset-0 z-[100] flex cursor-zoom-out items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      aria-label="Close enlarged worksheet preview"
      onClick={onClose}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={preview.src}
        alt={preview.title}
        className="max-h-[92vh] max-w-[92vw] object-contain shadow-2xl"
        decoding="async"
      />
    </button>
  );
}
