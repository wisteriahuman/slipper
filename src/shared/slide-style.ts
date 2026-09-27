// Shared by the panel and the image review renderer.
export const SLIDE_LINE_WIDTH = 3;
export const SLIDE_CSS = `
.slide-stage { font-family: Arial, "Hiragino Sans", sans-serif; }
.slide-frame { position: relative; overflow: hidden; border: 1px solid var(--line); border-radius: 4px; }
.slide-stage { position: relative; transform-origin: 0 0; }
.el { position: absolute; white-space: pre-wrap; line-height: 1.25; overflow: hidden; }
.el-asset { display: grid; place-items: center; background: #d9d6cd; color: #555; font-size: 16px; }
.el-asset img { width: 100%; height: 100%; object-fit: fill; }
.decor { position: absolute; pointer-events: none; }
.el-asset.cropped { background-color: transparent; }
.crop-mask { position: absolute; display: block; pointer-events: none; }
`;
