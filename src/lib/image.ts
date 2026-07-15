const MAX_DIMENSION = 480;
const JPEG_QUALITY = 0.85;

export function resizeImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read_failed"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("decode_failed"));
      img.onload = () => {
        let { width, height } = img;
        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
          const scale = MAX_DIMENSION / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("canvas_unavailable"));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", JPEG_QUALITY));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

// Reads back the natural pixel dimensions of an already-loaded data URL (e.g. the output of
// resizeImageFile above) — used wherever a caller needs to size a container to the image's own
// aspect ratio instead of forcing a square/fixed box around it (a square box padded a
// non-square picture out with visible empty space, bordered by the container's own frame — see
// the map editor's image layer).
export function getImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onerror = () => reject(new Error("decode_failed"));
    img.onload = () => resolve({ width: img.naturalWidth || img.width, height: img.naturalHeight || img.height });
    img.src = dataUrl;
  });
}

// Reads a file's exact bytes back as a data URL, with NO canvas re-encode and NO resizing --
// unlike resizeImageFile above (which recompresses to JPEG and caps dimensions at 480px, fine
// for portraits/backgrounds but destructive for a character sprite strip, whose frame-slicing
// math depends on the uploaded image's exact pixel width/height matching frameWidth * frameCount).
export function readImageFileLossless(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read_failed"));
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(file);
  });
}
