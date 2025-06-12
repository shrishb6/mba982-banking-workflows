// src/workflows/modern-payment-v2.ts
// Modern v2: Payment workflow WITH fraud check
import { proxyActivities } from "@temporalio/workflow";
import type * as activities from "../activities/banking-activities";

const {
  validateAccount,
  performFraudCheck, // ← Add fraud check activity
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
  };
}

// Modern v2 Workflow: WITH fraud check step
export async function modernPaymentV2Workflow(
  input: PaymentInput,
): Promise<PaymentResult> {
  const startTime = Date.now();
  const workflowId = `modern-v2-${Date.now()}`;
  const stepsExecuted: string[] = [];

  try {
    // Step 1: Create payment request
    stepsExecuted.push("CREATE_PAYMENT_REQUEST");
    await logAuditEvent(
      workflowId,
      "v2",
      "CREATE_PAYMENT_REQUEST",
      "PENDING",
      0,
      `Starting v2 payment with fraud check: ${input.fromAccount} → ${input.toAccount} | Amount: ${input.amount}`,
    );

    const { paymentId } = await createPaymentRequest(
      input.fromAccount,
      input.toAccount,
      input.amount,
      input.currency,
      workflowId,
      `${input.description} (v2 - With Fraud Check)`,
    );

    await logAuditEvent(
      workflowId,
      "v2",
      "CREATE_PAYMENT_REQUEST",
      "SUCCESS",
      Date.now() - startTime,
      `Payment request created: ${paymentId} | v2 workflow with fraud protection`,
    );

    // Step 2: Validate source account
    stepsExecuted.push("VALIDATE_ACCOUNT");
    await logAuditEvent(
      workflowId,
      "v2",
      "VALIDATE_ACCOUNT",
      "PENDING",
      0,
      `Validating account ${input.fromAccount}`,
    );

    const validation = await validateAccount(input.fromAccount, input.amount);
    if (!validation.isValid) {
      await logAuditEvent(
        workflowId,
        "v2",
        "VALIDATE_ACCOUNT",
        "FAILED",
        0,
        `Validation failed: ${validation.reason}`,
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
          architecture: "Temporal Orchestrated + Fraud Check",
        },
      };
    }

    await logAuditEvent(
      workflowId,
      "v2",
      "VALIDATE_ACCOUNT",
      "SUCCESS",
      0,
      `Account validated | Balance: ${validation.account!.balance}`,
    );

    // Step 3: 🚨 FRAUD CHECK (NEW STEP - This is what makes it v2!)
    stepsExecuted.push("FRAUD_CHECK");
    await logAuditEvent(
      workflowId,
      "v2",
      "FRAUD_CHECK",
      "PENDING",
      0,
      `⚡ FRAUD CHECK: Screening payment for amount ${input.amount}`,
    );

    const fraudResult = await performFraudCheck(
      input.fromAccount,
      input.amount,
    );
    if (fraudResult.isBlocked) {
      await logAuditEvent(
        workflowId,
        "v2",
        "FRAUD_CHECK",
        "BLOCKED",
        0,
        `🚨 FRAUD DETECTED: ${fraudResult.reason} | Risk Score: ${fraudResult.riskScore}`,
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
          architecture: "Temporal Orchestrated + Fraud Check",
        },
      };
    }

    await logAuditEvent(
      workflowId,
      "v2",
      "FRAUD_CHECK",
      "SUCCESS",
      0,
      `✅ Fraud check passed | Risk Score: ${fraudResult.riskScore} | ${fraudResult.reason}`,
    );

    // Step 4: Debit source account (after fraud clearance)
    stepsExecuted.push("DEBIT_ACCOUNT");
    await logAuditEvent(
      workflowId,
      "v2",
      "DEBIT_ACCOUNT",
      "PENDING",
      0,
      `Debiting ${input.amount} (post-fraud-check)`,
    );

    const debitResult = await debitAccount(input.fromAccount, input.amount);
    if (!debitResult.success) {
      await logAuditEvent(
        workflowId,
        "v2",
        "DEBIT_ACCOUNT",
        "FAILED",
        0,
        `Debit failed: ${debitResult.error}`,
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
          architecture: "Temporal Orchestrated + Fraud Check",
        },
      };
    }

    await logAuditEvent(
      workflowId,
      "v2",
      "DEBIT_ACCOUNT",
      "SUCCESS",
      0,
      `Account debited | New balance: ${debitResult.newBalance} | Fraud-cleared payment`,
    );

    // Step 5: Credit destination account
    stepsExecuted.push("CREDIT_ACCOUNT");
    await logAuditEvent(
      workflowId,
      "v2",
      "CREDIT_ACCOUNT",
      "PENDING",
      0,
      `Crediting ${input.amount} (secure transfer)`,
    );

    const creditResult = await creditAccount(input.toAccount, input.amount);
    if (!creditResult.success) {
      await logAuditEvent(
        workflowId,
        "v2",
        "CREDIT_ACCOUNT",
        "FAILED",
        0,
        `Credit failed: ${creditResult.error}`,
      );
      await updatePaymentStatus(paymentId, "FAILED", "Credit failed");
      return {
        success: false,
        paymentId,
        error: "Account credit failed",
        executionSummary: {
          totalTime: Date.now() - startTime,
          stepsExecuted,
          version: "Modern v2",
          architecture: "Temporal Orchestrated + Fraud Check",
        },
      };
    }

    await logAuditEvent(
      workflowId,
      "v2",
      "CREDIT_ACCOUNT",
      "SUCCESS",
      0,
      `Account credited | New balance: ${creditResult.newBalance} | Fraud-secured transfer`,
    );

    // Step 6: Complete payment
    await updatePaymentStatus(
      paymentId,
      "COMPLETED",
      "v2 payment completed with fraud protection",
    );

    const totalTime = Date.now() - startTime;
    await logAuditEvent(
      workflowId,
      "v2",
      "PAYMENT_COMPLETED",
      "SUCCESS",
      totalTime,
      `🎉 v2 Payment completed with fraud protection | Duration: ${totalTime}ms`,
    );

    return {
      success: true,
      paymentId,
      executionSummary: {
        totalTime,
        stepsExecuted,
        version: "Modern v2",
        architecture: "Temporal Orchestrated + Fraud Check",
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
      `v2 Payment workflow failed: ${errorMessage}`,
    );
    return {
      success: false,
      error: errorMessage,
      executionSummary: {
        totalTime,
        stepsExecuted,
        version: "Modern v2",
        architecture: "Temporal Orchestrated + Fraud Check",
      },
    };
  }
}
