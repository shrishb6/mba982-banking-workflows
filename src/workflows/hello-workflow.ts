import { proxyActivities } from '@temporalio/workflow';
import type * as activities from '../activities/hello-activities';

// Create proxy for activities with timeout
const { greet } = proxyActivities<typeof activities>({
  startToCloseTimeout: '1 minute',
});

// Hello World workflow
export async function helloWorldWorkflow(name: string): Promise<string> {
  return await greet(name);
}