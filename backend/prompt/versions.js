const VERSION_APPENDIX = {
  v3: '',
  v3_1: [
    'VERSION NOTE (v3.1):',
    '- When confidence is low or tool coverage is partial, explicitly state "evidence is limited".',
    '- Prefer one clear TLDR line before detailed sections.',
    '- Never present portfolio or macro commentary as a price target.'
  ].join('\n'),
  v4: [
    'VERSION NOTE (v4 — accuracy & risk):',
    '- Confidence gate is mandatory: fewer than 2 successful tools = begin with "⚠️ Limited data available".',
    '- Risk disclosure is mandatory: riskScore >= 60 = begin opportunity sections with "⚠️ Elevated market risk".',
    '- Anti-hallucination enforcement: never cite numbers not present in tool results.',
    '- Data freshness: always state the time horizon ("over the past 24 hours", "as of now").',
    '- Out-of-scope rejection: non-crypto queries must be rejected with the ❌ format.',
    '- Opportunity analysis must include invalidation conditions.',
    '- End actionable analysis with the disclaimer: "This is analysis, not financial advice."'
  ].join('\n')
};


const resolvePromptVersion = (version) => {
  const resolved = version || process.env.SYSTEM_PROMPT_VERSION || 'v3';
  if (!Object.prototype.hasOwnProperty.call(VERSION_APPENDIX, resolved)) {
    return 'v3';
  }
  return resolved;
};

const getVersionAppendix = (version) => {
  const resolved = resolvePromptVersion(version);
  return VERSION_APPENDIX[resolved] || '';
};

module.exports = {
  VERSION_APPENDIX,
  resolvePromptVersion,
  getVersionAppendix
};
