const VERSION_APPENDIX = {
  v3: '',
  v3_1: [
    'VERSION NOTE (v3.1):',
    '- When confidence is low or tool coverage is partial, explicitly state "evidence is limited".',
    '- Prefer one clear TLDR line before detailed sections.',
    '- Never present portfolio or macro commentary as a price target.'
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
