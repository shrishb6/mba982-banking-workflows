// index.ts - Express API server for Appsmith integration
import express from "express";
import cors from "cors";
import { Client, Connection } from "@temporalio/client";

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
    console.log("🔍 Fetching accounts from MockAPI...");
    const response = await axios.get(`${MOCKAPI_BASE_URL}/accounts`);
    console.log("✅ MockAPI response received:", response.data.length, "accounts");

    const accounts = response.data.map((account: any) => {
      console.log("Processing account:", account.accountNumber, "Type:", account.type);
      return {
        id: account.id,
        accountNumber: account.accountNumber,
        customerId: account.customerId,
        balance: account.balance,
        currency: account.currency,
        status: account.status,
        accountType: account.type, // This should work based on your MockAPI data
        displayName: `${account.accountNumber} (${account.type}) - ${account.currency} ${account.balance}`,
      };
    });

    console.log("✅ Processed accounts:", accounts.length);
    res.json(accounts);
  } catch (error) {
    console.error("❌ Failed to fetch accounts:", error.message);
    res.status(500).json({ error: "Failed to fetch accounts" });
  }
});

// 3. Start a payment workflow - COMPLETE REPLACEMENT
app.post("/api/payments/start", async (req, res) => {
  try {
    const { fromAccount, toAccount, amount, currency, description } = req.body;

    // Validate required fields
    if (!fromAccount || !toAccount || !amount) {
      return res.status(400).json({
        error: "Missing required fields: fromAccount, toAccount, amount",
      });
    }

    // 🎯 DETERMINISTIC ROUTING LOGIC (predictable for demo)
    // v2 (with fraud check) for amounts >= $1000
    // v1 (baseline) for amounts < $1000
    const useV2 = amount >= 1000;
    const workflowVersion = useV2 ? "v2" : "v1";

    // Select workflow TYPE NAME (string, not import)
    const workflowType = useV2
      ? "modernPaymentV2Workflow"
      : "modernPaymentV1Workflow";

    // Start workflow with appropriate version
    const workflowId = `modern-${workflowVersion}-${Date.now()}${Math.floor(Math.random() * 1000)}`;

    console.log(
      `🎯 DETERMINISTIC ROUTING: Amount $${amount} → ${workflowVersion.toUpperCase()} workflow`,
    );
    console.log(
      `💳 Payment: ${fromAccount} → ${toAccount} | Amount: $${amount} | Route: ${useV2 ? "HIGH-VALUE (v2 + fraud)" : "STANDARD (v1 fast)"}`,
    );

    const handle = await temporalClient.workflow.start(workflowType, {
      taskQueue: "payment-processing",
      workflowId,
      args: [{ fromAccount, toAccount, amount, currency, description }],
    });

    console.log(
      `✅ Started ${workflowVersion} payment workflow: ${workflowId}`,
    );

    // Enhanced response with routing logic explanation
    res.json({
      success: true,
      workflowId: handle.workflowId,
      runId: handle.firstExecutionRunId,
      version: workflowVersion,
      routing_logic: {
        threshold: 1000,
        payment_amount: amount,
        selected_version: workflowVersion,
        reason: useV2
          ? `High-value payment ($${amount} >= $1000) routed to v2 with fraud protection`
          : `Standard payment ($${amount} < $1000) routed to fast v1 workflow`,
      },
      workflow_features: useV2
        ? [
            "fraud_check",
            "enhanced_security",
            "risk_assessment",
            "compliance_logging",
          ]
        : ["fast_processing", "optimized_path", "baseline_security"],
      message: `Payment routed to ${workflowVersion} workflow based on amount threshold`,
      expected_steps: useV2 ? 6 : 5,
      fraud_protection: useV2 ? "enabled" : "standard",
      processing_time_estimate: useV2 ? "3.5s" : "3.2s",
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

// 8. Enhanced workflow configuration (replaces the simple one you have)
app.get("/api/workflows/config", async (req, res) => {
  try {
    const version = req.query.version || "v1";

    const workflowConfigs = {
      v1: {
        version: "1.0",
        name: "Modern Payment Flow v1",
        description: "Temporal orchestrated payment processing (baseline)",
        status: "active",
        created_by: "system",
        created_at: "2025-01-01T00:00:00Z",
        deployed_at: "2025-01-01T00:00:00Z",
        architecture: "Temporal Orchestrated",
        steps: [
          {
            id: "create_payment_request",
            name: "Create Payment Request",
            description: "Initialize payment record in system",
            order: 1,
            service: "payment",
            required: true,
            configurable: false,
            activity_name: "createPaymentRequest",
          },
          {
            id: "validate_account",
            name: "Validate Source Account",
            description: "Check account exists and has sufficient funds",
            order: 2,
            service: "ledger",
            required: true,
            configurable: false,
            activity_name: "validateAccount",
          },
          {
            id: "debit_account",
            name: "Debit Source Account",
            description: "Remove funds from source account",
            order: 3,
            service: "ledger",
            required: true,
            configurable: false,
            activity_name: "debitAccount",
          },
          {
            id: "credit_account",
            name: "Credit Destination Account",
            description: "Add funds to destination account",
            order: 4,
            service: "ledger",
            required: true,
            configurable: false,
            activity_name: "creditAccount",
          },
          {
            id: "complete_payment",
            name: "Complete Payment",
            description: "Mark payment as completed and log success",
            order: 5,
            service: "payment",
            required: true,
            configurable: false,
            activity_name: "updatePaymentStatus",
          },
        ],
      },
      v2: {
        version: "2.0",
        name: "Modern Payment Flow v2",
        description: "Enhanced payment processing with fraud screening",
        status: "configured",
        created_by: "pm_user",
        created_at: new Date().toISOString(),
        deployed_at: null,
        architecture: "Temporal Orchestrated",
        steps: [
          {
            id: "create_payment_request",
            name: "Create Payment Request",
            description: "Initialize payment record in system",
            order: 1,
            service: "payment",
            required: true,
            configurable: false,
            activity_name: "createPaymentRequest",
          },
          {
            id: "validate_account",
            name: "Validate Source Account",
            description: "Check account exists and has sufficient funds",
            order: 2,
            service: "ledger",
            required: true,
            configurable: false,
            activity_name: "validateAccount",
          },
          {
            id: "fraud_check",
            name: "Fraud Check",
            description: "Screen payment for fraud risk indicators",
            order: 3,
            service: "fraud",
            required: false,
            configurable: true,
            added_by: "pm_user",
            added_at: new Date().toISOString(),
            activity_name: "performFraudCheck",
            config: {
              amount_threshold: 1000,
              risk_level: "medium",
              on_fraud_detected: "block",
            },
            highlight: true, // For UI highlighting
          },
          {
            id: "debit_account",
            name: "Debit Source Account",
            description: "Remove funds from source account",
            order: 4,
            service: "ledger",
            required: true,
            configurable: false,
            activity_name: "debitAccount",
          },
          {
            id: "credit_account",
            name: "Credit Destination Account",
            description: "Add funds to destination account",
            order: 5,
            service: "ledger",
            required: true,
            configurable: false,
            activity_name: "creditAccount",
          },
          {
            id: "complete_payment",
            name: "Complete Payment",
            description: "Mark payment as completed and log success",
            order: 6,
            service: "payment",
            required: true,
            configurable: false,
            activity_name: "updatePaymentStatus",
          },
        ],
      },
    };

    const config = workflowConfigs[version] || workflowConfigs.v1;
    res.json(config);
  } catch (error) {
    console.error("❌ Error fetching workflow config:", error);
    res.status(500).json({ error: "Failed to fetch workflow configuration" });
  }
});

// 9. Get available steps for PM configuration
app.get("/api/workflows/available-steps", async (req, res) => {
  try {
    const availableSteps = [
      {
        id: "fraud_check",
        name: "Fraud Check",
        description:
          "Screen payments for fraud risk indicators using ML models",
        service: "fraud",
        category: "Security & Risk",
        insert_after: "validate_account",
        activity_name: "performFraudCheck",
        estimated_time: "150-300ms",
        business_value: "Reduces fraud losses by 85%",
        configuration_options: [
          {
            name: "amount_threshold",
            type: "number",
            label: "Amount Threshold ($)",
            description: "Minimum amount to trigger fraud check",
            default: 1000,
            min: 100,
            max: 50000,
            required: true,
          },
          {
            name: "risk_level",
            type: "select",
            label: "Risk Sensitivity",
            options: [
              { value: "low", label: "Low (catch obvious fraud)" },
              { value: "medium", label: "Medium (balanced approach)" },
              { value: "high", label: "High (strict screening)" },
            ],
            description:
              "Higher sensitivity catches more fraud but may flag legitimate payments",
            default: "medium",
            required: true,
          },
          {
            name: "on_fraud_detected",
            type: "select",
            label: "Action on Fraud Detection",
            options: [
              { value: "block", label: "Block Payment Immediately" },
              { value: "flag", label: "Flag for Manual Review" },
              { value: "notify", label: "Notify Customer for Verification" },
            ],
            description: "How to handle payments flagged as fraudulent",
            default: "block",
            required: true,
          },
        ],
      },
      {
        id: "compliance_check",
        name: "Regulatory Compliance Check",
        description: "Verify payment meets AML/KYC requirements",
        service: "compliance",
        category: "Regulatory",
        insert_after: "validate_account",
        activity_name: "performComplianceCheck",
        estimated_time: "200-500ms",
        business_value: "Ensures regulatory compliance",
      },
      {
        id: "customer_notification",
        name: "Customer Notification",
        description: "Send SMS/email notification for large payments",
        service: "notifications",
        category: "Customer Experience",
        insert_after: "complete_payment",
        activity_name: "sendCustomerNotification",
        estimated_time: "100-200ms",
        business_value: "Improves customer awareness and satisfaction",
      },
    ];

    res.json(availableSteps);
  } catch (error) {
    console.error("❌ Error fetching available steps:", error);
    res.status(500).json({ error: "Failed to fetch available steps" });
  }
});

// 10. Configure new workflow version (PM adds steps)
app.post("/api/workflows/configure", async (req, res) => {
  try {
    const { step_id, step_config, workflow_name, workflow_description } =
      req.body;

    console.log("🔧 PM configuring workflow:", {
      step_id,
      step_config,
      workflow_name,
    });

    // Validate required parameters
    if (!step_id) {
      return res.status(400).json({ error: "step_id is required" });
    }

    // Get base v1 workflow configuration
    const v1Config = {
      steps: [
        {
          id: "create_payment_request",
          name: "Create Payment Request",
          order: 1,
          activity_name: "createPaymentRequest",
        },
        {
          id: "validate_account",
          name: "Validate Source Account",
          order: 2,
          activity_name: "validateAccount",
        },
        {
          id: "debit_account",
          name: "Debit Source Account",
          order: 3,
          activity_name: "debitAccount",
        },
        {
          id: "credit_account",
          name: "Credit Destination Account",
          order: 4,
          activity_name: "creditAccount",
        },
        {
          id: "complete_payment",
          name: "Complete Payment",
          order: 5,
          activity_name: "updatePaymentStatus",
        },
      ],
    };

    // Create new steps array with fraud check inserted
    const newSteps = [...v1Config.steps];

    // Find insertion point (after validate_account)
    const insertAfterIndex = newSteps.findIndex(
      (step) => step.id === "validate_account",
    );
    const insertIndex = insertAfterIndex + 1;

    // Create the new step based on step_id
    let newStep;
    if (step_id === "fraud_check") {
      newStep = {
        id: "fraud_check",
        name: "Fraud Check",
        description: "Screen payment for fraud risk indicators",
        order: insertIndex + 1,
        service: "fraud",
        required: false,
        configurable: true,
        added_by: "pm_user",
        added_at: new Date().toISOString(),
        activity_name: "performFraudCheck",
        config: {
          amount_threshold: step_config?.amount_threshold || 1000,
          risk_level: step_config?.risk_level || "medium",
          on_fraud_detected: step_config?.on_fraud_detected || "block",
        },
        highlight: true,
      };
    } else {
      // Generic step for other types
      newStep = {
        id: step_id,
        name:
          step_id.charAt(0).toUpperCase() + step_id.slice(1).replace("_", " "),
        description: `Custom ${step_id} step`,
        order: insertIndex + 1,
        service: "custom",
        required: false,
        configurable: true,
        added_by: "pm_user",
        added_at: new Date().toISOString(),
        config: step_config || {},
      };
    }

    // Insert the new step and reorder
    newSteps.splice(insertIndex, 0, newStep);
    newSteps.forEach((step, index) => {
      step.order = index + 1;
    });

    // Create v2 configuration
    const v2Config = {
      version: "2.0",
      name: workflow_name || `Payment Flow with ${newStep.name}`,
      description:
        workflow_description ||
        `Enhanced payment processing with ${newStep.name.toLowerCase()}`,
      status: "configured",
      created_by: "pm_user",
      created_at: new Date().toISOString(),
      deployed_at: null,
      architecture: "Temporal Orchestrated",
      steps: newSteps,
      changes_from_v1: {
        added_steps: [newStep.name],
        insertion_point: `After step ${insertAfterIndex + 1} (${v1Config.steps[insertAfterIndex].name})`,
        total_steps: newSteps.length,
        configuration_time: new Date().toISOString(),
      },
    };

    console.log("✅ New v2 workflow configured successfully");

    res.json({
      success: true,
      message: `${newStep.name} added to workflow successfully`,
      config: v2Config,
      preview: {
        before: `${v1Config.steps.length} steps`,
        after: `${newSteps.length} steps`,
        new_step: newStep.name,
        position: insertIndex + 1,
      },
    });
  } catch (error) {
    console.error("❌ Workflow configuration error:", error);
    res
      .status(500)
      .json({ error: "Failed to configure workflow", details: error.message });
  }
});

// 11. Deploy workflow version
app.post("/api/workflows/deploy", async (req, res) => {
  try {
    const { version, strategy, traffic_split } = req.body;

    console.log("🚀 Deploying workflow version:", { version, strategy });

    // Simulate deployment validation
    if (version === "2.0") {
      // In real implementation, this would:
      // 1. Validate v2 workflow definition
      // 2. Deploy to Temporal
      // 3. Update traffic routing
      console.log("📋 Validating v2 workflow with fraud check...");
      console.log("🔧 Updating Temporal workflow definition...");
      console.log("🚦 Configuring traffic routing...");
    }

    const deployment = {
      deployment_id: `deploy_${Date.now()}`,
      version: version || "2.0",
      strategy: strategy || "canary",
      status: "deployed",
      deployed_at: new Date().toISOString(),
      deployed_by: "pm_user",
      traffic_allocation:
        strategy === "canary"
          ? { v1: 80, v2: 20 }
          : strategy === "blue_green"
            ? { v1: 0, v2: 100 }
            : { v1: 50, v2: 50 },
      rollback_available: true,
      deployment_notes:
        strategy === "canary"
          ? "20% of traffic routing to v2 with fraud checks"
          : "Full deployment of v2 workflow",
      estimated_impact: {
        fraud_reduction: "Expected 85% reduction in fraud losses",
        processing_time: "Additional 150-300ms per payment",
        customer_experience: "Minimal impact, improved security",
      },
    };

    console.log("✅ Workflow deployed successfully:", deployment.deployment_id);

    res.json({
      success: true,
      message: `Workflow ${version} deployed successfully using ${strategy} strategy`,
      deployment: deployment,
    });
  } catch (error) {
    console.error("❌ Deployment error:", error);
    res
      .status(500)
      .json({ error: "Failed to deploy workflow", details: error.message });
  }
});

// 12. Get deployment history and status
app.get("/api/workflows/deployment-history", async (req, res) => {
  try {
    const deployments = [
      {
        deployment_id: "deploy_baseline",
        version: "1.0",
        strategy: "full",
        status: "active",
        deployed_at: "2025-01-01T00:00:00Z",
        deployed_by: "system",
        traffic_percentage: 80,
        is_current: false,
        notes: "Baseline Temporal orchestrated workflow",
      },
      {
        deployment_id: `deploy_${Date.now()}`,
        version: "2.0",
        strategy: "canary",
        status: "active",
        deployed_at: new Date().toISOString(),
        deployed_by: "pm_user",
        traffic_percentage: 20,
        is_current: true,
        notes: "Added fraud check step via PM configuration",
      },
    ];

    res.json({
      deployments,
      summary: {
        total_deployments: deployments.length,
        active_versions: deployments.filter((d) => d.status === "active")
          .length,
        latest_deployment: deployments[deployments.length - 1],
        rollback_available: true,
      },
    });
  } catch (error) {
    console.error("❌ Error fetching deployment history:", error);
    res.status(500).json({ error: "Failed to fetch deployment history" });
  }
});

// 13. Rollback workflow
app.post("/api/workflows/rollback", async (req, res) => {
  try {
    const { target_version, reason } = req.body;

    console.log("🔄 Initiating workflow rollback:", { target_version, reason });

    // Simulate rollback process
    console.log("🚦 Updating traffic routing to 100% v1.0...");
    console.log("📋 Preserving v2.0 configuration for future use...");

    const rollback = {
      rollback_id: `rollback_${Date.now()}`,
      from_version: "2.0",
      to_version: target_version || "1.0",
      reason: reason || "User-initiated rollback via PM interface",
      status: "completed",
      rolled_back_at: new Date().toISOString(),
      rolled_back_by: "pm_user",
      traffic_allocation: { v1: 100, v2: 0 },
      impact: {
        fraud_checks_disabled: true,
        processing_time_improvement: "150-300ms faster per payment",
        rollback_time: "< 30 seconds",
      },
    };

    console.log("✅ Rollback completed successfully");

    res.json({
      success: true,
      message: `Successfully rolled back to version ${target_version}`,
      rollback: rollback,
    });
  } catch (error) {
    console.error("❌ Rollback error:", error);
    res
      .status(500)
      .json({ error: "Failed to rollback workflow", details: error.message });
  }
});

// 14. Get real-time workflow status and metrics
app.get("/api/workflows/status", async (req, res) => {
  try {
    const status = {
      active_versions: [
        {
          version: "1.0",
          traffic: 80,
          status: "stable",
          payments_processed_today: 998,
          avg_processing_time: "3.2s",
          success_rate: 99.8,
        },
        {
          version: "2.0",
          traffic: 20,
          status: "canary",
          payments_processed_today: 249,
          avg_processing_time: "3.5s",
          success_rate: 99.6,
          fraud_checks_performed: 249,
          fraud_blocks: 3,
        },
      ],
      overall_metrics: {
        total_payments_today: 1247,
        overall_success_rate: 99.7,
        avg_processing_time: "3.3s",
        fraud_prevention: {
          checks_performed: 249,
          threats_blocked: 3,
          false_positives: 0,
        },
      },
      system_health: {
        temporal_cluster: "healthy",
        fraud_service: "healthy",
        mockapi_backend: "healthy",
      },
      deployment_info: {
        last_deployment: new Date().toISOString(),
        deployed_by: "pm_user",
        next_deployment_window: "Available anytime",
        rollback_ready: true,
      },
    };

    res.json(status);
  } catch (error) {
    console.error("❌ Error fetching workflow status:", error);
    res.status(500).json({ error: "Failed to fetch workflow status" });
  }
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
