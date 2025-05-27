// src/workflows/modern-payment-v1.ts
// Modern v1: Temporal orchestrated workflow (no fraud check)
import { proxyActivities } from '@temporalio/workflow';
import type * as activities from '../activities/banking-activities';

// Create proxy for activities with timeout and retry policies
const {
  validateAccount,
  debitAccount,
  initiateSettlement,
  createPaymentRequest,
  updatePaymentStatus,
  logAuditEvent
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '2 minutes',
  retry: {
    initialInterval: '1s',
    maximumInterval: '30s',
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
  settlementId?: string;
  error?: string;
  executionSummary: {
    totalTime: number;
    stepsExecuted: string[];
    version: string;
    architecture: string;
  };
}

// Modern v1 Workflow: Temporal orchestrated, modular, observable (no fraud check)
export async function modernPaymentV1Workflow(input: PaymentInput): Promise<PaymentResult> {
  const startTime = Date.now();
  const workflowId = `modern-v1-${Date.now()}`;
  const stepsExecuted: string[] = [];

  try {
    // Step 1: Create payment request with structured logging
    stepsExecuted.push('CREATE_PAYMENT_REQUEST');
    await logAuditEvent(
      workflowId, 
      'v1', 
      'CREATE_PAYMENT_REQUEST', 
      'PENDING', 
      0, 
      `Starting modern orchestrated payment v1 - From: ${input.fromAccount}, To: ${input.toAccount}, Amount: ${input.amount} ${input.currency}`
    );

    const { paymentId } = await createPaymentRequest(
      input.fromAccount,
      input.toAccount,
      input.amount,
      input.currency,
      workflowId,
      `${input.description} (Modern Orchestrated v1)`
    );

    await logAuditEvent(workflowId, 'v1', 'CREATE_PAYMENT_REQUEST', 'SUCCESS', Date.now() - startTime, `Payment request created: ${paymentId} | Temporal provides automatic retries and durability`);

    // Step 2: Validate source account (with automatic retry via Temporal)
    stepsExecuted.push('VALIDATE_ACCOUNT');
    await logAuditEvent(workflowId, 'v1', 'VALIDATE_ACCOUNT', 'PENDING', 0, `Validating account ${input.fromAccount} with Temporal retry policies`);

    const stepStart = Date.now();
    const validation = await validateAccount(input.fromAccount, input.amount);
    const stepTime = Date.now() - stepStart;

    if (!validation.isValid) {
      await logAuditEvent(workflowId, 'v1', 'VALIDATE_ACCOUNT', 'FAILED', stepTime, `Validation failed: ${validation.reason} | Temporal automatically logged failure`);
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

    await logAuditEvent(workflowId, 'v1', 'VALIDATE_ACCOUNT', 'SUCCESS', stepTime, `Account validated: ${validation.account!.accountNumber} | Balance: ${validation.account!.balance} | Temporal ensures step-level observability`);

    // Step 3: Debit source account (fault-tolerant via Temporal)
    stepsExecuted.push('DEBIT_ACCOUNT');
    await logAuditEvent(workflowId, 'v1', 'DEBIT_ACCOUNT', 'PENDING', 0, `Debiting ${input.amount} from ${input.fromAccount} | Temporal handles transactional integrity`);

    const debitStart = Date.now();
    const debitResult = await debitAccount(input.fromAccount, input.amount);
    const debitTime = Date.now() - debitStart;

    if (!debitResult.success) {
      await logAuditEvent(workflowId, 'v1', 'DEBIT_ACCOUNT', 'FAILED', debitTime, `Account debit failed | Temporal workflow can implement compensation logic`);
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

    await logAuditEvent(workflowId, 'v1', 'DEBIT_ACCOUNT', 'SUCCESS', debitTime, `Account debited successfully | New balance: ${debitResult.newBalance} | Transaction ID: ${debitResult.transactionId} | Temporal provides full audit trail`);

    // Step 4: Initiate settlement (with network resilience)
    stepsExecuted.push('INITIATE_SETTLEMENT');
    await logAuditEvent(workflowId, 'v1', 'INITIATE_SETTLEMENT', 'PENDING', 0, `Initiating settlement for payment ${paymentId} | Temporal manages external service calls`);

    const settlementStart = Date.now();
    const settlement = await initiateSettlement(paymentId, input.amount, input.currency);
    const settlementTime = Date.now() - settlementStart;

    await logAuditEvent(workflowId, 'v1', 'INITIATE_SETTLEMENT', 'SUCCESS', settlementTime, `Settlement initiated successfully | Network: ${settlement.networkReference} | Temporal ensures reliable external integration`);

    // Step 5: Update payment status to completed
    await updatePaymentStatus(paymentId, 'COMPLETED', `Settlement: ${settlement.networkReference} - Processed via Temporal orchestration`);

    // Final audit log with orchestration benefits
    const totalTime = Date.now() - startTime;
    await logAuditEvent(
      workflowId, 
      'v1', 
      'WORKFLOW_COMPLETED', 
      'SUCCESS', 
      totalTime, 
      `Modern orchestrated payment completed successfully | Benefits: Automatic retries, step-level observability, fault tolerance, durable execution | Total execution time: ${totalTime}ms`
    );

    return {
      success: true,
      paymentId,
      settlementId: settlement.settlementId,
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
      'WORKFLOW_FAILED', 
      'FAILED', 
      totalTime, 
      `Modern orchestrated workflow failed: ${errorMessage} | Temporal provides detailed error context and recovery options`
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