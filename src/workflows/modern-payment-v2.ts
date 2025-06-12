// src/workflows/modern-payment-v2.ts
// Modern v2: Temporal orchestrated workflow WITH fraud check (PM-configured)
import { proxyActivities } from "@temporalio/workflow";
import type * as activities from "../activities/banking-activities";

// Create proxy for activities with timeout and retry policies
const {
  validateAccount,
  performFraudCheck, // ✅ NEW: Fraud check activity
  debitAccount,
  creditAccount,
  createPaymentRequest,
  updatePaymentStatus,
  logAuditEvent,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "2 minutes",
  retry: {
    initialInterval: "1s",
    maximumInterval: "30s",
    backoffCoefficient: 2,
    maximumAttempts: 3,
  },
});

export interface PaymentInput {
  fromAccount: string;
  toAccount: string;
  amount: number;
  currency: string;
  description: string;
}

export interface PaymentResult {
  success: boolean;
  paymentId?: string;
  error?: string;
  executionSummary: {
    totalTime: number;
    stepsExecuted: string[];
    version: string;
    architecture: string;
    fraudCheckResult?: {
      performed: boolean;
      riskScore: number;
      action: string;
    };
  };
}

// Modern v2 Workflow: With fraud check step added by Product Manager
export async function modernPaymentV2Workflow(
  input: PaymentInput,
): Promise<PaymentResult> {
  const startTime = Date.now();
  const workflowId = `modern-v2-${Date.now()}`;
  const stepsExecuted: string[] = [];
  let fraudCheckResult = { performed: false, riskScore: 0, action: "none" };

  try {
    // Step 1: Create payment request
    stepsExecuted.push("CREATE_PAYMENT_REQUEST");
    await logAuditEvent(
      workflowId,
      "v2",
      "CREATE_PAYMENT_REQUEST",
      "PENDING",
      0,
      `Starting modern payment v2 with fraud check - From: ${input.fromAccount}, To: ${input.toAccount}, Amount: ${input.amount} ${input.currency}`,
    );

    const { paymentId } = await createPaymentRequest(
      input.fromAccount,
      input.toAccount,
      input.amount,
      input.currency,
      workflowId,
      `${input.description} (Modern v2 - PM Configured with Fraud Check)`,
    );

    await logAuditEvent(
      workflowId,
      "v2",
      "CREATE_PAYMENT_REQUEST",
      "SUCCESS",
      Date.now() - startTime,
      `Payment request created: ${paymentId} | v2 workflow with PM-configured fraud check`,
    );

    // Step 2: Validate source account
    stepsExecuted.push("VALIDATE_ACCOUNT");
    await logAuditEvent(
      workflowId,
      "v2",
      "VALIDATE_ACCOUNT",
      "PENDING",
      0,
      `Validating account ${input.fromAccount} balance and status`,
    );

    const stepStart = Date.now();
    const validation = await validateAccount(input.fromAccount, input.amount);
    const stepTime = Date.now() - stepStart;

    if (!validation.isValid) {
      await logAuditEvent(
        workflowId,
        "v2",
        "VALIDATE_ACCOUNT",
        "FAILED",
        stepTime,
        `Validation failed: ${validation.reason} | v2 workflow terminated`,
      );
      await updatePaymentStatus(paymentId, "FAILED", validation.reason);

      return {
        success: false,
        paymentId,
        error: validation.reason,
        executionSummary: {
          totalTime: Date.now() - startTime,
          stepsExecuted,
          version: "Modern v2",
          architecture: "Temporal Orchestrated + PM Configured",
        },
      };
    }

    await logAuditEvent(
      workflowId,
      "v2",
      "VALIDATE_ACCOUNT",
      "SUCCESS",
      stepTime,
      `Account validated | Balance: ${validation.account!.balance} | Proceeding to fraud check`,
    );

    // Step 3: 🚨 FRAUD CHECK (NEW STEP - Added by Product Manager via UI)
    stepsExecuted.push("FRAUD_CHECK");
    await logAuditEvent(
      workflowId,
      "v2",
      "FRAUD_CHECK",
      "PENDING",
      0,
      `⚡ PM-CONFIGURED STEP: Performing fraud check | Amount: ${input.amount} | Threshold: $1000`,
    );

    const fraudStart = Date.now();
    const fraudResult = await performFraudCheck(
      input.fromAccount,
      input.amount,
    );
    const fraudTime = Date.now() - fraudStart;

    fraudCheckResult = {
      performed: true,
      riskScore: fraudResult.riskScore,
      action: fraudResult.isBlocked ? "blocked" : "approved",
    };

    if (fraudResult.isBlocked) {
      await logAuditEvent(
        workflowId,
        "v2",
        "FRAUD_CHECK",
        "BLOCKED",
        fraudTime,
        `🚨 FRAUD DETECTED: ${fraudResult.reason} | Risk Score: ${fraudResult.riskScore} | Payment blocked by PM-configured rule`,
      );
      await updatePaymentStatus(
        paymentId,
        "BLOCKED_FRAUD",
        `Fraud detected: ${fraudResult.reason}`,
      );

      return {
        success: false,
        paymentId,
        error: `Fraud check failed: ${fraudResult.reason}`,
        executionSummary: {
          totalTime: Date.now() - startTime,
          stepsExecuted,
          version: "Modern v2",
          architecture: "Temporal Orchestrated + PM Configured",
          fraudCheckResult,
        },
      };
    }

    await logAuditEvent(
      workflowId,
      "v2",
      "FRAUD_CHECK",
      "SUCCESS",
      fraudTime,
      `✅ Fraud check passed | Risk Score: ${fraudResult.riskScore} | ${fraudResult.reason} | PM-configured security validated`,
    );

    // Step 4: Debit source account (after fraud clearance)
    stepsExecuted.push("DEBIT_ACCOUNT");
    await logAuditEvent(
      workflowId,
      "v2",
      "DEBIT_ACCOUNT",
      "PENDING",
      0,
      `Debiting ${input.amount} from ${input.fromAccount} | Post-fraud-check processing`,
    );

    const debitStart = Date.now();
    const debitResult = await debitAccount(input.fromAccount, input.amount);
    const debitTime = Date.now() - debitStart;

    if (!debitResult.success) {
      await logAuditEvent(
        workflowId,
        "v2",
        "DEBIT_ACCOUNT",
        "FAILED",
        debitTime,
        `Debit failed: ${debitResult.error} | v2 workflow error after fraud clearance`,
      );
      await updatePaymentStatus(paymentId, "FAILED", "Debit failed");

      return {
        success: false,
        paymentId,
        error: "Account debit failed",
        executionSummary: {
          totalTime: Date.now() - startTime,
          stepsExecuted,
          version: "Modern v2",
          architecture: "Temporal Orchestrated + PM Configured",
          fraudCheckResult,
        },
      };
    }

    await logAuditEvent(
      workflowId,
      "v2",
      "DEBIT_ACCOUNT",
      "SUCCESS",
      debitTime,
      `Account debited | New balance: ${debitResult.newBalance} | Transaction: ${debitResult.transactionId} | Fraud-cleared payment`,
    );

    // Step 5: Credit destination account
    stepsExecuted.push("CREDIT_ACCOUNT");
    await logAuditEvent(
      workflowId,
      "v2",
      "CREDIT_ACCOUNT",
      "PENDING",
      0,
      `Crediting ${input.amount} to ${input.toAccount} | Secure payment completion`,
    );

    const creditStart = Date.now();
    const creditResult = await creditAccount(input.toAccount, input.amount);
    const creditTime = Date.now() - creditStart;

    if (!creditResult.success) {
      await logAuditEvent(
        workflowId,
        "v2",
        "CREDIT_ACCOUNT",
        "FAILED",
        creditTime,
        `Credit failed: ${creditResult.error} | v2 workflow compensation needed`,
      );

      await updatePaymentStatus(
        paymentId,
        "FAILED",
        "Credit failed - compensation required",
      );

      return {
        success: false,
        paymentId,
        error: "Account credit failed",
        executionSummary: {
          totalTime: Date.now() - startTime,
          stepsExecuted,
          version: "Modern v2",
          architecture: "Temporal Orchestrated + PM Configured",
          fraudCheckResult,
        },
      };
    }

    await logAuditEvent(
      workflowId,
      "v2",
      "CREDIT_ACCOUNT",
      "SUCCESS",
      creditTime,
      `Account credited | New balance: ${creditResult.newBalance} | Transaction: ${creditResult.transactionId} | Fraud-secured transfer`,
    );

    // Step 6: Complete payment
    await updatePaymentStatus(
      paymentId,
      "COMPLETED",
      "Payment processed successfully via v2 workflow with fraud protection",
    );

    const totalTime = Date.now() - startTime;
    await logAuditEvent(
      workflowId,
      "v2",
      "PAYMENT_COMPLETED",
      "SUCCESS",
      totalTime,
      `🎉 v2 Payment completed with fraud protection | Risk Score: ${fraudResult.riskScore} | PM Configuration Success | Duration: ${totalTime}ms`,
    );

    return {
      success: true,
      paymentId,
      executionSummary: {
        totalTime,
        stepsExecuted,
        version: "Modern v2",
        architecture: "Temporal Orchestrated + PM Configured",
        fraudCheckResult,
      },
    };
  } catch (error) {
    const totalTime = Date.now() - startTime;
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    await logAuditEvent(
      workflowId,
      "v2",
      "PAYMENT_FAILED",
      "FAILED",
      totalTime,
      `v2 Payment workflow failed: ${errorMessage} | Fraud check status: ${fraudCheckResult.performed ? "completed" : "not reached"}`,
    );

    return {
      success: false,
      error: errorMessage,
      executionSummary: {
        totalTime,
        stepsExecuted,
        version: "Modern v2",
        architecture: "Temporal Orchestrated + PM Configured",
        fraudCheckResult,
      },
    };
  }
}
