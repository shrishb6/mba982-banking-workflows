// src/activities/banking-activities.ts
import axios from "axios";

// MockAPI base URL - replace with your actual URL
const MOCKAPI_BASE_URL = "https://68358740cd78db2058c203ce.mockapi.io";

// Types for our banking operations
export interface Account {
  id: string;
  accountNumber: string;
  customerId: string;
  balance: number;
  currency: string;
  status: string;
  accountType: string;
  createdAt: string;
}

export interface FraudFlag {
  id: string;
  accountId: string;
  customerId: string;
  riskScore: number;
  isBlocked: boolean;
  riskLevel: string;
  reason: string;
  flaggedAt: string;
}

export interface PaymentRequest {
  id?: string;
  fromAccount: string;
  toAccount: string;
  amount: number;
  currency: string;
  status: string;
  workflowId: string;
  description: string;
  createdAt?: string;
}

export interface AuditLog {
  id?: string;
  workflowId: string;
  workflowVersion: string;
  step: string;
  status: string;
  executionTime: number;
  details: string;
  timestamp?: string;
  actor: string;
}

// Activity: Validate account exists and has sufficient funds
export async function validateAccount(
  accountNumber: string,
  requiredAmount: number,
): Promise<{ isValid: boolean; account?: Account; reason?: string }> {
  console.log(
    `Activity: Validating account ${accountNumber} for amount ${requiredAmount}`,
  );

  try {
    // Get all accounts and find the matching one
    const response = await axios.get<Account[]>(`${MOCKAPI_BASE_URL}/accounts`);
    const accounts = response.data;

    const account = accounts.find((acc) => acc.accountNumber === accountNumber);

    if (!account) {
      return {
        isValid: false,
        reason: `Account ${accountNumber} not found`,
      };
    }

    if (account.status !== "ACTIVE") {
      return {
        isValid: false,
        account,
        reason: `Account ${accountNumber} is ${account.status}`,
      };
    }

    if (account.balance < requiredAmount) {
      return {
        isValid: false,
        account,
        reason: `Insufficient funds. Balance: ${account.balance}, Required: ${requiredAmount}`,
      };
    }

    return {
      isValid: true,
      account,
      reason: "Account validation successful",
    };
  } catch (error) {
    console.error("Account validation failed:", error);
    throw new Error(`Account validation failed: ${error}`);
  }
}

// Activity: Perform fraud check on account/transaction
export async function performFraudCheck(
  accountNumber: string,
  amount: number,
): Promise<{ isBlocked: boolean; riskScore: number; reason: string }> {
  console.log(
    `Activity: Performing fraud check for account ${accountNumber}, amount ${amount}`,
  );

  try {
    // Get fraud flags for the account
    const response = await axios.get<FraudFlag[]>(
      `${MOCKAPI_BASE_URL}/fraud_flags`,
    );
    const fraudFlags = response.data;

    const accountFlag = fraudFlags.find(
      (flag) => flag.accountId === accountNumber,
    );

    if (!accountFlag) {
      // No fraud record = low risk
      return {
        isBlocked: false,
        riskScore: 10,
        reason: "No fraud history - low risk",
      };
    }

    // Additional risk for large amounts
    let adjustedRiskScore = accountFlag.riskScore;
    if (amount > 10000) {
      adjustedRiskScore += 20;
    }

    const isBlocked = accountFlag.isBlocked || adjustedRiskScore > 80;

    return {
      isBlocked,
      riskScore: adjustedRiskScore,
      reason: isBlocked
        ? `High risk detected: ${accountFlag.reason}`
        : `Risk assessment passed - Score: ${adjustedRiskScore}`,
    };
  } catch (error) {
    console.error("Fraud check failed:", error);
    throw new Error(`Fraud check failed: ${error}`);
  }
}

// Activity: Debit the source account (simulate ledger update)
export async function debitAccount(
  accountNumber: string,
  amount: number,
): Promise<{ success: boolean; newBalance: number; transactionId: string }> {
  console.log(`Activity: Debiting ${amount} from account ${accountNumber}`);

  try {
    // Get all accounts
    const response = await axios.get<Account[]>(`${MOCKAPI_BASE_URL}/accounts`);
    const accounts = response.data;

    const account = accounts.find((acc) => acc.accountNumber === accountNumber);
    if (!account) {
      throw new Error(`Account ${accountNumber} not found for debit`);
    }

    if (!account.id) {
      throw new Error(`Account ${accountNumber} missing ID field - cannot update`);
    }

    // Calculate new balance
    const newBalance = account.balance - amount;

    // Update the account balance using PUT with ID
    await axios.put(`${MOCKAPI_BASE_URL}/accounts/${account.id}`, {
      ...account,
      balance: newBalance,
    });

    console.log(`Successfully updated account ${accountNumber} balance from ${account.balance} to ${newBalance}`);

    return {
      success: true,
      newBalance,
      transactionId: `TXN_${Date.now()}`,
    };
  } catch (error) {
    console.error("Account debit failed:", error);
    throw new Error(`Account debit failed: ${error}`);
  }
}

