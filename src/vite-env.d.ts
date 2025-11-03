/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEBUG_LOGS?: string;
  // Add other env variables here as needed
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
