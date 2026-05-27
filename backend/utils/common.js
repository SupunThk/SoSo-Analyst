const getPositiveInteger = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const asArray = (value) => (Array.isArray(value) ? value : []);

module.exports = {
  getPositiveInteger,
  sleep,
  asArray
};
