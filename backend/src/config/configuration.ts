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
