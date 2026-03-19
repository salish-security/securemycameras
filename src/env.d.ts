/// <reference types="astro/client" />

type Runtime = import("@astrojs/cloudflare").Runtime<{
  ASSETS: Fetcher;
  PRIVATE_FILES: R2Bucket;
  PADDLE_WEBHOOK_SECRET: string;
  CONVERTKIT_API_SECRET: string;
  CONVERTKIT_PURCHASE_TAG: string;
  KIT_API_KEY: string;
  KIT_FORM_ID: string;
  SUPPORT_EMAIL: string;
  PRODUCT_NAME: string;
}>;

declare namespace App {
  interface Locals extends Runtime {}
}
