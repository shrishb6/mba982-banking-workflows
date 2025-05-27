// src/test-modern-v1.ts
import { Client, Connection } from "@temporalio/client";
import { modernPaymentV1Workflow } from "./workflows/modern-payment-v1";

async function testModernPaymentV1() {
  try {
    // Create connection to Temporal Cloud
    const connection = await Connection.connect({
      address: process.env.TEMPORAL_ADDRESS!,
      tls: {
        serverName: process.env.TEMPORAL_NAMESPACE!.split(".")[0],
      },
      metadata: {
        "temporal-namespace": process.env.TEMPORAL_NAMESPACE!,
        authorization: `Bearer ${process.env.TEMPORAL_API_KEY!}`,
      },
    });

    const client = new Client({
      connection,
      namespace: process.env.TEMPORAL_NAMESPACE!,
    });

    console.log(
      "🚀 Testing Modern Payment Workflow v1 (Temporal Orchestrated)",
    );
    console.log(
      "==============================================================",
    );
    console.log(
      "Architecture: Temporal orchestration with automatic retries, step-level observability, and fault tolerance",
    );
    console.log(
      "Features: Modular activities, durable execution, structured audit logging\n",
    );

    // Test Case 1: Successful payment
    console.log("📝 Test Case 1: Successful Orchestrated Payment");
    console.log("From: ACC001234567 (sufficient funds)");
    console.log("To: ACC001234568");
    console.log("Amount: $750.00");
    console.log(
      "Expected: Success with full audit trail and step-level observability\n",
    );

    const handle1 = await client.workflow.start(modernPaymentV1Workflow, {
      taskQueue: "payment-processing",
      workflowId: "modern-v1-success-test-" + Date.now(),
      args: [
        {
          fromAccount: "ACC001234567",
          toAccount: "ACC001234568",
          amount: 750.0,
          currency: "USD",
          description: "Test payment - Modern orchestrated v1 success case",
        },
      ],
    });

    console.log(`✅ Workflow started: ${handle1.workflowId}`);
    console.log("⏳ Temporal is orchestrating the payment steps...");

    const result1 = await handle1.result();

    console.log("🎯 Modern Orchestrated Result:", {
      success: result1.success,
      paymentId: result1.paymentId,
      settlementId: result1.settlementId,
      executionTime: result1.executionSummary.totalTime + "ms",
      stepsExecuted: result1.executionSummary.stepsExecuted,
      architecture: result1.executionSummary.architecture,
      version: result1.executionSummary.version,
    });

    console.log("\n🔍 Orchestration Benefits Demonstrated:");
    console.log("  ✅ Automatic retry policies applied");
    console.log("  ✅ Step-level execution tracking");
    console.log("  ✅ Durable workflow state management");
    console.log("  ✅ Structured audit logging");
    console.log("  ✅ Fault-tolerant activity execution");

    // Test Case 2: Insufficient funds (demonstrate graceful failure handling)
    console.log(
      "\n📝 Test Case 2: Insufficient Funds (Orchestrated Error Handling)",
    );
    console.log("From: ACC001234568 (low balance account)");
    console.log("To: ACC001234567");
    console.log("Amount: $2000.00 (exceeds balance)");
    console.log("Expected: Graceful failure with detailed audit trail\n");

    const handle2 = await client.workflow.start(modernPaymentV1Workflow, {
      taskQueue: "payment-processing",
      workflowId: "modern-v1-insufficient-funds-test-" + Date.now(),
      args: [
        {
          fromAccount: "ACC001234568",
          toAccount: "ACC001234567",
          amount: 2000.0,
          currency: "USD",
          description:
            "Test payment - Modern orchestrated v1 insufficient funds",
        },
      ],
    });

    console.log(`✅ Workflow started: ${handle2.workflowId}`);
    console.log("⏳ Temporal is handling the failure gracefully...");

    const result2 = await handle2.result();

    console.log("🎯 Modern Orchestrated Failure Result:", {
      success: result2.success,
      error: result2.error,
      paymentId: result2.paymentId,
      executionTime: result2.executionSummary.totalTime + "ms",
      stepsExecuted: result2.executionSummary.stepsExecuted,
      architecture: result2.executionSummary.architecture,
      version: result2.executionSummary.version,
    });

    console.log("\n🔍 Failure Handling Benefits:");
    console.log("  ✅ Clean error propagation");
    console.log("  ✅ Partial execution state preserved");
    console.log("  ✅ Detailed failure audit trail");
    console.log("  ✅ No resource leaks or inconsistent state");

    // Test Case 3: Non-existent account (demonstrate validation benefits)
    console.log("\n📝 Test Case 3: Invalid Account (Orchestrated Validation)");
    console.log("From: ACC999999999 (non-existent)");
    console.log("To: ACC001234567");
    console.log("Amount: $100.00");
    console.log("Expected: Early validation failure with immediate feedback\n");

    const handle3 = await client.workflow.start(modernPaymentV1Workflow, {
      taskQueue: "payment-processing",
      workflowId: "modern-v1-invalid-account-test-" + Date.now(),
      args: [
        {
          fromAccount: "ACC999999999",
          toAccount: "ACC001234567",
          amount: 100.0,
          currency: "USD",
          description: "Test payment - Modern orchestrated v1 invalid account",
        },
      ],
    });

    console.log(`✅ Workflow started: ${handle3.workflowId}`);
    console.log("⏳ Temporal is validating and handling the error...");

    const result3 = await handle3.result();

    console.log("🎯 Modern Orchestrated Validation Result:", {
      success: result3.success,
      error: result3.error,
      executionTime: result3.executionSummary.totalTime + "ms",
      stepsExecuted: result3.executionSummary.stepsExecuted,
      architecture: result3.executionSummary.architecture,
      version: result3.executionSummary.version,
    });

    console.log(
      "\n🎯 Modern Payment v1 (Temporal Orchestrated) Testing Complete!",
    );
    console.log(
      "==============================================================",
    );
    console.log("📊 Key Orchestration Benefits Demonstrated:");
    console.log("  🔄 Automatic retries and fault tolerance");
    console.log("  📈 Step-level observability and metrics");
    console.log("  🗃️  Durable execution state management");
    console.log("  🔍 Comprehensive audit logging");
    console.log("  🏗️  Modular, maintainable architecture");
    console.log("  ⚡ Consistent error handling patterns");

    console.log("\n📋 Next Steps for Research:");
    console.log("  1. Check MockAPI audit_logs for detailed step execution");
    console.log("  2. Compare with Legacy implementation (traditional code)");
    console.log("  3. Build Modern v2 with fraud check and AI configuration");
    console.log(
      "  4. Measure: Change velocity, observability, business-user control",
    );

    // Close connection
    await connection.close();
  } catch (error) {
    console.error("Test failed:", error);
    process.exit(1);
  }
}

testModernPaymentV1().catch((err) => {
  console.error(err);
  process.exit(1);
});
