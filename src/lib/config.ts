function readEnv(name: string, fallback = "") {
  return process.env[name] ?? fallback;
}

export const config = {
  appUrl: readEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000"),
  supabaseUrl: readEnv("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseServiceRoleKey: readEnv("SUPABASE_SERVICE_ROLE_KEY"),
  feishuAppId: readEnv("FEISHU_APP_ID"),
  feishuAppSecret: readEnv("FEISHU_APP_SECRET"),
  feishuVerificationToken: readEnv("FEISHU_VERIFICATION_TOKEN"),
  feishuEncryptKey: readEnv("FEISHU_ENCRYPT_KEY"),
  llmApiBase: readEnv("LLM_API_BASE", "https://api.openai.com/v1"),
  llmApiKey: readEnv("LLM_API_KEY"),
  llmModelAnalyze: readEnv("LLM_MODEL_ANALYZE", "gpt-4o-mini"),
  llmModelCopy: readEnv("LLM_MODEL_COPY", "gpt-4o-mini"),
  douyinParserBaseUrl: readEnv("DOUYIN_PARSER_BASE_URL"),
  demoSecret: readEnv("DEMO_SECRET", "demo-local"),
};

export function assertServerEnv() {
  const missing = [];
  if (!config.supabaseUrl) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!config.supabaseServiceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (missing.length) {
    throw new Error(`Missing server env: ${missing.join(", ")}`);
  }
}
