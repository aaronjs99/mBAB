/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { createAssetCorpusSource, type AssetBinding } from "../app/search/asset-corpus-source";
import { handleSearchRequest, type CorpusSource } from "../app/search/search-handler";
import { handleChapterRequest } from "../app/search/chapter-handler";

interface Env {
  MBAB_LEGACY_SEARCH_URL?: string;
  MBAB_CHAPTER_URL?: string;
  ASSETS: {
    fetch(request: Request): Promise<Response>;
  };
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const corpusSources = new WeakMap<AssetBinding, CorpusSource>();

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && !env.MBAB_LEGACY_SEARCH_URL
      && (url.pathname === "/api/search" || url.pathname === "/api/chapter")) {
      let source = corpusSources.get(env.ASSETS);
      if (!source) {
        source = createAssetCorpusSource(env.ASSETS);
        corpusSources.set(env.ASSETS, source);
      }
      return url.pathname === "/api/search"
        ? handleSearchRequest(request, source)
        : handleChapterRequest(request, source);
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
