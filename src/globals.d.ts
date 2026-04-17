/**
 * Global type declarations for externally loaded libraries
 */

// Phaser is loaded globally via CDN
declare const Phaser: typeof import("phaser");

// Import the actual SDK types from the package
import type { RemixSDK as RemixSDKType } from "@remix-gg/sdk";

// Remix SDK is loaded globally via CDN
declare const RemixSDK: RemixSDKType;

// Extend window for global SDK access
declare global {
  interface Window {
    RemixSDK?: RemixSDKType;
    // Backward-compatible alias (deprecated)
    FarcadeSDK?: RemixSDKType;
  }
}

export {};
