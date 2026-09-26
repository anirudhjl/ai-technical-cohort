                    ┌──────────────────────┐
                    │      User / UI       │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │ Node.js + TypeScript │
                    │   Agent Orchestrator │
                    └──────────┬───────────┘
                               │
          ┌────────────────────┼────────────────────┐
          ▼                    ▼                    ▼
   Source Agent         Identity Agent       Address Agent
          │                    │                    │
          └────────────────────┼────────────────────┘
                               ▼
                     Reconciliation Agent
                               │
                               ▼
                       Quality Agent
                               │
                               ▼
                      Guardrail Agent
                               │
                    ┌──────────┴──────────┐
                    ▼                     ▼
              Auto-approved          Human Review
                    │                     │
                    └──────────┬──────────┘
                               ▼
                       Master Data Agent
                               │
                               ▼
                    ┌─────────────────────┐
                    │     MCP Layer       │
                    ├─────────────────────┤
                    │ CRM                 │
                    │ MDM                 │
                    │ Databases           │
                    │ File repositories   │
                    │ Validation services │
                    └─────────────────────┘
