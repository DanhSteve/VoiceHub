const FAILURE_THRESHOLD = Math.max(1, Number(process.env.ORG_SERVICE_CIRCUIT_FAILURES || 3));
const OPEN_MS = Math.max(5000, Number(process.env.ORG_SERVICE_CIRCUIT_OPEN_MS || 30000));

let consecutiveFailures = 0;
let circuitOpenUntil = 0;

function isOpen() {
  if (Date.now() < circuitOpenUntil) return true;
  if (circuitOpenUntil > 0 && Date.now() >= circuitOpenUntil) {
    circuitOpenUntil = 0;
    consecutiveFailures = 0;
  }
  return false;
}

function recordSuccess() {
  consecutiveFailures = 0;
  circuitOpenUntil = 0;
}

function recordFailure() {
  consecutiveFailures += 1;
  if (consecutiveFailures >= FAILURE_THRESHOLD) {
    circuitOpenUntil = Date.now() + OPEN_MS;
  }
}

function createCircuitOpenError() {
  const err = new Error(
    'Dịch vụ tổ chức tạm không khả dụng. Vui lòng thử lại sau vài giây.'
  );
  err.statusCode = 503;
  err.code = 'ORG_SERVICE_CIRCUIT_OPEN';
  return err;
}

module.exports = {
  isOpen,
  recordSuccess,
  recordFailure,
  createCircuitOpenError,
};
