import { Client, Connection } from '@temporalio/client';
import { helloWorldWorkflow } from './workflows/hello-workflow';

async function run() {
  try {
    // Create connection to Temporal Cloud
    const connection = await Connection.connect({
      address: process.env.TEMPORAL_ADDRESS!,
      tls: {
        serverName: process.env.TEMPORAL_NAMESPACE!.split('.')[0],
      },
      metadata: {
        'temporal-namespace': process.env.TEMPORAL_NAMESPACE!,
        'authorization': `Bearer ${process.env.TEMPORAL_API_KEY!}`,
      },
    });

    const client = new Client({
      connection,
      namespace: process.env.TEMPORAL_NAMESPACE!,
    });

    console.log('Starting Hello World workflow...');

    // Start workflow
    const handle = await client.workflow.start(helloWorldWorkflow, {
      taskQueue: 'hello-world-queue',
      workflowId: 'hello-world-' + Date.now(),
      args: ['TypeScript World'],
    });

    console.log(`Started workflow: ${handle.workflowId}`);

    // Wait for result
    const result = await handle.result();
    console.log('Workflow result:', result);

    // Close connection
    await connection.close();

  } catch (error) {
    console.error('Client error:', error);
    process.exit(1);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});