// src/worker.ts
import { Worker, NativeConnection } from "@temporalio/worker";
import * as bankingActivities from "./activities/banking-activities";

async function run() {
  try {
    // Debug: Check environment variables
    console.log("TEMPORAL_ADDRESS:", process.env.TEMPORAL_ADDRESS);
    console.log("TEMPORAL_NAMESPACE:", process.env.TEMPORAL_NAMESPACE);
    console.log("TEMPORAL_API_KEY exists:", !!process.env.TEMPORAL_API_KEY);

    console.log("Starting Temporal Banking Worker...");

    // Create connection to Temporal Cloud
    const connection = await NativeConnection.connect({
      address: process.env.TEMPORAL_ADDRESS!,
      tls: {
        serverName: process.env.TEMPORAL_NAMESPACE!.split(".")[0],
      },
      metadata: {
        "temporal-namespace": process.env.TEMPORAL_NAMESPACE!,
        authorization: `Bearer ${process.env.TEMPORAL_API_KEY!}`,
      },
    });

    const worker = await Worker.create({
      connection,
      namespace: process.env.TEMPORAL_NAMESPACE!,
      workflowsPath: new URL("./workflows", import.meta.url).pathname,
      activities: bankingActivities, // Now using banking activities instead of hello activities
      taskQueue: "payment-processing", // More descriptive task queue name
    });

    console.log("Banking Worker created successfully");
    console.log("Available activities:", Object.keys(bankingActivities));
    await worker.run();
  } catch (error) {
    console.error("Worker failed:", error);
    process.exit(1);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
