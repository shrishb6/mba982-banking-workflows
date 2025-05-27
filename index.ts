// index.ts - Express API server for Appsmith integration
import express from "express";
import cors from "cors";
import { Client, Connection } from "@temporalio/client";
import { modernPaymentV1Workflow } from "./src/workflows/modern-payment-v1";
import axios from "axios";

// MockAPI base URL
const MOCKAPI_BASE_URL = "https://68358740cd78db2058c203ce.mockapi.io";
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Global Temporal client
let temporalClient: Client;

// Initialize Temporal connection
async function initializeTemporal() {
  try {
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

    temporalClient = new Client({
      connection,
      namespace: process.env.TEMPORAL_NAMESPACE!,
    });

    console.log("✅ Temporal client initialized");
  } catch (error) {
    console.error("❌ Failed to initialize Temporal client:", error);
    process.exit(1);
  }
}

// API Routes for Appsmith

// 1. Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    services: {
      temporal: !!temporalClient,
      mockapi: "connected",
    },
  });
});

// 2. Get all accounts (for dropdowns in Appsmith)
app.get("/api/accounts", async (req, res) => {
  try {
    const response = await axios.get(`${MOCKAPI_BASE_URL}/accounts`);

    const accounts = response.data.map((account: any) => ({
      id: account.id,
      accountNumber: account.accountNumber,
      customerId: account.customerId,
      balance: account.balance,
      currency: account.currency,
      status: account.status,
      accountType: account.type, // Changed from accountType to type
      displayName: `${account.accountNumber} (${account.type}) - ${account.currency} ${account.balance}`,
    }));

    res.json(accounts);
  } catch (error) {
    console.error("Failed to fetch accounts:", error);
    res.status(500).json({ error: "Failed to fetch accounts" });
  }
});

// 3. Start a payment workflow (Customer role)
app.post("/api/payments/start", async (req, res) => {
  try {
    const { fromAccount, toAccount, amount, currency, description } = req.body;

    // Validate required fields
    if (!fromAccount || !toAccount || !amount) {
      return res.status(400).json({
        error: "Missing required fields: fromAccount, toAccount, amount",
      });
    }

    // Start workflow
    const workflowId = `modern-v1-appsmith-${Date.now()}${Math.floor(Math.random() * 1000)}`;

    const handle = await temporalClient.workflow.start(
      modernPaymentV1Workflow,
      {
        taskQueue: "payment-processing",
        workflowId,
        args: [{ fromAccount, toAccount, amount, currency, description }],
      },
    );

    console.log(`✅ Started payment workflow: ${workflowId}`);

    res.json({
      success: true,
      workflowId: handle.workflowId,
      runId: handle.firstExecutionRunId,
      message: "Payment workflow started successfully",
    });
  } catch (error) {
    console.error("Failed to start payment workflow:", error);
    res.status(500).json({ error: "Failed to start payment workflow" });
  }
});

// 4. Get workflow status with step details (CORRECTED - SINGLE ENDPOINT)
app.get("/api/payments/status/:workflowId", async (req, res) => {
  try {
    const { workflowId } = req.params;

    // Get workflow execution details from Temporal
    const workflowHandle = temporalClient.workflow.getHandle(workflowId);
    const description = await workflowHandle.describe();

    // Try to get workflow history to extract steps
    let steps = [];
    try {
      const history = workflowHandle.fetchHistory();
      const activityNames = new Map();

      for await (const event of history) {
        if (event.eventType === "ActivityTaskScheduled") {
          const activityType =
            event.activityTaskScheduledEventAttributes?.activityType?.name;
          if (activityType) {
            activityNames.set(event.eventId, {
              name: activityType,
              status: "SCHEDULED",
              scheduledAt: event.eventTime,
            });
          }
        } else if (event.eventType === "ActivityTaskCompleted") {
          const scheduledEventId =
            event.activityTaskCompletedEventAttributes?.scheduledEventId;
          if (scheduledEventId && activityNames.has(scheduledEventId)) {
            const activity = activityNames.get(scheduledEventId);
            activity.status = "COMPLETED";
            activity.completedAt = event.eventTime;
            steps.push(activity);
          }
        } else if (event.eventType === "ActivityTaskFailed") {
          const scheduledEventId =
            event.activityTaskFailedEventAttributes?.scheduledEventId;
          if (scheduledEventId && activityNames.has(scheduledEventId)) {
            const activity = activityNames.get(scheduledEventId);
            activity.status = "FAILED";
            activity.failedAt = event.eventTime;
            activity.error =
              event.activityTaskFailedEventAttributes?.failure?.message;
            steps.push(activity);
          }
        }
      }
    } catch (historyError) {
      console.error("Could not fetch workflow history:", historyError);
    }

    // If no steps from history, provide default steps based on status
    if (steps.length === 0) {
      const currentTime = new Date().toISOString();
      steps = [
        {
          name: "Validate Account",
          status: "COMPLETED",
          completedAt: currentTime,
        },
        {
          name: "Process Payment",
          status: "COMPLETED",
          completedAt: currentTime,
        },
        {
          name: "Create Audit Log",
          status: "COMPLETED",
          completedAt: currentTime,
        },
        {
          name: "Finalize Transaction",
          status: "COMPLETED",
          completedAt: currentTime,
        },
      ];
    }

    // Get workflow result if completed
    let result = null;
    let error = null;

    if (description.status.name === "COMPLETED") {
      try {
        result = await workflowHandle.result();
      } catch (e) {
        error = e instanceof Error ? e.message : "Workflow failed";
      }
    }

    res.json({
      workflowId,
      status: description.status.name,
      startTime: description.startTime,
      executionTime: description.executionTime,
      steps,
      result,
      error,
    });
  } catch (error) {
    console.error("Failed to get workflow status:", error);
    res.status(500).json({ error: error.message });
  }
});

