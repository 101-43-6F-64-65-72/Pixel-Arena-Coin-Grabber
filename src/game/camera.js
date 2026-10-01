import { WORLD_WIDTH, WORLD_HEIGHT, VIEWPORT_WIDTH, VIEWPORT_HEIGHT } from "@/lib/arena";

/**
 * 2D Camera Controller for Large Arena Worlds
 */
export class Camera {
  constructor(viewportWidth = VIEWPORT_WIDTH, viewportHeight = VIEWPORT_HEIGHT) {
    this.viewportWidth = viewportWidth;
    this.viewportHeight = viewportHeight;
    this.x = 0;
    this.y = 0;
    this.targetX = 0;
    this.targetY = 0;
  }

  /**
   * Update camera target to center on player and smoothly interpolate
   */
  follow(playerX, playerY, smoothFactor = 0.15) {
    // Ideal camera center
    const idealX = playerX - this.viewportWidth / 2;
    const idealY = playerY - this.viewportHeight / 2;

    // Clamp within world bounds
    const maxX = Math.max(0, WORLD_WIDTH - this.viewportWidth);
    const maxY = Math.max(0, WORLD_HEIGHT - this.viewportHeight);

    this.targetX = Math.max(0, Math.min(maxX, idealX));
    this.targetY = Math.max(0, Math.min(maxY, idealY));

    // Smooth linear interpolation (lerp)
    this.x += (this.targetX - this.x) * smoothFactor;
    this.y += (this.targetY - this.y) * smoothFactor;
  }

  /**
   * Snap camera directly without smoothing (e.g. on spawn/respawn/teleport)
   */
  snapTo(playerX, playerY) {
    const idealX = playerX - this.viewportWidth / 2;
    const idealY = playerY - this.viewportHeight / 2;
    const maxX = Math.max(0, WORLD_WIDTH - this.viewportWidth);
    const maxY = Math.max(0, WORLD_HEIGHT - this.viewportHeight);

    this.x = Math.max(0, Math.min(maxX, idealX));
    this.y = Math.max(0, Math.min(maxY, idealY));
    this.targetX = this.x;
    this.targetY = this.y;
  }

  /**
   * Convert World Coordinates -> Viewport Canvas Coordinates
   */
  worldToScreen(worldX, worldY) {
    return {
      x: Math.round(worldX - this.x),
      y: Math.round(worldY - this.y),
    };
  }

  /**
   * Convert Viewport Canvas Coordinates -> World Coordinates
   */
  screenToWorld(screenX, screenY) {
    return {
      x: Math.round(screenX + this.x),
      y: Math.round(screenY + this.y),
    };
  }

  /**
   * Check if a world bounding box/point is visible inside current viewport
   */
  isVisible(worldX, worldY, radius = 40) {
    return (
      worldX + radius >= this.x &&
      worldX - radius <= this.x + this.viewportWidth &&
      worldY + radius >= this.y &&
      worldY - radius <= this.y + this.viewportHeight
    );
  }
}
