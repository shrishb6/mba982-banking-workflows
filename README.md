# Temporal Payment Workflow Prototype

**MBA982 Research Project - IIT Kanpur**  
**Student:** Shrish Bajpai
**Topic:** Orchestration-led Banking Workflow Modernization

## Project Overview

This prototype validates whether orchestration-led, configuration-driven architectures (augmented with AI) can improve the adaptability, observability, and compliance-readiness of banking payment systems compared to traditional monolithic approaches.

## Architecture

- **Temporal Cloud** - Workflow orchestration engine
- **TypeScript** - Type-safe development
- **Replit** - Cloud development environment  
- **MockAPI.io** - Simulated banking services
- **Appsmith** - Low-code UI (planned)

## Four Scenarios Implemented

1. **Legacy v1** - Monolithic payment flow (baseline)
2. **Legacy v2** - Monolithic with fraud check (manual code changes)
3. **Orchestrated v1** - Modular Temporal workflow  
4. **Orchestrated v2** - AI-configurable workflow with UI

## Quick Start

```bash
# Install dependencies
npm install

# Start worker (keep running)
npm run worker

# In separate terminal, run client
npm run client