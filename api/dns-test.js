const dns = require('dns').promises;
module.exports = async function(req, res) {
  try {
    const result = await dns.lookup('unvizd5j.us-east.insforge.app');
    res.json({ ok: true, address: result.address });
  } catch(e) {
    res.status(500).json({ error: String(e), code: e.code });
  }
};
