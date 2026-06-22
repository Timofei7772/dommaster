const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const LICENSE_TYPES = {
  standard: { maxPcs: 1, price: 2500 },
  double: { maxPcs: 2, price: 5000 },
  enterprise: { maxPcs: 5, price: 10000 },
};

function canonicalize(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = canonicalize(value[key]);
        return acc;
      }, {});
  }

  return value;
}

function canonicalStringify(value) {
  return JSON.stringify(canonicalize(value));
}

function resolvePrivateKey(input) {
  if (input) {
    return input;
  }

  const envKey = process.env.LICENSE_PRIVATE_KEY;
  if (envKey) {
    return envKey;
  }

  const envPath = process.env.LICENSE_PRIVATE_KEY_FILE;
  if (envPath && fs.existsSync(envPath)) {
    return fs.readFileSync(envPath, 'utf8');
  }

  const generated = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return generated.privateKey;
}

class LicenseGenerator {
  constructor(options = {}) {
    this.privateKey = resolvePrivateKey(options.privateKey);
    this.publicKeyId = options.publicKeyId || 'v1';
    this.chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  }

  generateBlock() {
    return Array.from({ length: 4 }, () => this.chars[Math.floor(Math.random() * this.chars.length)]).join('');
  }

  generateLicense(clientInfo = {}) {
    const licenseType = clientInfo.licenseType || 'standard';
    const plan = LICENSE_TYPES[licenseType];
    if (!plan) {
      throw new Error(`Unsupported license type: ${licenseType}`);
    }

    const isPlus = Boolean(clientInfo.plus);
    const maxPcs = clientInfo.maxPcs || plan.maxPcs;
    const durationDays = Number(clientInfo.durationDays || 365);
    const issuedDate = new Date();
    const expiryDate = new Date(issuedDate.getTime() + durationDays * 24 * 60 * 60 * 1000);
    const licenseKey = `ZARU-${this.generateBlock()}-${this.generateBlock()}-${this.generateBlock()}-${this.generateBlock()}`;

    const payload = {
      license_key: licenseKey,
      client_email: clientInfo.clientEmail || '',
      client_name: clientInfo.clientName || '',
      device_name: clientInfo.deviceName || null,
      device_slot_id: null,
      expiry_date: expiryDate.toISOString(),
      features: {
        export_pdf: isPlus,
        export_excel: true,
        ai_scanner: true,
        ai_requests_limit: null,
      },
      hardware_fingerprint: null,
      is_active: true,
      issued_date: issuedDate.toISOString(),
      license_type: licenseType,
      max_pcs: maxPcs,
      price: plan.price,
      public_key_id: this.publicKeyId,
    };

    const signature = this.signPayload(payload);

    return {
      success: true,
      license_key: licenseKey,
      payload,
      signature,
      price: plan.price,
      qr_code: `smetaai://activate?key=${licenseKey}`,
      activation_url: `https://smetaai.zaru.ru/activate?key=${licenseKey}`,
    };
  }

  signPayload(payload) {
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(canonicalStringify(payload), 'utf8');
    sign.end();
    return sign.sign(this.privateKey, 'hex');
  }
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith('--')) {
      continue;
    }
    const key = item.slice(2);
    const value = argv[index + 1] && !argv[index + 1].startsWith('--') ? argv[index + 1] : 'true';
    result[key] = value;
    if (value !== 'true') {
      index += 1;
    }
  }
  return result;
}

function buildClientInfo(args) {
  return {
    clientName: args.client_name || args.clientName || '',
    clientEmail: args.email || args.client_email || '',
    licenseType: args.license_type || args.licenseType || 'standard',
    durationDays: Number(args.duration || args.duration_days || 365),
    maxPcs: Number(args.max_computers || args.max_pcs || 0) || undefined,
    deviceName: args.device_name || null,
    plus: args.plus === 'true' || args.plus === true,
  };
}

function writeLicenseArtifact(outputDir, result) {
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `${result.license_key}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf8');
  return outputPath;
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const generator = new LicenseGenerator();
  const result = generator.generateLicense(buildClientInfo(args));
  const outputDir = args.output_dir || path.join(__dirname, 'licenses');
  const outputPath = writeLicenseArtifact(outputDir, result);

  process.stdout.write(`${JSON.stringify({ ...result, output_path: outputPath }, null, 2)}\n`);
  return 0;
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = {
  LICENSE_TYPES,
  LicenseGenerator,
  canonicalStringify,
  canonicalize,
  parseArgs,
  main,
};
