// Activity functions run outside the workflow
export async function greet(name: string): Promise<string> {
  console.log(`Activity: Greeting ${name}`);
  return `Hello, ${name}! This is from Temporal TypeScript workflow.`;
}