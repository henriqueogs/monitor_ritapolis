function estimateTokensFromText(value) {
  const text = String(value || '');
  if (!text) {return 0;}
  return Math.ceil(text.length / 4);
}

module.exports = {
  estimateTokensFromText
};
