const { getPositiveInteger, sleep } = require('../../utils/common');

const formatToolErrorMessage = (error, source = 'data source') => {
  if (error.code === 'ECONNABORTED') {
    return `${source} request timed out.`;
  }

  if (error.response?.status === 429) {
    return `${source} rate limit reached.`;
  }

  if (error.response?.status) {
    return `${source} request failed with status ${error.response.status}.`;
  }

  return error.message || `${source} request failed.`;
};

module.exports = {
  getPositiveInteger,
  sleep,
  formatToolErrorMessage
};
