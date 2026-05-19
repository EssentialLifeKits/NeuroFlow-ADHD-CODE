/**
 * NeuroFlow — retired diagnostic endpoint.
 *
 * This route used to send open Resend test emails. It is intentionally disabled
 * before launch so production cannot be used as a public email testing endpoint.
 */
module.exports = async function handler(_req, res) {
  res.status(410).json({
    error: 'This diagnostic endpoint has been retired.',
  });
};
