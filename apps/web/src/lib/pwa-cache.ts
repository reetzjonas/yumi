export const API_CACHE_NAME = "yumi-api-v1";

// Call before logout or household switching; cached reads belong to that session.
export async function clearApiCache() {
  if ("caches" in globalThis) {
    await caches.delete(API_CACHE_NAME);
  }
}
