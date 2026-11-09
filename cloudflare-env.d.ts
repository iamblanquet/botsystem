declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    ENCRYPTION_KEY?: string;
    GEMINI_API_KEY?: string;
  }
}