// Activity: Credit the destination account 
export async function creditAccount(
  accountNumber: string,
  amount: number,
): Promise<{ success: boolean; newBalance: number; transactionId: string }> {
  console.log(`Activity: Crediting ${amount} to account ${accountNumber}`);

  try {
    // Get all accounts
    const response = await axios.get<Account[]>(`${MOCKAPI_BASE_URL}/accounts`);
    const accounts = response.data;

    const account = accounts.find((acc) => acc.accountNumber === accountNumber);
    if (!account) {
      throw new Error(`Account ${accountNumber} not found for credit`);
    }

    if (!account.id) {
      throw new Error(`Account ${accountNumber} missing ID field - cannot update`);
    }

    // Calculate new balance (ADD the amount)
    const newBalance = account.balance + amount;

    // Update the account balance using PUT with ID
    await axios.put(`${MOCKAPI_BASE_URL}/accounts/${account.id}`, {
      ...account,
      balance: newBalance,
    });

    console.log(`Successfully credited account ${accountNumber} balance from ${account.balance} to ${newBalance}`);

    return {
      success: true,
      newBalance,
      transactionId: `TXN_${Date.now()}`,
    };
  } catch (error) {
    console.error("Account credit failed:", error);
    throw new Error(`Account credit failed: ${error}`);
  }
}

// Activity: Log audit event for compliance

export async function logAuditEvent(
  workflowId: string,
  version: string,        // ← Changed from workflowVersion to version
  stepName: string,       // ← Changed from step to stepName  
  status: string,         // ← Made more flexible (was strict union)
  duration: number,       // ← Changed from executionTime to duration
  details: string,
): Promise<{ auditId: string }> {
  console.log(
    `📋 AUDIT: ${workflowId} | ${stepName} | ${status} | ${details}`,
  );

  try {
    const auditData = {
      workflowId,
      workflowVersion: version,  // ← Map version to workflowVersion for MockAPI
      step: stepName,            // ← Map stepName to step for MockAPI
      status,
      executionTime: duration,   // ← Map duration to executionTime for MockAPI
      details,
      timestamp: new Date().toISOString(),
      actor: "TEMPORAL_WORKER",
    };

    console.log('📝 Sending audit data:', auditData);

    const response = await axios.post<AuditLog>(
      `${MOCKAPI_BASE_URL}/audit_logs`,
      auditData,
    );

    console.log('✅ Audit logged successfully:', response.data.id);

    return {
      auditId: response.data.id!,
    };
  } catch (error) {
    console.error("💥 Audit logging failed:", error);

    // ✅ CRITICAL: Return success even on failure to prevent Temporal errors
    return { 
      auditId: "AUDIT_FAILED" 
    };
  }
}
// Activity: Create payment request record
export async function createPaymentRequest(
  fromAccount: string,
  toAccount: string,
  amount: number,
  currency: string,
  workflowId: string,
  description: string,
): Promise<{ paymentId: string }> {
  console.log(`Activity: Creating payment request ${workflowId}`);

  try {
    const paymentData: Omit<PaymentRequest, "id"> = {
      fromAccount,
      toAccount,
      amount,
      currency,
      status: "PENDING",
      workflowId,
      description,
    };

    const response = await axios.post<PaymentRequest>(
      `${MOCKAPI_BASE_URL}/payment_requests`,
      paymentData,
    );
    const payment = response.data;

    return {
      paymentId: payment.id!,
    };
  } catch (error) {
    console.error("Payment request creation failed:", error);
    throw new Error(`Payment request creation failed: ${error}`);
  }
}

// Activity: Update payment status
export async function updatePaymentStatus(
  paymentId: string,
  status: string,
  details?: string,
): Promise<void> {
  console.log(`Activity: Updating payment ${paymentId} status to ${status}`);

  try {
    // Get current payment
    const getResponse = await axios.get<PaymentRequest>(
      `${MOCKAPI_BASE_URL}/payment_requests/${paymentId}`,
    );
    const payment = getResponse.data;

    // Update status
    await axios.put(`${MOCKAPI_BASE_URL}/payment_requests/${paymentId}`, {
      ...payment,
      status,
      ...(details && { description: `${payment.description} - ${details}` }),
    });
  } catch (error) {
    console.error("Payment status update failed:", error);
    throw new Error(`Payment status update failed: ${error}`);
  }
}
