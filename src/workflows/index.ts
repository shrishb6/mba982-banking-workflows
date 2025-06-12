// src/workflows/index.ts
// Export all workflows from this index file

// Original hello world workflow (keep for reference)
export * from "./hello-workflow";

// Modern payment workflow scenarios (Temporal orchestrated)
export { modernPaymentV1Workflow } from "./modern-payment-v1";
export { modernPaymentV2Workflow } from "./modern-payment-v2";
