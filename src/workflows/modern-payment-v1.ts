// src/workflows/modern-payment-v1.ts
// Modern v1: Simplified Temporal orchestrated workflow (no settlement complexity)
import { proxyActivities } from '@temporalio/workflow';
import type * as activities from '../activities/banking-activities';

const {
  validateAccount,
  debitAccount,
  creditAccount,
  createPaymentRequest,
  updatePaymentStatus,
  logAuditEvent
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '1 minute', // Shorter timeout since no external networks
  retry: {
    initialInterval: '1s',
    maximumInterval: '10s',
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

// Modern v1 Workflow: Clean, focused payment processing (no fraud check)
export async function modernPaymentV1Workflow(input: PaymentInput): Promise<PaymentResult> {
  const startTime = Date.now();
  const workflowId = `modern-v1-${Date.now()}`;
  const stepsExecuted: string[] = [];

  try {
    // Step 1: Create payment request
    stepsExecuted.push('CREATE_PAYMENT_REQUEST');
    await logAuditEvent(
      workflowId, 
      'v1', 
      'CREATE_PAYMENT_REQUEST', 
      'PENDING', 
      0, 
      `Starting payment: ${input.fromAccount} → ${input.toAccount} | Amount: ${input.amount} ${input.currency}`
    );

    const { paymentId } = await createPaymentRequest(
      input.fromAccount,
      input.toAccount,
      input.amount,
      input.currency,
      workflowId,
      `${input.description} (Orchestrated v1)`
    );

    await logAuditEvent(workflowId, 'v1', 'CREATE_PAYMENT_REQUEST', 'SUCCESS', Date.now() - startTime, 
      `Payment request created: ${paymentId} | Temporal ensures durable execution`);

    // Step 2: Validate source account
    stepsExecuted.push('VALIDATE_ACCOUNT');
    await logAuditEvent(workflowId, 'v1', 'VALIDATE_ACCOUNT', 'PENDING', 0, 
      `Validating account ${input.fromAccount} balance and status`);

    const stepStart = Date.now();
    const validation = await validateAccount(input.fromAccount, input.amount);
    const stepTime = Date.now() - stepStart;

    if (!validation.isValid) {
      await logAuditEvent(workflowId, 'v1', 'VALIDATE_ACCOUNT', 'FAILED', stepTime, 
        `Validation failed: ${validation.reason} | Temporal automatically handles failure`);
      await updatePaymentStatus(paymentId, 'FAILED', validation.reason);

      return {
        success: false,
        paymentId,
        error: validation.reason,
        executionSummary: {
          totalTime: Date.now() - startTime,
          stepsExecuted,
          version: 'Modern v1',
          architecture: 'Temporal Orchestrated'
        }
      };
    }

    await logAuditEvent(workflowId, 'v1', 'VALIDATE_ACCOUNT', 'SUCCESS', stepTime, 
      `Account validated | Balance: ${validation.account!.balance} | Temporal provides step-level observability`);

    // Step 3: Debit source account
    stepsExecuted.push('DEBIT_ACCOUNT');
    await logAuditEvent(workflowId, 'v1', 'DEBIT_ACCOUNT', 'PENDING', 0, 
      `Debiting ${input.amount} from ${input.fromAccount}`);

    const debitStart = Date.now();
    const debitResult = await debitAccount(input.fromAccount, input.amount);
    const debitTime = Date.now() - debitStart;

    if (!debitResult.success) {
      await logAuditEvent(workflowId, 'v1', 'DEBIT_ACCOUNT', 'FAILED', debitTime, 
        `Debit failed: ${debitResult.error} | Temporal can implement compensation logic`);
      await updatePaymentStatus(paymentId, 'FAILED', 'Debit failed');

      return {
        success: false,
        paymentId,
        error: 'Account debit failed',
        executionSummary: {
          totalTime: Date.now() - startTime,
          stepsExecuted,
          version: 'Modern v1',
          architecture: 'Temporal Orchestrated'
        }
      };
    }

    await logAuditEvent(workflowId, 'v1', 'DEBIT_ACCOUNT', 'SUCCESS', debitTime, 
      `Account debited | New balance: ${debitResult.newBalance} | Transaction: ${debitResult.transactionId}`);

    // Step 4: Credit destination account
    stepsExecuted.push('CREDIT_ACCOUNT');
    await logAuditEvent(workflowId, 'v1', 'CREDIT_ACCOUNT', 'PENDING', 0, 
      `Crediting ${input.amount} to ${input.toAccount}`);

    const creditStart = Date.now();
    const creditResult = await creditAccount(input.toAccount, input.amount);
    const creditTime = Date.now() - creditStart;

    if (!creditResult.success) {
      await logAuditEvent(workflowId, 'v1', 'CREDIT_ACCOUNT', 'FAILED', creditTime, 
        `Credit failed: ${creditResult.error} | Temporal enables SAGA compensation patterns`);

      // In a real system, would trigger debit reversal here
      await updatePaymentStatus(paymentId, 'FAILED', 'Credit failed - compensation required');

      return {
        success: false,
        paymentId,
        error: 'Account credit failed',
        executionSummary: {
          totalTime: Date.now() - startTime,
          stepsExecuted,
          version: 'Modern v1',
          architecture: 'Temporal Orchestrated'
        }
      };
    }

    await logAuditEvent(workflowId, 'v1', 'CREDIT_ACCOUNT', 'SUCCESS', creditTime, 
      `Account credited | New balance: ${creditResult.newBalance} | Transaction: ${creditResult.transactionId}`);

    // Step 5: Complete payment
    await updatePaymentStatus(paymentId, 'COMPLETED', 'Payment processed successfully via Temporal orchestration');

    const totalTime = Date.now() - startTime;
    await logAuditEvent(
      workflowId, 
      'v1', 
      'PAYMENT_COMPLETED', 
      'SUCCESS', 
      totalTime, 
      `Payment completed successfully | Benefits: Automatic retries, step-level observability, fault tolerance | Duration: ${totalTime}ms`
    );

    return {
      success: true,
      paymentId,
      executionSummary: {
        totalTime,
        stepsExecuted,
        version: 'Modern v1',
        architecture: 'Temporal Orchestrated'
      }
    };

  } catch (error) {
    const totalTime = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    await logAuditEvent(
      workflowId, 
      'v1', 
      'PAYMENT_FAILED', 
      'FAILED', 
      totalTime, 
      `Payment workflow failed: ${errorMessage} | Temporal provides detailed error context`
    );

    return {
      success: false,
      error: errorMessage,
      executionSummary: {
        totalTime,
        stepsExecuted,
        version: 'Modern v1',
        architecture: 'Temporal Orchestrated'
      }
    };
  }
}