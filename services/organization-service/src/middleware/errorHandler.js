module.exports = (err, req, res, next) => {
  console.error('Error:', err);
  const statusCode = Number(err?.statusCode) || 500;
  const isServerError = statusCode >= 500;
  const safeMessage = isServerError
    ? 'Hệ thống tạm thời gặp sự cố. Vui lòng thử lại sau.'
    : String(err?.message || 'Yêu cầu không hợp lệ');
  const code = String(err?.code || err?.errorCode || (isServerError ? 'ORG_INTERNAL_ERROR' : '')).trim();

  res.status(statusCode).json({
    status: statusCode >= 500 ? 'error' : 'fail',
    message: safeMessage,
    ...(code ? { code } : {}),
    messageUser: safeMessage,
  });
};
