/**
 * Sprite Asset Manager: Preloads & Renders Game Sprites from uiset4.png, uiset.png, uiset2.png, uiset3.png
 */

// Cached image instances
const imageCache = {};

export function getGameImage(src) {
  if (typeof window === "undefined") return null;
  if (!imageCache[src]) {
    const img = new Image();
    img.src = src;
    imageCache[src] = img;
  }
  return imageCache[src];
}

// 8 Run Animation Frames from uiset4.png (360x360)
export const CHARACTER_SPRITE_FRAMES = [
  { sx: 40, sy: 22, sw: 64, sh: 88 },   // Frame 0: Run Step 1
  { sx: 144, sy: 32, sw: 66, sh: 88 },  // Frame 1: Run Step 2
  { sx: 248, sy: 32, sw: 62, sh: 88 },  // Frame 2: Run Step 3
  { sx: 48, sy: 132, sw: 62, sh: 88 },  // Frame 3: Run Step 4
  { sx: 158, sy: 142, sw: 64, sh: 88 }, // Frame 4: Run Step 5
  { sx: 258, sy: 138, sw: 62, sh: 88 }, // Frame 5: Run Step 6
  { sx: 64, sy: 254, sw: 60, sh: 88 },  // Frame 6: Run Step 7
  { sx: 168, sy: 254, sw: 60, sh: 88 }, // Frame 7: Run Step 8
];

// UI Button crops from uiset.png (585x360)
export const UISET_CROPS = {
  // Top Circle Buttons (46x46)
  homeCircleBlue: { sx: 27, sy: 18, sw: 46, sh: 46 },
  closeCircleRed: { sx: 175, sy: 18, sw: 46, sh: 46 },
  settingsCircleGreen: { sx: 366, sy: 18, sw: 46, sh: 46 },
  musicCircleOrange: { sx: 440, sy: 18, sw: 46, sh: 46 },
  pauseCircleBlue: { sx: 514, sy: 18, sw: 46, sh: 46 },

  // Glossy Rounded Action Buttons
  btnBlueWide: { sx: 376, sy: 140, sw: 104, sh: 38 },
  btnGreenWide: { sx: 376, sy: 194, sw: 104, sh: 38 },
  btnOrangeWide: { sx: 376, sy: 248, sw: 104, sh: 38 },
  btnRedWide: { sx: 376, sy: 302, sw: 104, sh: 38 },

  // Square Icon Buttons (40x40)
  btnBlueSquare: { sx: 60, sy: 140, sw: 40, sh: 40 },
  btnGreenSquare: { sx: 60, sy: 194, sw: 40, sh: 40 },
  btnOrangeSquare: { sx: 60, sy: 248, sw: 40, sh: 40 },
  btnRedSquare: { sx: 60, sy: 302, sw: 40, sh: 40 },

  // Rounded Circle Buttons (38x38)
  btnBlueRound: { sx: 14, sy: 140, sw: 38, sh: 38 },
  btnGreenRound: { sx: 14, sy: 194, sw: 38, sh: 38 },
  btnOrangeRound: { sx: 14, sy: 248, sw: 38, sh: 38 },
  btnRedRound: { sx: 14, sy: 302, sw: 38, sh: 38 },
};

// UI Panel & Progress crops from uiset3.png (438x626)
export const UISET3_CROPS = {
  woodPanelCard: { sx: 24, sy: 24, sw: 148, sh: 120 },
  woodHeaderBanner: { sx: 180, sy: 24, sw: 110, sh: 120 },
  woodVictoryBanner: { sx: 300, sy: 24, sw: 110, sh: 120 },
  woodButtonPlay: { sx: 65, sy: 760, sw: 80, sh: 28 },
  woodButtonStore: { sx: 155, sy: 760, sw: 80, sh: 28 },
  woodProgressBarBg: { sx: 338, sy: 320, sw: 76, sh: 18 },
  woodProgressBarFillGreen: { sx: 20, sy: 50, sw: 50, sh: 10 },
};