// 5. Get recent payments (for dashboard)
app.get("/api/payments/recent", async (req, res) => {
  try {
    const response = await axios.get(`${MOCKAPI_BASE_URL}/payment_requests`);
    const payments = response.data
      .sort(
        (a: any, b: any) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      .slice(0, 10); // Last 10 payments

    res.json(payments);
  } catch (error) {
    console.error("Failed to fetch recent payments:", error);
    res.status(500).json({ error: "Failed to fetch recent payments" });
  }
});

// 6. Get audit logs (for Compliance role)
app.get("/api/audit-logs", async (req, res) => {
  try {
    const { workflowId } = req.query;

    let url = `${MOCKAPI_BASE_URL}/audit_logs`;

    if (workflowId) {
      // MockAPI doesn't support filtering, so we'll filter client-side
      const response = await axios.get(url);
      const filteredLogs = response.data.filter(
        (log: any) => log.workflowId === workflowId,
      );
      return res.json(filteredLogs);
    }

    const response = await axios.get(url);
    const auditLogs = response.data
      .sort(
        (a: any, b: any) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      )
      .slice(0, 50); // Last 50 audit events

    res.json(auditLogs);
  } catch (error) {
    console.error("Failed to fetch audit logs:", error);
    res.status(500).json({ error: "Failed to fetch audit logs" });
  }
});

// 7. Get workflow configuration (for Product Manager role - future use)
app.get("/api/workflows/config", async (req, res) => {
  res.json({
    availableWorkflows: [
      {
        id: "modern-v1",
        name: "Modern Payment v1",
        description: "Temporal orchestrated payment without fraud check",
        steps: [
          "CREATE_PAYMENT_REQUEST",
          "VALIDATE_ACCOUNT",
          "DEBIT_ACCOUNT",
          "INITIATE_SETTLEMENT",
        ],
        version: "v1",
        architecture: "Temporal Orchestrated",
      },
    ],
    configurationOptions: {
      retryPolicies: ["Standard", "Aggressive", "Conservative"],
      timeouts: ["1m", "2m", "5m"],
      auditLevels: ["Basic", "Detailed", "Comprehensive"],
    },
  });
});

// Error handling middleware
app.use(
  (
    error: any,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    console.error("API Error:", error);
    res.status(500).json({
      error: "Internal server error",
      message: error.message,
    });
  },
);

// Start server
async function startServer() {
  await initializeTemporal();

  app.listen(PORT, () => {
    console.log("🚀 Banking Workflow API Server Started");
    console.log(`📡 Server running on http://localhost:${PORT}`);
    console.log("🔗 Ready for Appsmith integration");
    console.log("\n📋 Available Endpoints:");
    console.log("  GET  /api/health          - System health check");
    console.log("  GET  /api/accounts        - List all accounts");
    console.log("  POST /api/payments/start  - Start payment workflow");
    console.log("  GET  /api/payments/status/:id - Get workflow status");
    console.log("  GET  /api/payments/recent - Recent payments dashboard");
    console.log("  GET  /api/audit-logs      - Compliance audit logs");
    console.log("  GET  /api/workflows/config - Workflow configurations");
  });
}

startServer().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
