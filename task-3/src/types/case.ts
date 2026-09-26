import { z } from "zod";

export const SourceSystemSchema = z.enum([
  "crm_export",
  "onekey_feed",
  "license_board",
  "rep_form",
]);
export type SourceSystem = z.infer<typeof SourceSystemSchema>;

export const RawAddressSchema = z.object({
  line1: z.string(),
  line2: z.string().optional(),
  city: z.string(),
  state: z.string(),
  postalCode: z.string(),
  country: z.string().default("US"),
});
export type RawAddress = z.infer<typeof RawAddressSchema>;

export const SourceRecordSchema = z.object({
  sourceId: z.string(),
  sourceSystem: SourceSystemSchema,
  receivedAt: z.string(),
  hcpNameRaw: z.string(),
  npi: z.string().optional(),
  specialty: z.string().optional(),
  address: RawAddressSchema,
  freeTextNote: z.string().optional(),
});
export type SourceRecord = z.infer<typeof SourceRecordSchema>;

export const IdentitySchema = z.object({
  candidateHcpId: z.string().optional(),
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string()),
});

export const AddressStateSchema = z.object({
  raw: RawAddressSchema,
  standardized: RawAddressSchema.optional(),
  validationFlags: z.array(z.string()),
});

export const ReconciliationSchema = z.object({
  status: z.enum(["match", "variation", "conflict", "not_applicable"]),
  details: z.array(z.string()),
});

export const QualityScoreSchema = z.object({
  value: z.number().min(0).max(1),
  band: z.enum(["auto", "review", "reject"]),
  ruleTrace: z.array(z.string()),
});

export const GuardrailCheckSchema = z.object({
  rule: z.string(),
  passed: z.boolean(),
  note: z.string().optional(),
});

export const HumanApprovalSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  approver: z.string(),
  role: z.literal("data_steward"),
  reason: z.string().min(1),
  timestamp: z.string(),
});

export const FinalActionSchema = z.object({
  type: z.enum([
    "create_master_record",
    "update_address",
    "no_action",
    "rejected_no_action",
  ]),
  appliedAt: z.string(),
  masterRecordVersion: z.string().optional(),
});

export const AuditEntrySchema = z.object({
  timestamp: z.string(),
  agent: z.string(),
  skill: z.string().optional(),
  tool: z.string().optional(),
  evidence: z.string().optional(),
  decision: z.string(),
});
export type AuditEntry = z.infer<typeof AuditEntrySchema>;

export const CaseStatusSchema = z.enum([
  "intake",
  "processing",
  "awaiting_approval",
  "approved",
  "rejected",
  "completed",
  "blocked",
]);
export type CaseStatus = z.infer<typeof CaseStatusSchema>;

export const WorkflowCaseRecordSchema = z.object({
  caseId: z.string(),
  status: CaseStatusSchema,
  request: z.object({
    sourceSystem: SourceSystemSchema,
    receivedAt: z.string(),
    rawPayload: SourceRecordSchema,
  }),
  identity: IdentitySchema,
  address: AddressStateSchema,
  reconciliation: ReconciliationSchema,
  qualityScore: QualityScoreSchema,
  guardrailChecks: z.array(GuardrailCheckSchema),
  humanApproval: HumanApprovalSchema.optional(),
  finalAction: FinalActionSchema.optional(),
  auditTrail: z.array(AuditEntrySchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type WorkflowCaseRecord = z.infer<typeof WorkflowCaseRecordSchema>;

export const HcpMasterRecordSchema = z.object({
  hcpId: z.string(),
  name: z.string(),
  npi: z.string(),
  specialty: z.string(),
  currentAddress: RawAddressSchema,
  addressHistory: z.array(
    z.object({
      address: RawAddressSchema,
      sourceSystem: SourceSystemSchema,
      sourceTimestamp: z.string(),
      recordedAt: z.string(),
      caseId: z.string().optional(),
      version: z.number().int().positive(),
    }),
  ),
});
export type HcpMasterRecord = z.infer<typeof HcpMasterRecordSchema>;
