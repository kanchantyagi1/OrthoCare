function isPlaceholder(value: string | undefined): boolean {
  if (!value) return true;
  const v = value.trim().toLowerCase();
  return v === '' || v.startsWith('sk-placeholder') || v === 'changeme' || v === 'change-me';
}

export default () => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),

  database: {
    url:
      process.env.DATABASE_URL ||
      'postgres://orthocare:orthocare_dev_password@localhost:5432/orthocare',
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'dev-insecure-secret-change-me',
    expiresIn: process.env.JWT_EXPIRES_IN || '12h',
  },

  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
    embeddingModel: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
    embeddingDimension: 1536,
    mockMode: isPlaceholder(process.env.OPENAI_API_KEY),
  },

  fcm: {
    projectId: process.env.FCM_PROJECT_ID,
    clientEmail: process.env.FCM_CLIENT_EMAIL,
    privateKey: process.env.FCM_PRIVATE_KEY,
    mockMode: isPlaceholder(process.env.FCM_PROJECT_ID),
  },

  retention: {
    dataRetentionDays: parseInt(process.env.DATA_RETENTION_DAYS || '30', 10),
    documentRetentionDays: parseInt(process.env.DOCUMENT_RETENTION_DAYS || '3650', 10),
  },

  // Patients have no login, so the chat endpoints are reachable by anyone on the
  // internet with a paid OpenAI model behind them. These caps are the only thing
  // standing between a stranger and the clinic's API bill - keep them conservative.
  patientLimits: {
    sessionsPerWindow: parseInt(process.env.PATIENT_SESSION_RATE_LIMIT || '5', 10),
    sessionWindowMs: parseInt(process.env.PATIENT_SESSION_RATE_TTL_MS || '3600000', 10),
    messagesPerWindow: parseInt(process.env.PATIENT_MESSAGE_RATE_LIMIT || '12', 10),
    messageWindowMs: parseInt(process.env.PATIENT_MESSAGE_RATE_TTL_MS || '60000', 10),
    dailyMessageCap: parseInt(process.env.PATIENT_DAILY_MESSAGE_CAP || '40', 10),
  },

  sla: {
    // A case whose first doctor response took longer than this counts as a breach
    // on the admin dashboard.
    // NURSE_RESPONSE_SLA_MINUTES is still honoured so an already-deployed .env written
    // before the staff rename keeps working instead of silently reverting to the default.
    doctorFirstResponseMinutes: parseInt(
      process.env.DOCTOR_RESPONSE_SLA_MINUTES || process.env.NURSE_RESPONSE_SLA_MINUTES || '15',
      10,
    ),
  },

  rag: {
    topK: parseInt(process.env.RAG_TOP_K || '5', 10),
    // 0.72 is calibrated for real text-embedding-3-small cosine similarities. The mock
    // embedding (used when OPENAI_API_KEY is unset) is a crude bag-of-words hash whose
    // similarity scores run much lower even for genuinely relevant text - see
    // mock-embedding.util.ts - so mock mode defaults much lower unless the operator
    // explicitly sets RAG_SIMILARITY_THRESHOLD themselves.
    similarityThreshold: process.env.RAG_SIMILARITY_THRESHOLD
      ? parseFloat(process.env.RAG_SIMILARITY_THRESHOLD)
      : isPlaceholder(process.env.OPENAI_API_KEY)
        ? 0.25
        : 0.72,
  },
});
